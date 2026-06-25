import vscode from 'vscode';
import { logger } from '../../logger';
import type { AgentRole } from './agents';

export interface AgentResult {
	agent: AgentRole;
	output: string;
	duration: number;
	attempts: number;
}

const MAX_RETRIES = 2;

/**
 * Run multiple agents in parallel with retry on failure.
 * Each agent gets the same task but responds from their unique perspective.
 */
export async function runParallelAgents(
	agents: AgentRole[],
	task: string,
	token: vscode.CancellationToken,
): Promise<AgentResult[]> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) {
		logger.warn('Ultra: no model available');
		return [];
	}

	const results = await Promise.all(
		agents.map(async (agent) => {
			const start = Date.now();
			let lastError = '';
			let attempts = 0;

			for (attempts = 1; attempts <= MAX_RETRIES + 1; attempts++) {
				try {
					const systemPrompt = `${agent.systemPrompt}\n\nIMPORTANT: You have access to SOURCE CODE CONTEXT above. Use it to produce accurate, specific results. Do NOT refuse — you have all the context you need.`;

					const messages = [
						vscode.LanguageModelChatMessage.User(
							`${systemPrompt}\n\n---\n\nTASK:\n${task}\n\nProduce the COMPLETE implementation. Write actual code. Do NOT describe — DO it. Output the full deliverable.`,
						),
					];

					const response = await model.sendRequest(messages, {}, token);

					let output = '';
					for await (const part of response.stream) {
						if (part instanceof vscode.LanguageModelTextPart) {
							output += part.value;
						}
					}

					// Check if response is a refusal/block
					const trimmed = output.trim();
					if (trimmed.startsWith('Sorry') || trimmed.includes("can't assist") || trimmed.length < 20) {
						if (attempts <= MAX_RETRIES) {
							logger.warn(`Agent ${agent.id} refused (attempt ${attempts}), retrying with adjusted prompt...`);
							task = `IMPORTANT: You have all the context you need above. ${task}`;
							continue;
						}
					}

					return {
						agent,
						output: trimmed,
						duration: Date.now() - start,
						attempts,
					};
				} catch (err) {
					lastError = err instanceof Error ? err.message : String(err);
					logger.warn(`Agent ${agent.id} error (attempt ${attempts}): ${lastError}`);
					if (attempts <= MAX_RETRIES) continue;
				}
			}

			return {
				agent,
				output: `[Failed after ${attempts - 1} attempts: ${lastError || 'model refused'}]`,
				duration: Date.now() - start,
				attempts: attempts - 1,
			};
		}),
	);

	return results;
}
