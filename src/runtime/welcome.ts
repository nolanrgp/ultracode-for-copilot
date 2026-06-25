import vscode from 'vscode';
import { WALKTHROUGH_ID, WELCOME_SHOWN_KEY } from '../consts';

export async function showWelcomeIfNeeded(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get<boolean>(WELCOME_SHOWN_KEY)) {
		return;
	}

	await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);
	await context.globalState.update(WELCOME_SHOWN_KEY, true);
}
