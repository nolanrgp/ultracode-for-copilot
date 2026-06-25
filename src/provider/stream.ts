import vscode from 'vscode';
import { getShowReflection } from '../config';
import { logger } from '../logger';
import { RequestComplexity, type UltracodeService } from './ultracode';
import type { PreparedChatRequest } from './request';

export interface StreamChatCompletionOptions {
	prepared: PreparedChatRequest;
	result: { complexity: RequestComplexity; initialNotice?: string };
	progress: vscode.Progress<vscode.LanguageModelResponsePart>;
	token: vscode.CancellationToken;
	service: UltracodeService;
}

export async function streamChatCompletion(options: StreamChatCompletionOptions): Promise<void> {
	const { prepared, progress, token, service } = options;
	const { delegateModel, messages } = prepared;

	try {
		const response = await delegateModel.sendRequest(messages, {}, token);

		let fullResponse = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				fullResponse += part.value;
				progress.report(part);
			}
		}

		if (service.shouldReflect(fullResponse, options.result.complexity, 0)) {
			const showReflection = getShowReflection();
			if (showReflection) {
				progress.report(new vscode.LanguageModelTextPart('\n\n---\n🔄 Ultracode: self-review in progress...\n'));
			}

			const reflectionPrompt = service.generateReflectionPrompt();
			const reflMessages = [
				vscode.LanguageModelChatMessage.User(`Previous response:\n${fullResponse}\n\n${reflectionPrompt}`),
			];

			try {
				const reflResp = await delegateModel.sendRequest(reflMessages, {}, token);
				for await (const part of reflResp.stream) {
					if (part instanceof vscode.LanguageModelTextPart) {
						progress.report(part);
					}
				}
				progress.report(new vscode.LanguageModelTextPart('\n\n✅ Ultracode: review complete'));
			} catch (err) {
				logger.warn('Ultracode reflection failed', err);
			}
		}
	} catch (err) {
		logger.error('Ultracode stream failed', err);
		progress.report(new vscode.LanguageModelTextPart(
			`Ultracode error: ${err instanceof Error ? err.message : String(err)}`,
		));
	}
}
