import vscode from 'vscode';
import { logger } from '../../logger';
import { buildWorkspaceContext, type AgentRole } from './agents';
import { runCrossReviews } from './review';
import { runParallelAgents } from './runner';
import { runSynthesis } from './synthesis';

export interface WorkflowPlan {
	summary: string;
	agents: AgentRole[];
	phases: Array<{
		name: string;
		agents: string[];
		parallel: boolean;
		prompt: string;
	}>;
}

const ORCHESTRATOR_PROMPT = `You are the Orchestrator for Ultra Mode.

You have FULL SOURCE CODE CONTEXT below. Use it to create agents that produce REAL, SPECIFIC output — not generic analysis.

1. ANALYZE the source code and project type
2. CREATE 2-3 agents (MUST HAVE 2+ agents per phase for parallel execution).
   Each agent gets a tailored systemPrompt referencing ACTUAL files and code patterns found in the context.
3. BUILD 1-3 phases. CRITICAL: assign 2+ agents to at least one phase for parallelism.
4. Each phase prompt must reference SPECIFIC files, classes, or patterns from the context.
   Example: "Refactor the AuthManager class in src/auth.ts to add JWT refresh support"

Output ONLY valid JSON:
{
  "summary": "one-line summary",
  "agents": [
    {"id":"impl-1","name":"Backend Specialist","emoji":"⚙️","systemPrompt":"You are a backend specialist for this TypeScript VS Code extension. Focus on src/provider/ and src/runtime/. Reference actual classes like DeepSeekChatProvider."},
    {"id":"impl-2","name":"Code Reviewer","emoji":"🔍","systemPrompt":"You review TypeScript code for this VS Code extension. Check for type safety, API correctness, and VS Code API compliance."}
  ],
  "phases": [
    {"name":"Implement","agents":["impl-1","impl-2"],"parallel":true,"prompt":"Implement the requested feature in src/provider/index.ts. Reference the existing provideLanguageModelChatResponse method."}
  ]
}`;

export async function runUltraWorkflow(
	userPrompt: string,
	_messages: readonly vscode.LanguageModelChatRequestMessage[],
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
): Promise<void> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: No model available.'));
		return;
	}

	progress.report(new vscode.LanguageModelTextPart('\n\n🔵 Ultra Mode — Orchestrating...\n\n'));

	const plan = await createWorkflowPlan(userPrompt, model, token);
	if (!plan) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: Failed to create plan.'));
		return;
	}

	const agentMap = new Map<string, AgentRole>();
	for (const a of plan.agents) agentMap.set(a.id, a);

	progress.report(new vscode.LanguageModelTextPart(
		`📋 **Plan:** ${plan.summary}\n` +
		`🧑‍🤝‍🧑 **Team:** ${plan.agents.map((a) => `${a.emoji} ${a.name}`).join(' | ')}\n\n` +
		plan.phases.map((p, i) =>
			`  Phase ${i + 1}: **${p.name}** [${p.agents.join(', ')}]${p.parallel ? ' ⚡parallel' : ''}`
		).join('\n') +
		'\n\n---\n\n',
	));

	// Execute phases
	const phaseResults = new Map<string, Awaited<ReturnType<typeof runParallelAgents>>>();
	let allResults: Awaited<ReturnType<typeof runParallelAgents>> = [];
	let totalFailed = 0;

	for (const phase of plan.phases) {
		progress.report(new vscode.LanguageModelTextPart(`\n🤖 **${phase.name}** — executing...\n\n`));

		const agents = phase.agents.map((id) => agentMap.get(id)).filter(Boolean) as AgentRole[];
		const results = await runParallelAgents(agents, phase.prompt, token);

		let phaseSucceeded = 0;
		let phaseFailed = 0;

		for (const r of results) {
			const isFail = r.output.startsWith('[Failed');
			if (isFail) {
				phaseFailed++;
				totalFailed++;
				progress.report(new vscode.LanguageModelTextPart(`  ❌ ${r.agent.emoji} **${r.agent.name}**: ${r.output}\n\n`));
			} else {
				phaseSucceeded++;
				const preview = r.output.length > 250 ? r.output.slice(0, 250) + '...' : r.output;
				progress.report(new vscode.LanguageModelTextPart(
					`  ✅ ${r.agent.emoji} **${r.agent.name}** (${r.duration}ms, ${r.attempts} attempts):\n  ${preview}\n\n`,
				));
			}
		}

		// Abort phase if >50% agents failed
		if (agents.length > 0 && phaseFailed > agents.length / 2) {
			progress.report(new vscode.LanguageModelTextPart(
				`\n⚠️ **${phase.name} ABORTED** — ${phaseFailed}/${agents.length} agents failed.\n\n`,
			));
			continue;
		}

		phaseResults.set(phase.name, results);
		allResults = allResults.concat(results);
		if (token.isCancellationRequested) break;
	}

	// Cross-review + Synthesis
	const validResults = allResults.filter((r) => !r.output.startsWith('[Failed'));
	if (validResults.length >= 2) {
		progress.report(new vscode.LanguageModelTextPart('\n🔄 **Cross-Review**...\n\n'));
		const reviews = await runCrossReviews(validResults, token);

		for (const [, feedbacks] of reviews) {
			for (const fb of feedbacks) {
				progress.report(new vscode.LanguageModelTextPart(`  ${fb.slice(0, 300)}...\n\n`));
			}
		}
		if (token.isCancellationRequested) return;

		progress.report(new vscode.LanguageModelTextPart('\n🎯 **Orchestrator — Final Result:**\n\n'));
		await runSynthesis(userPrompt, phaseResults, reviews, progress, token);
	} else if (validResults.length === 1) {
		progress.report(new vscode.LanguageModelTextPart('\n🎯 **Result:**\n\n'));
		progress.report(new vscode.LanguageModelTextPart(validResults[0].output));
	} else {
		progress.report(new vscode.LanguageModelTextPart(
			`\n❌ **All agents failed** (${totalFailed} failures). The model may be refusing these tasks. Try a different model or rephrase your request.\n`,
		));
	}
}

async function createWorkflowPlan(
	prompt: string,
	model: vscode.LanguageModelChat,
	token: vscode.CancellationToken,
): Promise<WorkflowPlan | null> {
	try {
		const ctx = buildWorkspaceContext();
		const requestPrompt = `${ORCHESTRATOR_PROMPT}\n\n=== WORKSPACE CONTEXT ===\n${ctx || '(empty)'}\n\n=== USER REQUEST ===\n${prompt}\n\nCreate plan. Output ONLY valid JSON.`;
		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(requestPrompt)],
			{}, token,
		);
		let text = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) text += part.value;
		}
		const m = text.match(/\{[\s\S]*\}/);
		return m ? JSON.parse(m[0]) as WorkflowPlan : null;
	} catch (err) {
		logger.error('Ultra plan failed', err);
		return null;
	}
}
