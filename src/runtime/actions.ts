import vscode from 'vscode';
import { SHOW_LOGS_URI_PATH } from '../consts';
import { logger } from '../logger';

export function registerActionUrls(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.window.registerUriHandler({
			handleUri(uri) {
				if (uri.path === SHOW_LOGS_URI_PATH) {
					logger.show();
					return;
				}
				logger.warn(`Unhandled Ultracode URI: ${uri.toString(true)}`);
			},
		}),
	);
}
