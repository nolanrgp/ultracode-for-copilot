import vscode from 'vscode';
import { t } from '../i18n';
import { logger } from '../logger';

export function registerCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('ultracode-copilot.showLogs', () => logger.show()),
		vscode.commands.registerCommand('ultracode-copilot.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', 'ultracode-copilot'),
		),
		vscode.commands.registerCommand('ultracode-copilot.showBudget', () =>
			vscode.window.showInformationMessage(t('ultracode.budget.title')),
		),
		vscode.commands.registerCommand('ultracode-copilot.resetBudget', () => {
			vscode.window.showInformationMessage('Ultracode session budget reset.');
		}),
	);
}
