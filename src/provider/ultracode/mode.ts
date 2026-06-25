import vscode from 'vscode';
import { getEffortEnabled, getManifestPath } from '../../config';
import { logger } from '../../logger';
import { COMPLEXITY_PATTERNS, ULTRACODE_ACT_PROMPT, ULTRACODE_PLAN_PROMPT, ULTRACODE_SYSTEM_PROMPT } from './consts';
import { loadManifest, manifestToSystemPrompt } from './manifest';
import { RequestComplexity, type UltracodeTransformResult } from './types';

export interface UltracodeService {
	init(context: vscode.ExtensionContext): void;
	resolve(messages: readonly vscode.LanguageModelChatRequestMessage[], reasoningEffort: string): UltracodeTransformResult;
	shouldReflect(lastResponse: string, complexity: RequestComplexity, currentRound: number): boolean;
	generateReflectionPrompt(): string;
}

export function createUltracodeService(): UltracodeService {
	let _ctx: vscode.ExtensionContext | null = null;

	return {
		init(context) {
			_ctx = context;
		},

		resolve(messages, reasoningEffort) {
			if (reasoningEffort !== 'ultracode' || !getEffortEnabled()) {
				return { systemPrompt: '', complexity: RequestComplexity.simple };
			}

			const workspaceRoot = getWorkspaceRoot();
			const manifestPath = getManifestPath();
			const manifest = workspaceRoot ? loadManifest(workspaceRoot, manifestPath) : null;
			const planMode = detectPlanMode(messages);
			const complexity = classifyComplexity(messages);

			const systemPrompt = buildUltracodePrompt(manifest, planMode);
			const initialNotice = planMode
				? '\n\n🟡 Ultracode Plan — exploring & planning'
				: '\n\n🟢 Ultracode Act — implementing';

			logger.info(`Ultracode: planMode=${planMode} complexity=${complexity} manifest=${manifest ? 'loaded' : 'none'}`);

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

function detectPlanMode(messages: readonly vscode.LanguageModelChatRequestMessage[]): boolean {
	const systemMsg = messages.find((m) => (m.role as number) === 3);
	if (!systemMsg) return false;
	const text = systemMsg.content
		.map((p) => (p instanceof vscode.LanguageModelTextPart ? p.value : ''))
		.join('');
	return /PLANNING AGENT/.test(text) || /NEVER start implementation/.test(text) || /Plan.*mode/.test(text);
}

function classifyComplexity(messages: readonly vscode.LanguageModelChatRequestMessage[]): RequestComplexity {
	const text = messages
		.map((m) => m.content.map((p) => (p instanceof vscode.LanguageModelTextPart ? p.value : '')).join(''))
		.join('\n');

	for (const pattern of COMPLEXITY_PATTERNS.veryComplex) {
		if (pattern.test(text)) return RequestComplexity.veryComplex;
	}
	for (const pattern of COMPLEXITY_PATTERNS.complex) {
		if (pattern.test(text)) return RequestComplexity.complex;
	}
	for (const pattern of COMPLEXITY_PATTERNS.moderate) {
		if (pattern.test(text)) return RequestComplexity.moderate;
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
