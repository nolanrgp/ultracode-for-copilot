import type vscode from 'vscode';
import type { UltracodeClient } from '../client';
import type { UltracodeRequest } from '../types';
import { convertMessages } from './convert';

export interface PreparedChatRequest {
	client: UltracodeClient;
	request: UltracodeRequest;
	initialNotice?: string;
	budgetWarning?: string;
}

export interface PrepareChatRequestOptions {
	client: UltracodeClient;
	modelId: string;
	messages: readonly vscode.LanguageModelChatRequestMessage[];
	reasoningEffort: string;
	ultracodeSystemPrompt?: string;
	initialNotice?: string;
	budgetWarning?: string;
	tools?: readonly vscode.LanguageModelChatTool[];
}

export function prepareChatRequest(options: PrepareChatRequestOptions): PreparedChatRequest {
	const { client, modelId, messages, reasoningEffort, ultracodeSystemPrompt } = options;

	// Convert messages, injecting ultracode system prompt if provided
	const apiMessages = convertMessages(messages, ultracodeSystemPrompt);

	const request: UltracodeRequest = {
		model: modelId,
		messages: apiMessages,
		stream: true,
		stream_options: { include_usage: true },
	};

	// Apply reasoning effort
	if (reasoningEffort === 'none') {
		request.thinking = { type: 'disabled' };
	} else if (
		reasoningEffort === 'high' ||
		reasoningEffort === 'max' ||
		reasoningEffort === 'ultracode'
	) {
		request.thinking = { type: 'enabled' };
		request.reasoning_effort =
			reasoningEffort === 'ultracode' ? 'max' : (reasoningEffort as 'high' | 'max');
	}

	return {
		client,
		request,
		initialNotice: options.initialNotice,
		budgetWarning: options.budgetWarning,
	};
}
