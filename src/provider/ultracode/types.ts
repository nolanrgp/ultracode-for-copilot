/**
 * Ultracode subsystem types.
 */

export interface UltracodeManifest {
	commands: string[];
	conventions: string[];
	architecture: string[];
	rawContent: string;
}

export interface UltracodeContext {
	manifest: UltracodeManifest | null;
	planModeDetected: boolean;
	complexity: RequestComplexity;
}

export interface UltracodeTransformResult {
	systemPrompt: string;
	initialNotice?: string;
	budgetWarning?: string;
	complexity: RequestComplexity;
}

export enum RequestComplexity {
	simple = 'simple',
	moderate = 'moderate',
	complex = 'complex',
	veryComplex = 'very_complex',
}

export interface BudgetState {
	totalInput: number;
	totalOutput: number;
	lastReset: number;
}

export interface BudgetTracker {
	recordUsage(usage: { inputTokens: number; outputTokens: number }): void;
	getSessionUsage(): { totalInput: number; totalOutput: number };
	isApproachingLimit(threshold: number): boolean;
	formatWarning(): string;
	reset(): void;
}
