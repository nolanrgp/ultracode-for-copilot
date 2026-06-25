import vscode from 'vscode';
import type { UltracodeMessage } from '../types';
import { LANGUAGE_MODEL_CHAT_SYSTEM_ROLE } from '../consts';

/**
 * Convert VS Code chat messages to API format.
 * Optionally injects an ultracode system prompt at the beginning.
 */
export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	ultracodeSystemPrompt?: string,
): UltracodeMessage[] {
	const result: UltracodeMessage[] = [];

	// Inject ultracode system prompt as first message when provided
	if (ultracodeSystemPrompt) {
		result.push({ role: 'system', content: ultracodeSystemPrompt });
	}

	for (const message of messages) {
		const role = mapRole(message.role);
		let content = '';
		let thinkingContent = '';

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				content += part.value;
			} else if (part instanceof vscode.LanguageModelThinkingPart) {
				const val = part.value;
				thinkingContent += Array.isArray(val) ? val.join('') : val;
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				// Tool result — use string representation
				content += JSON.stringify(part);
			}
		}

		if (content || thinkingContent) {
			const msg: UltracodeMessage = { role, content };
			if (thinkingContent) {
				msg.reasoning_content = thinkingContent;
			}
			result.push(msg);
		}
	}

	return result;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
	const r = role as number;
	if (r === LANGUAGE_MODEL_CHAT_SYSTEM_ROLE) return 'system';
	if (r === 1) return 'user';
	if (r === 2) return 'assistant';
	return 'user';
}
