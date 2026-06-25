import vscode from 'vscode';
import { logger } from '../../logger';
import type { AgentResult } from './runner';

/**
 * Cross-review: one agent reviews another agent's output.
 * Returns the reviewer's feedback.
 */
export async function crossReview(
	reviewer: AgentResult,
	reviewee: AgentResult,
	token: vscode.CancellationToken,
): Promise<string> {
	const [model] = await vscode.lm.selectChatModels();
	if (!model) return '';

	try {
		const prompt = `You are ${reviewer.agent.name}. Review the following output from ${reviewee.agent.name}.

${reviewee.agent.name}'s OUTPUT:
${reviewee.output}

CRITIQUE from your perspective as ${reviewer.agent.name}:
1. What did ${reviewee.agent.name} miss or get wrong?
2. What should be added or improved?
3. Are there any conflicts with your own analysis?

Be critical and specific. If you agree with everything, say "AGREE — no issues found."`;

		const response = await model.sendRequest(
			[vscode.LanguageModelChatMessage.User(prompt)],
			{},
			token,
		);

		let feedback = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				feedback += part.value;
			}
		}
		return feedback.trim();
	} catch (err) {
		logger.warn(`Ultra cross-review failed`, err);
		return '[Cross-review unavailable]';
	}
}

/**
 * Run cross-reviews between all agent pairs within a phase.
 */
export async function runCrossReviews(
	results: AgentResult[],
	token: vscode.CancellationToken,
): Promise<Map<string, string[]>> {
	const reviews = new Map<string, string[]>();

	if (results.length < 2) return reviews;

	for (const reviewer of results) {
		const feedbacks: string[] = [];
		for (const reviewee of results) {
			if (reviewer.agent.id === reviewee.agent.id) continue;

			const feedback = await crossReview(reviewer, reviewee, token);
			feedbacks.push(`${reviewee.agent.emoji} ${reviewee.agent.name}: ${feedback}`);
		}
		reviews.set(reviewer.agent.id, feedbacks);
	}

	return reviews;
}
