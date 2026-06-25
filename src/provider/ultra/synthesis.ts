import vscode from 'vscode';
import { logger } from '../../logger';
import type { AgentResult } from './runner';

/**
 * Orchestrator synthesizes all agent outputs + cross-reviews into
 * a final integrated response, streamed to the user.
 */
export async function runSynthesis(
	userPrompt: string,
	phaseResults: Map<string, AgentResult[]>,
	crossReviews: Map<string, string[]>,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
): Promise<void> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) {
		progress.report(new vscode.LanguageModelTextPart('Ultra: No model available for synthesis.'));
		return;
	}

	// Build synthesis prompt from all agent outputs and cross-reviews
	let context = `USER REQUEST:\n${userPrompt}\n\n`;
	context += '=== AGENT OUTPUTS ===\n\n';

	for (const [phase, results] of phaseResults) {
		context += `## Phase: ${phase}\n`;
		for (const r of results) {
			context += `\n### ${r.agent.emoji} ${r.agent.name} (${r.duration}ms)\n${r.output}\n`;
		}
	}

	context += '\n=== CROSS-REVIEWS ===\n\n';
	for (const [agentId, reviews] of crossReviews) {
		context += `## Reviews by ${agentId}:\n`;
		for (const review of reviews) {
			context += `${review}\n\n`;
		}
	}

	const synthesisPrompt = `You are the Orchestrator Agent. Validate and integrate all agent outputs below.

Your job:
1. Verify each agent's output is COMPLETE and CORRECT — not just analysis, but actual implementation
2. Flag any agent that only described what to do instead of actually doing it
3. Integrate all working outputs into a single, cohesive final deliverable
4. If cross-reviews found issues, confirm they are resolved
5. Include the final, production-ready code/files/solution

${context}

FINAL VALIDATED OUTPUT:`;

	try {
		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(synthesisPrompt)],
			{},
			token,
		);

		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				progress.report(part);
			}
		}
	} catch (err) {
		logger.error('Ultra synthesis failed', err);
		progress.report(
			new vscode.LanguageModelTextPart(
				`\n\nUltra synthesis error: ${err instanceof Error ? err.message : String(err)}`,
			),
		);
	}
}
