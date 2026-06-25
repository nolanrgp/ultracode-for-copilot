import vscode from 'vscode';

export interface ConvertedMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	ultracodeSystemPrompt?: string,
): ConvertedMessage[] {
	const result: ConvertedMessage[] = [];

	if (ultracodeSystemPrompt) {
		result.push({ role: 'system', content: ultracodeSystemPrompt });
	}

	for (const message of messages) {
		const role = mapRole(message.role);
		let content = '';

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				content += part.value;
			}
		}

		if (content) {
			result.push({ role, content });
		}
	}

	return result;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
	const r = role as number;
	if (r === 3) return 'system';
	if (r === 1) return 'user';
	if (r === 2) return 'assistant';
	return 'user';
}
