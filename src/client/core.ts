import type { CancellationToken } from 'vscode';
import { safeStringify } from '../json';
import type {
	UltracodeRequest,
	UltracodeStreamChunk,
	StreamCallbacks,
} from '../types';

/**
 * Lightweight SSE-streaming API client.
 * No external dependencies — uses Node's built-in fetch.
 */
export class UltracodeClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
	) {}

	async streamChatCompletion(
		request: UltracodeRequest,
		callbacks: StreamCallbacks,
		cancellationToken?: CancellationToken,
	): Promise<void> {
		const controller = new AbortController();
		const cancelListener = cancellationToken?.onCancellationRequested(() => {
			controller.abort();
		});
		if (cancellationToken?.isCancellationRequested) {
			controller.abort();
		}

		try {
			const requestBody = {
				...request,
				stream_options: { include_usage: true },
			};

			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: safeStringify(requestBody),
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new Error(`HTTP ${response.status}: ${text}`);
			}

			if (!response.body) {
				throw new Error('No response body');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || !trimmed.startsWith('data:')) continue;
					const data = trimmed.slice(5).trim();
					if (data === '[DONE]') continue;

					try {
						const chunk: UltracodeStreamChunk = JSON.parse(data);
						const choice = chunk.choices?.[0];
						if (!choice) continue;

						if (choice.delta?.reasoning_content) {
							callbacks.onThinking(choice.delta.reasoning_content);
						}
						if (choice.delta?.content) {
							callbacks.onContent(choice.delta.content);
						}
						if (choice.delta?.tool_calls) {
							for (const tc of choice.delta.tool_calls) {
								if (tc.id && tc.function?.name) {
									callbacks.onToolCall({
										id: tc.id,
										type: 'function',
										function: {
											name: tc.function.name,
											arguments: tc.function.arguments ?? '',
										},
									});
								}
							}
						}
						if (chunk.usage) {
							callbacks.onUsage?.(chunk.usage);
						}
					} catch {
						// skip malformed JSON
					}
				}
			}
		} catch (err) {
			callbacks.onError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			cancelListener?.dispose();
			callbacks.onDone();
		}
	}
}
