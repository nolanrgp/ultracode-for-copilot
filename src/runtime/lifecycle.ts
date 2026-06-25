import vscode from 'vscode';
import { t } from '../i18n';
import { logger } from '../logger';
import { registerCommands } from './commands';
import { registerProvider } from './provider';
import { showWelcomeIfNeeded } from './welcome';

let activeProvider: import('../provider').UltracodeChatProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerCommands(context);

	try {
		const provider = await registerProvider(context);
		activeProvider = provider;

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
	try {
		activeProvider?.prepareForDeactivate();
	} catch (error) {
		logger.warn('Deactivate error', error);
	} finally {
		logger.info(t('extension.deactivated'));
		logger.dispose();
	}
}
