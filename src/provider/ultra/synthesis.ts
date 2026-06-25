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

	const synthesisPrompt = `You are the Orchestrator Agent. Synthesize all agent outputs and cross-reviews below into a single, comprehensive, final response for the user.

Your synthesis should:
1. Present a unified, conflict-free solution
2. Incorporate the best ideas from all agents
3. Note where agents disagreed and how it was resolved
4. Include actionable next steps

Do NOT repeat the raw agent outputs — create an integrated final answer.

${context}

FINAL SYNTHESIS:`;

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
		progress.report(new vscode.LanguageModelTextPart(
			`\n\nUltra synthesis error: ${err instanceof Error ? err.message : String(err)}`,
		));
	}
}
