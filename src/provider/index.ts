import vscode from 'vscode';
import { AuthManager } from '../auth';
import { getStabilizeToolListEnabled } from '../config';
import { MODELS } from '../consts';
import { t } from '../i18n';
import { logger } from '../logger';
import { createCacheDiagnosticsRecorder, dumpProviderInput } from './debug';
import { getConfiguredThinkingEffort, toChatInfo, type ModelConfigurationOptions } from './models';
import { BalanceCurrencyResolver } from './pricing/currency';
import { prepareChatRequest } from './request';
import { classifyProviderRequest } from './routing';
import { resolveConversationSegment } from './segment';
import { streamChatCompletion } from './stream';
import { estimateTokenCount } from './tokens';
import { processToolFlow } from './tools/flow';
import { buildWorkspaceContext } from './ultra/agents';
import { createVisionService } from './vision';

/**
 * DeepSeek Chat Provider — implements vscode.LanguageModelChatProvider so
 * DeepSeek V4 models appear directly in the Copilot Chat model picker.
 */
export class DeepSeekChatProvider implements vscode.LanguageModelChatProvider {
	private readonly authManager: AuthManager;
	private readonly globalStorageUri: vscode.Uri;
	private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
	private isActive = true;

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	private readonly cacheDiagnostics = createCacheDiagnosticsRecorder();

	/** Vision proxy: internal bridge + VS Code LM fallback. */
	private readonly vision: ReturnType<typeof createVisionService>;
	private readonly balanceCurrencyResolver: BalanceCurrencyResolver;

	/**
	 * Adaptive chars-per-token ratio, calibrated from actual usage data.
	 * Updated via exponential moving average each time the API reports real token counts.
	 */
	private charsPerToken = 4.0;

	constructor(context: vscode.ExtensionContext) {
		this.authManager = new AuthManager(context);
		this.globalStorageUri = context.globalStorageUri;
		this.vision = createVisionService(context);
		this.balanceCurrencyResolver = new BalanceCurrencyResolver(context, this.authManager, () =>
			this.onDidChangeLanguageModelChatInformationEmitter.fire(),
		);

		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			// Settings-based fallback API key + base URL changes.
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('deepseek-copilot.apiKey') ||
					e.affectsConfiguration('deepseek-copilot.baseUrl')
				) {
					this.invalidateCurrencyAndRefreshModels();
				}
			}),
			// Multi-window: SecretStorage changes don't fire onDidChangeConfiguration.
			// When another window sets/clears the API key, refresh this window's
			// model picker so the warning state stays in sync.
			context.secrets.onDidChange((e) => {
				if (e.key === 'deepseek-copilot.apiKey') {
					this.invalidateCurrencyAndRefreshModels();
				}
			}),
		);
	}

	// ---- Public commands ----

	async configureApiKey(): Promise<void> {
		const saved = await this.authManager.promptForApiKey();
		if (saved) {
			this.invalidateCurrencyAndRefreshModels();
		}
	}

	async clearApiKey(): Promise<void> {
		await this.authManager.deleteApiKey();
		this.invalidateCurrencyAndRefreshModels();
		vscode.window.showInformationMessage(t('auth.removed'));
	}

	async hasApiKey(): Promise<boolean> {
		return this.authManager.hasApiKey();
	}

	/** Force Copilot Chat to re-query model information (including configurationSchema). */
	refreshModelPicker(): void {
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
	}

	private invalidateCurrencyAndRefreshModels(): void {
		void this.balanceCurrencyResolver
			.invalidate()
			.catch((error) => logger.warn('Failed to invalidate DeepSeek balance currency', error))
			.finally(() => this.onDidChangeLanguageModelChatInformationEmitter.fire());
	}

	async prepareForDeactivate(): Promise<void> {
		this.isActive = false;
		this.onDidChangeLanguageModelChatInformationEmitter.fire();

		// Force the host to re-pull `provideLanguageModelChatInformation` synchronously
		// before the extension unloads. With `isActive = false` we now return [],
		// which makes Copilot Chat drop DeepSeek models from the picker immediately
		// instead of leaving stale entries behind after deactivate. The returned
		// model list itself is unused — we only call this for its side effect.
		try {
			await vscode.lm.selectChatModels({ vendor: 'deepseek' });
		} catch (error) {
			logger.warn('Failed to refresh DeepSeek models during deactivate', error);
		}
	}

	async setVisionModel(): Promise<void> {
		await this.vision.openConfiguration();
	}

	// ---- LanguageModelChatProvider ----

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) {
			return [];
		}

		const hasKey = await this.authManager.hasApiKey();
		const pricingCurrency = this.balanceCurrencyResolver.getDisplayCurrency();
		if (hasKey) {
			this.balanceCurrencyResolver.refreshInBackground();
		}
		return MODELS.map((model) => toChatInfo(model, hasKey, pricingCurrency));
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const segment = resolveConversationSegment(messages);
		const requestKind = classifyProviderRequest({
			messages,
			tools: options.tools,
		});

		dumpProviderInput({
			globalStorageUri: this.globalStorageUri,
			segment,
			modelInfo,
			messages,
			requestOptions: options,
			requestKind,
		});

		const toolFlow = processToolFlow({
			stabilizeToolList: getStabilizeToolListEnabled(),
			messages,
			tools: options.tools,
			progress,
			requestKind,
		});
		if (toolFlow.preflightHandled) {
			return;
		}

		// Ultra Mode: inject orchestrator plan into messages, let Copilot execute with tools
		const configuredEffort = getConfiguredThinkingEffort(options as ModelConfigurationOptions);
		if (configuredEffort === 'ultra') {
			const planMessage = await createUltraPlan(toolFlow.messages, progress, token);
			if (planMessage) {
				// Inject plan as the first message so Copilot's agent sees it and executes with tools
				const planPart = new vscode.LanguageModelTextPart(planMessage);
				const augmentedMessages = [...toolFlow.messages];
				if (augmentedMessages.length > 0) {
					augmentedMessages[0] = {
						...augmentedMessages[0],
						content: [planPart, ...augmentedMessages[0].content],
					} as vscode.LanguageModelChatRequestMessage;
				}
				toolFlow.messages = augmentedMessages;
			}
		}

		const prepared = await prepareChatRequest({
			authManager: this.authManager,
			globalStorageUri: this.globalStorageUri,
			modelInfo,
			segment,
			messages: toolFlow.messages,
			options,
			token,
			cacheDiagnostics: this.cacheDiagnostics,
			getVisionDescriber: () => this.vision.get(),
		});

		return streamChatCompletion({
			prepared,
			progress,
			token,
			initialResponseNotice: joinInitialResponseNotices(
				toolFlow.initialResponseNotice,
				prepared.initialResponseNotice,
			),
			getCharsPerToken: () => this.charsPerToken,
			setCharsPerToken: (charsPerToken) => {
				this.charsPerToken = charsPerToken;
			},
		});
	}

	async provideTokenCount(
		_modelInfo: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		return estimateTokenCount(text, this.charsPerToken);
	}
}

function joinInitialResponseNotices(...notices: (string | undefined)[]): string | undefined {
	const joined = notices.filter((notice) => notice && notice.trim().length > 0).join('\n');
	return joined || undefined;
}

async function createUltraPlan(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
): Promise<string | null> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) return null;

	const userPrompt = extractUserPrompt(messages);
	const ctx = buildWorkspaceContext();

	const orchestratorPrompt = `You are the Ultra Mode Orchestrator. Analyze the workspace context and user request, then create a detailed EXECUTION PLAN for Copilot's agent to follow.

WORKSPACE CONTEXT:
${ctx || '(no context available)'}

USER REQUEST:
${userPrompt}

Create a plan with:
1. ANALYSIS — what needs to be done, key files
2. STEPS — numbered, concrete steps (read X, modify Y, create Z)
3. CONSTRAINTS — important rules to follow
4. VERIFICATION — how to confirm completion

Output clear markdown. Do NOT implement — Copilot will execute.`;

	try {
		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(orchestratorPrompt)],
			{}, token,
		);
		let text = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) text += part.value;
		}

		progress.report(new vscode.LanguageModelTextPart('\n\n🔵 **Ultra Plan:**\n' + text + '\n\n---\n⏳ Executing...\n\n'));
		return '\n\n🔵 **ULTRA MODE PLAN — Follow these instructions:**\n\n' + text + '\n\n---\n\nNow execute this plan step by step.';
	} catch (err) {
		logger.error('Ultra plan failed', err);
		return null;
	}
}

function extractUserPrompt(messages: readonly vscode.LanguageModelChatRequestMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 1) {
			return messages[i].content
				.map((p) => (p instanceof vscode.LanguageModelTextPart ? p.value : ''))
				.join('');
		}
	}
	return '';
}
