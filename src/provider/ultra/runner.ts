import vscode from 'vscode';
import { logger } from '../../logger';
import type { AgentRole } from './agents';

export interface AgentResult {
	agent: AgentRole;
	output: string;
	duration: number;
}

/**
 * Run multiple agents in parallel for a given phase.
 * Each agent gets the same task but responds from their unique perspective.
 */
export async function runParallelAgents(
	agents: AgentRole[],
	task: string,
	token: vscode.CancellationToken,
): Promise<AgentResult[]> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) {
		logger.warn('Ultra: no model available for parallel agents');
		return [];
	}

	const results = await Promise.all(
		agents.map(async (agent) => {
			const start = Date.now();
			try {
				const messages = [
					vscode.LanguageModelChatMessage.User(
						`${agent.systemPrompt}\n\n---\n\nTASK:\n${task}\n\nProvide your analysis from your perspective as ${agent.name}. Be concise and actionable.`,
					),
				];

				const response = await model.sendRequest(messages, {}, token);

				let output = '';
				for await (const part of response.stream) {
					if (part instanceof vscode.LanguageModelTextPart) {
						output += part.value;
					}
				}

				return {
					agent,
					output: output.trim(),
					duration: Date.now() - start,
				};
			} catch (err) {
				logger.error(`Ultra agent ${agent.id} failed`, err);
				return {
					agent,
					output: `[Error: ${err instanceof Error ? err.message : String(err)}]`,
					duration: Date.now() - start,
				};
			}
		}),
	);

	return results;
}
