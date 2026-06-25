import vscode from 'vscode';
import { CONFIG_SECTION } from './consts';

/**
 * Ultracode extension settings — all reads go through typed accessors here.
 * No API endpoint or model ID defaults — extension is pure enhancement layer.
 */

export type DebugMode = 'minimal' | 'metadata' | 'verbose';

export function getDebugMode(): DebugMode {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const mode = config.get<string>('debugMode') as DebugMode | undefined;
	if (mode === 'metadata' || mode === 'verbose') return mode;
	return config.get<boolean>('debug', false) ? 'metadata' : 'minimal';
}

export function getDebugLoggingEnabled(): boolean {
	return getDebugMode() !== 'minimal';
}

export function getRequestDumpEnabled(): boolean {
	return getDebugMode() === 'verbose';
}

// ---- Ultracode effort settings ----

export function getEffortEnabled(): boolean {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<boolean>('effort.enabled', true);
}

export function getMaxReflectionRounds(): number {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<number>('effort.maxReflectionRounds', 2);
}

export function getBudgetWarningThreshold(): number {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<number>('effort.budgetWarningThreshold', 0.8);
}

export function getShowReflection(): boolean {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<boolean>('effort.showReflection', false);
}

export function getManifestPath(): string {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	return config.get<string>('manifest.path', 'AGENTS.md');
}

export async function migrateLegacyDebugSetting(): Promise<void> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	const legacy = config.inspect<boolean>('debug');
	if (legacy?.globalValue !== undefined || legacy?.workspaceValue !== undefined) {
		await config.update('debug', undefined, vscode.ConfigurationTarget.Global);
		await config.update('debug', undefined, vscode.ConfigurationTarget.Workspace);
	}
}
