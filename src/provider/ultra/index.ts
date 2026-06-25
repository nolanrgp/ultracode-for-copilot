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
   Implementation tasks need a "Design" then "Implement" then "Review" phase.
4. Each phase's prompt must be a CONCRETE EXECUTION TASK — what to BUILD, IMPLEMENT, or CREATE.
   NOT analysis. NOT reporting. Actual work to be done.

Output ONLY valid JSON:
{
  "summary": "one-line task summary",
  "agents": [
    {"id":"api-designer","name":"API Designer","emoji":"🔌","systemPrompt":"You are an API designer for Node.js/Express..."}
  ],
  "phases": [
    {"name":"Implement","agents":["api-designer"],"parallel":false,"prompt":"Write the actual code for..."},
    {"name":"Review","agents":["db-expert"],"parallel":false,"prompt":"Review the implementation and fix any issues found"}
  ]
}`;

/**
 * Main Ultra Mode entry point. Called when thinkingEffort === 'ultra'.
 *
 * Flow:
 * 1. Orchestrator analyzes project + prompt → creates execution plan
 * 2. Run agents in phases — agents DO the work (code, files, tests)
 * 3. Cross-review: agents verify each other's work
 * 4. Synthesis: Orchestrator validates the final result
 *
 * The key difference from v1: agents receive CONCRETE EXECUTION TASKS
 * (write code, create files, implement features) — not analysis tasks.
 * The Orchestrator's plan is a blueprint for Copilot's agent to execute.
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

	progress.report(
		new vscode.LanguageModelTextPart('\n\n🔵 Ultra Mode — Orchestrating execution plan...\n\n'),
	);

	// === PHASE 1: Orchestrator creates execution plan ===
	const plan = await createWorkflowPlan(userPrompt, model, token);
	if (!plan) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: Failed to create execution plan.'));
		return;
	}

	// Build agent lookup from plan
	const agentMap = new Map<string, AgentRole>();
	for (const a of plan.agents) {
		agentMap.set(a.id, a);
	}

	progress.report(
		new vscode.LanguageModelTextPart(
			`📋 **Execution Plan:** ${plan.summary}\n\n` +
				`🧑‍🤝‍🧑 **Team:** ${plan.agents.map((a) => `${a.emoji} ${a.name}`).join(' | ')}\n\n` +
				plan.phases
					.map(
						(p, i) =>
							`  Phase ${i + 1}: **${p.name}** [${p.agents.join(', ')}]${p.parallel ? ' (parallel)' : ''}`,
					)
					.join('\n') +
				'\n\n---\n\n',
		),
	);

	// === PHASE 2: Execute phases — agents DO the work ===
	const phaseResults = new Map<string, Awaited<ReturnType<typeof runParallelAgents>>>();
	let allResults: Awaited<ReturnType<typeof runParallelAgents>> = [];

	for (const phase of plan.phases) {
		progress.report(
			new vscode.LanguageModelTextPart(`\n🤖 **Phase: ${phase.name}** — executing...\n\n`),
		);

		const agents = phase.agents.map((id) => agentMap.get(id)).filter(Boolean) as AgentRole[];

		// Execution prompt: tell agent to DO the work, not just analyze
		const executionPrompt = `${phase.prompt}\n\nIMPORTANT: You MUST produce the actual code, files, or implementation. Do NOT describe what should be done — DO it. Output the complete implementation.`;

		const results = await runParallelAgents(agents, executionPrompt, token);

		for (const r of results) {
			const summary = r.output.length > 300 ? r.output.slice(0, 300) + '...' : r.output;
			progress.report(
				new vscode.LanguageModelTextPart(
					`  ${r.agent.emoji} **${r.agent.name}** (${r.duration}ms):\n${summary}\n\n`,
				),
			);
		}

		phaseResults.set(phase.name, results);
		allResults = allResults.concat(results);

		if (token.isCancellationRequested) break;
	}

	// === PHASE 3: Cross-review — verify the work ===
	if (allResults.length >= 2) {
		progress.report(
			new vscode.LanguageModelTextPart(
				"\n🔄 **Cross-Review** — agents verifying each other's work...\n\n",
			),
		);

		const reviews = await runCrossReviews(allResults, token);

		for (const [, feedbacks] of reviews) {
			for (const fb of feedbacks) {
				progress.report(new vscode.LanguageModelTextPart(`  ${fb.slice(0, 300)}...\n\n`));
			}
		}

		if (token.isCancellationRequested) return;

		// === PHASE 4: Synthesis — Orchestrator validates final output ===
		progress.report(
			new vscode.LanguageModelTextPart(
				'\n---\n\n🎯 **Orchestrator — Validating Final Result:**\n\n',
			),
		);

		await runSynthesis(userPrompt, phaseResults, reviews, progress, token);
	} else {
		progress.report(new vscode.LanguageModelTextPart('\n---\n\n🎯 **Final Result:**\n\n'));
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
			[
				vscode.LanguageModelChatMessage.User(
					`${ORCHESTRATOR_PROMPT}\n\n` +
						`WORKSPACE CONTEXT:\n${workspaceContext || '(no context available)'}\n\n` +
						`USER REQUEST:\n${prompt}\n\n` +
						`Create an EXECUTION plan (not analysis). Each phase must produce actual code, files, or implementation. Output ONLY valid JSON.`,
				),
			],
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
