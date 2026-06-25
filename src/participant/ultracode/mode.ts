import vscode from 'vscode';
import { getEffortEnabled, getManifestPath } from '../../config';
import { logger } from '../../logger';
import { COMPLEXITY_PATTERNS, ULTRACODE_ACT_PROMPT, ULTRACODE_PLAN_PROMPT, ULTRACODE_SYSTEM_PROMPT } from './consts';
import { loadManifest, manifestToSystemPrompt } from './manifest';
import { RequestComplexity, type UltracodeTransformResult } from './types';

export interface UltracodeService {
	resolve(request: vscode.ChatRequest, context: vscode.ChatContext): UltracodeTransformResult;
	shouldReflect(lastResponse: string, complexity: RequestComplexity, currentRound: number): boolean;
	generateReflectionPrompt(): string;
}

export function createUltracodeService(_ctx: vscode.ExtensionContext): UltracodeService {
	return {
		resolve(request, context) {
			if (!getEffortEnabled()) {
				return { systemPrompt: request.prompt, complexity: RequestComplexity.simple };
			}

			const workspaceRoot = getWorkspaceRoot();
			const manifestPath = getManifestPath();
			const manifest = workspaceRoot ? loadManifest(workspaceRoot, manifestPath) : null;
			const planMode = detectPlanMode(context);
			const complexity = classifyComplexity(request.prompt);

			const systemPrompt = buildUltracodePrompt(manifest, planMode);
			const initialNotice = planMode
				? '\n\n🟡 Ultracode Plan — exploring & planning'
				: '\n\n🟢 Ultracode Act — implementing';

			logger.info(
				`Ultracode resolved: planMode=${planMode} complexity=${complexity} manifest=${manifest ? 'loaded' : 'none'}`,
			);

			return { systemPrompt, initialNotice, complexity };
		},

		shouldReflect(lastResponse, complexity, currentRound) {
			if (currentRound >= 2) return false;
			if (complexity === RequestComplexity.simple) return false;
			return lastResponse.includes('```') || lastResponse.length > 500;
		},

		generateReflectionPrompt() {
			return `[Ultracode Self-Review]
Review your last response carefully:
1. Are there edge cases not handled?
2. Can the code be simpler or clearer?
3. Are there any bugs, logic errors, or security issues?
4. Is the implementation complete per the plan?
If issues found → fix them. If not → confirm "Review complete — no issues found."`;
		},
	};
}

function detectPlanMode(context: vscode.ChatContext): boolean {
	return context.history.some(
		(turn) =>
			turn instanceof vscode.ChatRequestTurn &&
			/plan/i.test((turn as vscode.ChatRequestTurn).prompt),
	);
}

function classifyComplexity(prompt: string): RequestComplexity {
	for (const pattern of COMPLEXITY_PATTERNS.veryComplex) {
		if (pattern.test(prompt)) return RequestComplexity.veryComplex;
	}
	for (const pattern of COMPLEXITY_PATTERNS.complex) {
		if (pattern.test(prompt)) return RequestComplexity.complex;
	}
	for (const pattern of COMPLEXITY_PATTERNS.moderate) {
		if (pattern.test(prompt)) return RequestComplexity.moderate;
	}
	return RequestComplexity.simple;
}

function buildUltracodePrompt(manifest: import('./types').UltracodeManifest | null, planMode: boolean): string {
	const parts: string[] = [ULTRACODE_SYSTEM_PROMPT];
	parts.push(planMode ? ULTRACODE_PLAN_PROMPT : ULTRACODE_ACT_PROMPT);
	if (manifest) {
		parts.push(manifestToSystemPrompt(manifest));
	}
	return parts.join('\n\n');
}

function getWorkspaceRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
