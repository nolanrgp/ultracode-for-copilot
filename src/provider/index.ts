import vscode from 'vscode';
import { t } from '../i18n';
import { logger } from '../logger';
import { prepareChatRequest } from './request';
import { streamChatCompletion } from './stream';
import { createUltracodeService } from './ultracode';

export class UltracodeChatProvider implements vscode.LanguageModelChatProvider {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	private isActive = true;
	private service = createUltracodeService();

	readonly onDidChangeLanguageModelChatInformation = this.onDidChangeEmitter.event;

	constructor(context: vscode.ExtensionContext) {
		this.service.init(context);
		context.subscriptions.push(
			this.onDidChangeEmitter,
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('ultracode-copilot')) {
					this.onDidChangeEmitter.fire();
				}
			}),
		);
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.isActive) return [];
		return [{
			id: 'ultracode',
			name: 'Ultracode',
			family: 'ultracode',
			version: '1.0.0',
			maxInputTokens: 200000,
			maxOutputTokens: 32000,
			capabilities: { toolCalling: true, imageInput: false },
			configurationSchema: {
				type: 'object',
				properties: {
					reasoningEffort: {
						type: 'string',
						enum: ['none', 'high', 'max', 'ultracode'],
						default: 'high',
						description: t('ultracode.effort.description'),
					},
				},
			},
		}] as unknown as vscode.LanguageModelChatInformation[];
	}

	async provideTokenCount(
		_model: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		const str = typeof text === 'string' ? text : JSON.stringify(text);
		return Math.ceil(str.length / 4);
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const effort = (options as unknown as Record<string, unknown>)?.modelConfiguration as Record<string, unknown> | undefined;
		const reasoningEffort = (effort?.reasoningEffort as string) ?? 'high';

		logger.info(`Ultracode: effort=${reasoningEffort}`);

		// Resolve Ultracode context
		const result = this.service.resolve(messages, reasoningEffort);

		// Report notice
		if (result.initialNotice) {
			progress.report(new vscode.LanguageModelTextPart(result.initialNotice));
		}

		// Prepare request with ultracode system prompt + delegate to Copilot model
		const prepared = await prepareChatRequest({
			messages,
			reasoningEffort,
			ultracodeSystemPrompt: result.systemPrompt,
			initialNotice: result.initialNotice,
			token,
		});

		if (!prepared) {
			progress.report(new vscode.LanguageModelTextPart('Ultracode: No Copilot model available. Select a model first.'));
			return;
		}

		// Stream + budget + reflection
		await streamChatCompletion({
			prepared,
			result,
			progress,
			token,
			service: this.service,
		});
	}

	refreshModelPicker(): void {
		this.onDidChangeEmitter.fire();
	}

	prepareForDeactivate(): void {
		this.isActive = false;
		this.onDidChangeEmitter.fire();
	}
}
