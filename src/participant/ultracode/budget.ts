import type vscode from 'vscode';
import type { BudgetState, BudgetTracker } from './types';

const SESSION_KEY = 'ultracode.sessionBudget';

export function createBudgetTracker(context: vscode.ExtensionContext): BudgetTracker {
	const load = (): BudgetState => {
		return context.workspaceState.get<BudgetState>(SESSION_KEY) ?? {
			totalInput: 0,
			totalOutput: 0,
			lastReset: Date.now(),
		};
	};

	const save = (state: BudgetState): Thenable<void> => {
		return context.workspaceState.update(SESSION_KEY, state);
	};

	return {
		recordUsage(usage) {
			const state = load();
			state.totalInput += usage.inputTokens;
			state.totalOutput += usage.outputTokens;
			void save(state);
		},

		getSessionUsage() {
			const state = load();
			return { totalInput: state.totalInput, totalOutput: state.totalOutput };
		},

		isApproachingLimit(threshold) {
			const state = load();
			const total = state.totalInput + state.totalOutput;
			// Warning when approaching context limit (rough estimate: 200k tokens)
			const limit = 200000;
			return total / limit >= threshold;
		},

		formatWarning() {
			const state = load();
			const total = state.totalInput + state.totalOutput;
			const pct = Math.round((total / 200000) * 100);
			return `\n\n⚠️ Ultracode session budget: ${pct}% used (${total.toLocaleString()} tokens)`;
		},

		reset() {
			void save({ totalInput: 0, totalOutput: 0, lastReset: Date.now() });
		},
	};
}
