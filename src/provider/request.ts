import vscode from 'vscode';
import { logger } from '../logger';
import { convertMessages } from './convert';

export interface PreparedChatRequest {
	messages: vscode.LanguageModelChatMessage[];
	delegateModel: vscode.LanguageModelChat;
	initialNotice?: string;
}

export interface PrepareChatRequestOptions {
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	reasoningEffort: string;
	ultracodeSystemPrompt?: string;
	initialNotice?: string;
	token: vscode.CancellationToken;
}

export async function prepareChatRequest(
	options: PrepareChatRequestOptions,
): Promise<PreparedChatRequest | null> {
	const apiMessages = convertMessages(options.messages, options.ultracodeSystemPrompt);

	const delegateMessages: vscode.LanguageModelChatMessage[] = [];
	for (const msg of apiMessages) {
		if (msg.role === 'system' || msg.role === 'user') {
			delegateMessages.push(vscode.LanguageModelChatMessage.User(msg.content));
		} else if (msg.role === 'assistant') {
			delegateMessages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
		}
	}

	// Select a Copilot model to delegate to (not ourselves)
	const allModels = await vscode.lm.selectChatModels();
	const delegateModel = allModels?.find((m) => (m as unknown as { family?: string }).family !== 'ultracode');
	if (!delegateModel) {
		logger.warn('Ultracode: no non-ultracode model found for delegation');
		return null;
	}

	logger.info(`Ultracode delegating to: ${delegateModel.name}`);

	return {
		messages: delegateMessages,
		delegateModel,
		initialNotice: options.initialNotice,
	};
}
