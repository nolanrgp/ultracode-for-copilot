/**
 * Lightweight i18n module — English only, zero dependencies.
 */

type Translations = Record<string, string>;

const en: Translations = {
	// Effort level
	'ultracode.effort.label': 'Ultracode',
	'ultracode.effort.description':
		'Deep reasoning with manifest, planning, and self-review. Inspired by Claude Code Ultracode.',

	// Notices
	'ultracode.notice.planMode': '🟡 Ultracode Plan — exploring & planning',
	'ultracode.notice.actMode': '🟢 Ultracode Act — implementing',
	'ultracode.notice.reflection': '🔄 Ultracode: self-review in progress...',
	'ultracode.notice.reflectionDone': '✅ Ultracode: review complete',

	// Budget
	'ultracode.budget.warning': '⚠️ Token budget at {0}% ({1}/{2}) — consider starting a new session',
	'ultracode.budget.title': 'Ultracode Session Budget',
	'ultracode.budget.input': 'Input: {0} tokens',
	'ultracode.budget.output': 'Output: {0} tokens',
	'ultracode.budget.total': 'Total: {0} tokens',

	// Commands
	'ultracode.command.showBudget': 'Ultracode: Show Session Budget',
	'ultracode.command.resetBudget': 'Ultracode: Reset Session Budget',

	// Settings descriptions
	'ultracode.setting.effortEnabled': 'Enable Ultracode effort mode enhancements',
	'ultracode.setting.maxReflectionRounds': 'Maximum self-review rounds per message',
	'ultracode.setting.budgetThreshold': 'Token budget warning threshold (0.0-1.0)',
	'ultracode.setting.manifestPath': 'Path to manifest file (AGENTS.md)',
	'ultracode.setting.showReflection': 'Show internal reflection turns in chat',

	// Model description
	'ultracode.model.description':
		'Ultracode — Claude Code-style deep reasoning effort mode with manifest, planning, and self-review.',

	// Extension lifecycle
	'extension.activated': 'Ultracode activated',
	'extension.deactivated': 'Ultracode deactivated',
};

/**
 * Look up a translated string by key. Supports {0}, {1}, ... placeholders.
 */
export function t(key: string, ...args: (string | number)[]): string {
	const text = en[key] ?? key;
	let result = text;
	for (let i = 0; i < args.length; i++) {
		result = result.replace(`{${i}}`, String(args[i]));
	}
	return result;
}
