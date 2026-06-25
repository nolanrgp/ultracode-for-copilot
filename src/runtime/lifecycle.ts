import vscode from 'vscode';
import { t } from '../i18n';
import { logger } from '../logger';
import { UltracodeChatParticipant } from '../participant';
import { registerCommands } from './commands';
import { showWelcomeIfNeeded } from './welcome';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerCommands(context);

	try {
		const participant = new UltracodeChatParticipant();
		participant.init(context);

		const chatParticipant = vscode.chat.createChatParticipant(
			'ultracode',
			(request, chatContext, stream, token) =>
				participant.handleRequest(request, chatContext, stream, token),
		);
		chatParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');
		context.subscriptions.push(chatParticipant);

		void showWelcomeIfNeeded(context).catch((error) => {
			logger.warn('Welcome display failed', error);
		});

		logger.info(t('extension.activated'));
	} catch (error) {
		logger.error('Failed to activate Ultracode', error);
		void vscode.window.showErrorMessage('Ultracode activation failed');
		throw error;
	}
}

export function deactivate(): void {
	logger.info(t('extension.deactivated'));
	logger.dispose();
}
