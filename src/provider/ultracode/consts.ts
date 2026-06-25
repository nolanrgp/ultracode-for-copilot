/**
 * Ultracode compile-time constants.
 */

export const ULTRACODE_SYSTEM_PROMPT = `You are an expert AI programming assistant in ULTRACODE mode.
Think deeply, reason step by step, and review your own work for correctness.
Follow the project conventions and instructions from the manifest.
Write production-quality, well-tested code.`;

export const ULTRACODE_PLAN_PROMPT = `You are in PLAN MODE. Explore the codebase thoroughly.
Create detailed implementation plans. Do NOT write code.
Ask clarifying questions when needed.`;

export const ULTRACODE_ACT_PROMPT = `You are in ACT MODE. Execute the plan.
Write production-quality code. Verify against the plan and conventions.
Run tests and confirm everything works.`;

export const REFLECTION_PROMPT = `[Ultracode Self-Review]
Review your last response carefully:
1. Are there edge cases not handled?
2. Can the code be simpler or clearer?
3. Are there any bugs, logic errors, or security issues?
4. Is the implementation complete per the plan?
If issues found → fix them. If not → confirm "Review complete — no issues found."`;

export const COMPLEXITY_PATTERNS = {
	veryComplex: [
		/refactor\s+(entire|whole|full)/i,
		/implement\s+(new\s+)?(system|architecture|framework)/i,
		/migrate\s+(from|to|entire)/i,
		/rewrite\s+(everything|all|entire)/i,
	],
	complex: [
		/refactor/i,
		/implement\s+(new\s+)?feature/i,
		/add\s+(support\s+for|integration)/i,
		/create\s+(new\s+)?(module|component|service)/i,
	],
	moderate: [
		/fix\s+(bug|issue)/i,
		/update\s+(dependency|package)/i,
		/optimize/i,
		/add\s+(test|validation)/i,
	],
};

export const MAX_REFLECTION_ROUNDS = 2;
export const DEFAULT_BUDGET_WARNING_THRESHOLD = 0.8;
