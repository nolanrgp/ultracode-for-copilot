import vscode from 'vscode';
import { logger } from '../logger';
import { UltracodeChatProvider } from '../provider';

export async function registerProvider(
	context: vscode.ExtensionContext,
): Promise<UltracodeChatProvider> {
	const provider = new UltracodeChatProvider(context);

	context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('ultracode', provider));

	await activateCopilotChat();
	provider.refreshModelPicker();

	return provider;
}

async function activateCopilotChat(): Promise<void> {
	try {
		await vscode.extensions.getExtension('github.copilot-chat')?.activate();
	} catch (error) {
		logger.warn('Copilot Chat activation unavailable; model picker refresh may be delayed', error);
	}
}
