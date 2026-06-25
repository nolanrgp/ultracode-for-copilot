import vscode from 'vscode';
import { getDebugMode, migrateLegacyDebugSetting } from '../config';
import { CONFIG_SECTION } from '../consts';
import { logger } from '../logger';

export async function initializeDiagnostics(context: vscode.ExtensionContext): Promise<void> {
	try {
		await migrateLegacyDebugSetting();
	} catch (error) {
		logger.warn('Failed to migrate legacy debug setting', error);
	}

	logger.info(
		`Ultracode v=${context.extension.packageJSON.version}` +
			` vscode=${vscode.version}` +
			` platform=${process.platform}` +
			` debugMode=${getDebugMode()}`,
	);

	let currentDebugMode = getDebugMode();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(`${CONFIG_SECTION}.debugMode`)) {
				const previous = currentDebugMode;
				currentDebugMode = getDebugMode();
				logger.info(`debugMode changed: ${previous} -> ${currentDebugMode}`);
			}
		}),
	);
}
