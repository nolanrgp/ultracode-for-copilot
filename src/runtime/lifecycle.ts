import vscode from 'vscode';
import { t } from '../i18n';
import { logger } from '../logger';
import { UltracodeChatProvider } from '../provider';
import { registerActionUrls } from './actions';
import { registerCommands } from './commands';
import { registerProvider } from './provider';
import { showWelcomeIfNeeded } from './welcome';

let activeProvider: UltracodeChatProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	registerCommands(context);
	registerActionUrls(context);

	try {
		const provider = await registerProvider(context);
		activeProvider = provider;

		void showWelcomeIfNeeded(context, provider).catch((error) => {
			logger.warn('Welcome display failed', error);
		});

		logger.info(t('extension.activated'));
	} catch (error) {
		activeProvider = undefined;
		logger.error('Failed to activate Ultracode extension', error);
		void vscode.window.showErrorMessage(t('extension.activated') + ' failed');
		throw error;
	}
}

export async function deactivate(): Promise<void> {
	try {
		activeProvider?.prepareForDeactivate();
	} catch (error) {
		logger.warn('Deactivate error', error);
	} finally {
		logger.info(t('extension.deactivated'));
		logger.dispose();
	}
}
