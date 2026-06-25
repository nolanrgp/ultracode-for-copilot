import vscode from 'vscode';
import { logger } from '../../logger';
import { getAgent, getAgents } from './agents';
import { runParallelAgents } from './runner';
import { runCrossReviews } from './review';
import { runSynthesis } from './synthesis';

export interface WorkflowPlan {
	summary: string;
	phases: Array<{
		name: string;
		agents: string[];
		parallel: boolean;
		prompt: string;
	}>;
}

/**
 * Main Ultra Mode entry point. Called when thinkingEffort === 'ultra'.
 *
 * Flow:
 * 1. Orchestrator analyzes prompt → creates WorkflowPlan
 * 2. For each phase: run agents in parallel → collect outputs
 * 3. Cross-review: agents critique each other's outputs
 * 4. Synthesis: Orchestrator compiles final integrated response
 */
export async function runUltraWorkflow(
	userPrompt: string,
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
): Promise<void> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: No model available.'));
		return;
	}

	progress.report(new vscode.LanguageModelTextPart('\n\n🔵 Ultra Mode — Orchestrating...\n\n'));

	// === PHASE 1: Orchestrator creates workflow plan ===
	const orchestrator = getAgent('orchestrator')!;
	const plan = await createWorkflowPlan(orchestrator, userPrompt, model, token);
	if (!plan) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: Failed to create workflow plan.'));
		return;
	}

	progress.report(new vscode.LanguageModelTextPart(
		`📋 **Workflow Plan:** ${plan.summary}\n\n` +
		plan.phases.map((p, i) => `  Phase ${i + 1}: **${p.name}** [${p.agents.join(', ')}]${p.parallel ? ' (parallel)' : ''}`).join('\n') +
		'\n\n---\n\n',
	));

	// === PHASE 2: Execute phases ===
	const phaseResults = new Map<string, Awaited<ReturnType<typeof runParallelAgents>>>();
	let allResults: Awaited<ReturnType<typeof runParallelAgents>> = [];

	for (const phase of plan.phases) {
		progress.report(new vscode.LanguageModelTextPart(
			`\n🤖 **Phase: ${phase.name}** — agents working...\n\n`,
		));

		const agents = getAgents(phase.agents);
		const results = await runParallelAgents(agents, phase.prompt, token);

		for (const r of results) {
			progress.report(new vscode.LanguageModelTextPart(
				`  ${r.agent.emoji} **${r.agent.name}** (${r.duration}ms):\n  ${r.output.slice(0, 200)}...\n\n`,
			));
		}

		phaseResults.set(phase.name, results);
		allResults = allResults.concat(results);

		if (token.isCancellationRequested) break;
	}

	// === PHASE 3: Cross-review ===
	if (allResults.length >= 2) {
		progress.report(new vscode.LanguageModelTextPart('\n🔄 **Cross-Review** — agents reviewing each other...\n\n'));

		const reviews = await runCrossReviews(allResults, token);

		for (const [, feedbacks] of reviews) {
			for (const fb of feedbacks) {
				progress.report(new vscode.LanguageModelTextPart(`  ${fb.slice(0, 300)}...\n\n`));
			}
		}

		if (token.isCancellationRequested) return;

		// === PHASE 4: Synthesis ===
		progress.report(new vscode.LanguageModelTextPart('\n---\n\n🎯 **Orchestrator Synthesis:**\n\n'));

		await runSynthesis(userPrompt, phaseResults, reviews, progress, token);
	} else {
		// Single agent — skip cross-review, just present output
		progress.report(new vscode.LanguageModelTextPart('\n---\n\n🎯 **Result:**\n\n'));
		for (const r of allResults) {
			progress.report(new vscode.LanguageModelTextPart(r.output));
		}
	}
}

async function createWorkflowPlan(
	orchestrator: ReturnType<typeof getAgent>,
	prompt: string,
	model: vscode.LanguageModelChat,
	token: vscode.CancellationToken,
): Promise<WorkflowPlan | null> {
	try {
		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(
				`${orchestrator!.systemPrompt}\n\nUSER REQUEST:\n${prompt}\n\nCreate a workflow plan. Output ONLY valid JSON.`,
			)],
			{},
			token,
		);

		let text = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				text += part.value;
			}
		}

		// Extract JSON from response
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]) as WorkflowPlan;
		}
		return null;
	} catch (err) {
		logger.error('Ultra workflow plan creation failed', err);
		return null;
	}
}
