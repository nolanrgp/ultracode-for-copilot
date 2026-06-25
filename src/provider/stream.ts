import vscode from 'vscode';
import { logger } from '../logger';
import type { UltracodeToolCall } from '../types';
import type { PreparedChatRequest } from './request';

export interface StreamChatCompletionOptions {
	prepared: PreparedChatRequest;
	progress: vscode.Progress<vscode.LanguageModelResponsePart>;
	token: vscode.CancellationToken;
}

export async function streamChatCompletion(options: StreamChatCompletionOptions): Promise<void> {
	const { prepared, progress, token } = options;

	// Report initial notice if any
	if (prepared.initialNotice) {
		progress.report(new vscode.LanguageModelTextPart(prepared.initialNotice));
	}
	if (prepared.budgetWarning) {
		progress.report(new vscode.LanguageModelTextPart(prepared.budgetWarning));
	}

	let hasContent = false;

	await prepared.client.streamChatCompletion(
		prepared.request,
		{
			onContent: (content) => {
				hasContent = true;
				progress.report(new vscode.LanguageModelTextPart(content));
			},
			onThinking: (text) => {
				progress.report(new vscode.LanguageModelTextPart(`[thinking] ${text}`));
			},
			onToolCall: (toolCall: UltracodeToolCall) => {
				hasContent = true;
				progress.report(
					new vscode.LanguageModelToolCallPart(
						toolCall.id,
						toolCall.function.name,
						JSON.parse(toolCall.function.arguments || '{}') as object,
					),
				);
			},
			onError: (error) => {
				logger.error('Stream error:', error);
				if (!hasContent) {
					progress.report(new vscode.LanguageModelTextPart(`Error: ${error.message}`));
				}
			},
			onDone: () => {
				logger.debug('Stream completed');
			},
		},
		token,
	);
}
