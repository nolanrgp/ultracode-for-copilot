import vscode from 'vscode';
import { getEffortEnabled } from '../config';
import { ULTRACODE_MODEL_ID } from '../consts';
import { t } from '../i18n';
import { logger } from '../logger';

/**
 * Ultracode Chat Provider — implements vscode.LanguageModelChatProvider.
 * Provides a single "Ultracode" model with an "ultracode" reasoning effort level.
 */
export class UltracodeChatProvider implements vscode.LanguageModelChatProvider {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private isActive = true;

	readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		context.subscriptions.push(
			this.onDidChangeEmitter,
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('ultracode-copilot')) {
					this.onDidChangeEmitter.fire();
				}
			}),
		);
	}

	// ---- Model information ----

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) return [];

		return [
			{
				id: ULTRACODE_MODEL_ID,
				name: 'Ultracode',
				family: 'ultracode',
				version: '1.0.0',
				maxInputTokens: 655360,
				maxOutputTokens: 393216,
				capabilities: {
					toolCalling: true,
					imageInput: false,
				},
			} as vscode.LanguageModelChatInformation,
		];
	}

	// ---- Token count ----

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		const str = typeof text === 'string' ? text : JSON.stringify(text);
		return Math.ceil(str.length / 4);
	}

	// ---- Chat response ----

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const modelId = modelInfo.id ?? ULTRACODE_MODEL_ID;
		const reasoningEffort =
			((options as unknown as Record<string, unknown>)?.reasoningEffort as string) ?? 'high';

		if (reasoningEffort === 'ultracode' && getEffortEnabled()) {
			const planMode = detectPlanMode(messages);
			const prompt = buildUltracodePrompt(planMode);
			const notice = planMode ? t('ultracode.notice.planMode') : t('ultracode.notice.actMode');
			logger.info(`Ultracode: ${notice} prompt=${prompt.length}chars`);
		}

		logger.info(`Ultracode: model=${modelId} effort=${reasoningEffort}`);

		// Stub: full pipeline comes in Phase 2
		progress.report(
			new vscode.LanguageModelTextPart(
				`Ultracode — effort: ${reasoningEffort}. Full pipeline in Phase 2.`,
			),
		);
	}

	// ---- Public API ----

	refreshModelPicker(): void {
		this.onDidChangeEmitter.fire();
	}

	prepareForDeactivate(): void {
		this.isActive = false;
		this.onDidChangeEmitter.fire();
	}
}

// ---- Ultracode helpers ----

function detectPlanMode(messages: readonly vscode.LanguageModelChatRequestMessage[]): boolean {
	const systemMsg = messages.find((m) => (m.role as number) === 3);
	if (!systemMsg) return false;
	const text = systemMsg.content
		.map((p) => (p instanceof vscode.LanguageModelTextPart ? p.value : ''))
		.join('');
	return /PLANNING AGENT/.test(text) || /NEVER start implementation/.test(text);
}

function buildUltracodePrompt(planMode: boolean): string {
	const base =
		'You are an expert AI programming assistant in ULTRACODE mode. ' +
		'Think deeply, reason step by step, review your own work for correctness. ' +
		'Follow the project conventions and instructions from the manifest.';
	if (planMode) {
		return (
			base +
			' You are in PLAN MODE. Explore codebase thoroughly. ' +
			'Create detailed implementation plans. Do NOT write code.'
		);
	}
	return (
		base +
		' You are in ACT MODE. Execute the plan. ' +
		'Write production-quality code. Verify against the plan and conventions.'
	);
}
