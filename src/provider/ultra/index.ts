import vscode from 'vscode';
import { logger } from '../../logger';
import { buildWorkspaceContext, type AgentRole } from './agents';
import { runCrossReviews } from './review';
import { runParallelAgents } from './runner';
import { runSynthesis } from './synthesis';

/**
 * Dynamic WorkflowPlan — agents are DEFINED by the AI,
 * not hardcoded. The Orchestrator analyzes the project context
 * and creates custom agents tailored to the task.
 */
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

Analyze the WORKSPACE CONTEXT and USER REQUEST below, then:

1. DETECT the project type (FE/BE/fullstack/data/ML/mobile/etc.)
2. CREATE 3-5 custom agents — define each with id, name, emoji, and a detailed systemPrompt.
   The systemPrompt must reference specific technologies found in the project.
   Examples by project type:
   - Backend: "API Designer", "Database Expert", "Security Reviewer", "DevOps Engineer"
   - Frontend: "Component Architect", "CSS/UI Expert", "State Manager", "Accessibility"
   - Fullstack: "Backend Architect", "Frontend Architect", "API Designer", "DB Expert"
   - Data/ML: "Data Engineer", "ML Architect", "Pipeline Designer", "Model Evaluator"
   - Mobile: "iOS Specialist", "Android Specialist", "API Designer", "UX Designer"
3. BUILD 2-4 workflow phases assigning agents to each phase.
   Research-heavy tasks need a "Research" phase first.
   Implementation tasks need a "Design" then "Review" phase.

Output ONLY valid JSON:
{
  "summary": "one-line task summary",
  "agents": [
    {"id":"api-designer","name":"API Designer","emoji":"🔌","systemPrompt":"You are an API designer for Node.js/Express..."},
    {"id":"db-expert","name":"Database Expert","emoji":"🗄️","systemPrompt":"You are a PostgreSQL expert..."}
  ],
  "phases": [
    {"name":"Research","agents":["api-designer","db-expert"],"parallel":true,"prompt":"Research the current system and identify requirements for..."},
    {"name":"Design","agents":["api-designer"],"prompt":"Design the API endpoints and data models for..."},
    {"name":"Review","agents":["db-expert"],"prompt":"Review the design for data integrity and performance..."}
  ]
}`;

/**
 * Main Ultra Mode entry point. Called when thinkingEffort === 'ultra'.
 *
 * Flow:
 * 1. Orchestrator analyzes project context + prompt → creates dynamic WorkflowPlan
 * 2. For each phase: run agents in parallel → collect outputs
 * 3. Cross-review: agents critique each other's outputs
 * 4. Synthesis: Orchestrator compiles final integrated response
 */
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

	// === PHASE 1: Orchestrator creates dynamic workflow plan ===
	const plan = await createWorkflowPlan(userPrompt, model, token);
	if (!plan) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: Failed to create workflow plan.'));
		return;
	}

	// Build agent lookup from plan
	const agentMap = new Map<string, AgentRole>();
	for (const a of plan.agents) {
		agentMap.set(a.id, a);
	}

	progress.report(new vscode.LanguageModelTextPart(
		`📋 **Workflow Plan:** ${plan.summary}\n\n` +
		`🧑‍🤝‍🧑 **Team:** ${plan.agents.map((a) => `${a.emoji} ${a.name}`).join(' | ')}\n\n` +
		plan.phases.map((p, i) => `  Phase ${i + 1}: **${p.name}** [${p.agents.join(', ')}]${p.parallel ? ' (parallel)' : ''}`).join('\n') +
		'\n\n---\n\n',
	));

	// === PHASE 2: Execute phases with dynamic agents ===
	const phaseResults = new Map<string, Awaited<ReturnType<typeof runParallelAgents>>>();
	let allResults: Awaited<ReturnType<typeof runParallelAgents>> = [];

	for (const phase of plan.phases) {
		progress.report(new vscode.LanguageModelTextPart(
			`\n🤖 **Phase: ${phase.name}** — agents working...\n\n`,
		));

		const agents = phase.agents.map((id) => agentMap.get(id)).filter(Boolean) as AgentRole[];
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

		progress.report(new vscode.LanguageModelTextPart('\n---\n\n🎯 **Orchestrator Synthesis:**\n\n'));
		await runSynthesis(userPrompt, phaseResults, reviews, progress, token);
	} else {
		progress.report(new vscode.LanguageModelTextPart('\n---\n\n🎯 **Result:**\n\n'));
		for (const r of allResults) {
			progress.report(new vscode.LanguageModelTextPart(r.output));
		}
	}
}

async function createWorkflowPlan(
	prompt: string,
	model: vscode.LanguageModelChat,
	token: vscode.CancellationToken,
): Promise<WorkflowPlan | null> {
	try {
		const workspaceContext = buildWorkspaceContext();

		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(
				`${ORCHESTRATOR_PROMPT}\n\n` +
				`WORKSPACE CONTEXT:\n${workspaceContext || '(no context available)'}\n\n` +
				`USER REQUEST:\n${prompt}\n\n` +
				`Create a workflow plan with custom agents. Output ONLY valid JSON.`,
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

		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]) as WorkflowPlan;
		}
		logger.warn('Ultra: no JSON found in orchestrator response');
		return null;
	} catch (err) {
		logger.error('Ultra workflow plan creation failed', err);
		return null;
	}
}
