import vscode from 'vscode';
import { getShowReflection } from '../config';
import { logger } from '../logger';
import { createUltracodeService } from './ultracode';

export class UltracodeChatParticipant {
	private service: ReturnType<typeof createUltracodeService> | null = null;

	/** Called by lifecycle after construction to inject context. */
	init(context: vscode.ExtensionContext): void {
		this.service = createUltracodeService(context);
	}

	async handleRequest(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (!this.service) {
			stream.markdown('Ultracode is initializing. Please try again.');
			return;
		}

		const userMessage = request.prompt;
		if (!userMessage.trim()) {
			stream.markdown('Usage: `@ultracode <your message>`');
			return;
		}

		// 1. Resolve Ultracode context
		const result = this.service.resolve(request, context);

		// 2. Report notice
		if (result.initialNotice) {
			stream.markdown(result.initialNotice);
		}

		// 3. Build enhanced prompt
		const enhancedMessage = result.systemPrompt + '\n\n---\n\n' + userMessage;

		// 4. Delegate to Copilot's model
		const models = await vscode.lm.selectChatModels();
		const model = models?.[0];
		if (!model) {
			stream.markdown('No Copilot model available. Please select a model in the chat picker.');
			return;
		}

		logger.info(`Ultracode delegating to model: ${model.name}`);

		const messages = [vscode.LanguageModelChatMessage.User(enhancedMessage)];

		try {
			const response = await model.sendRequest(messages, {}, token);

			// 5. Stream response
			let fullResponse = '';
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					fullResponse += part.value;
					stream.markdown(part.value);
				}
			}

			// 6. Reflection loop
			if (this.service.shouldReflect(fullResponse, result.complexity, 0)) {
				const showReflection = getShowReflection();
				if (showReflection) {
					stream.markdown('\n\n---\n🔄 Ultracode: self-review in progress...\n');
				}

				const reflectionPrompt = this.service.generateReflectionPrompt();
				const reflectionMessages = [
					vscode.LanguageModelChatMessage.User(
						`Previous response:\n${fullResponse}\n\n${reflectionPrompt}`,
					),
				];

				try {
					const reflResp = await model.sendRequest(reflectionMessages, {}, token);
					for await (const part of reflResp.stream) {
						if (part instanceof vscode.LanguageModelTextPart) {
							stream.markdown(part.value);
						}
					}
					stream.markdown('\n\n✅ Ultracode: review complete');
				} catch (err) {
					logger.warn('Reflection loop failed', err);
				}
			}
		} catch (err) {
			logger.error('Ultracode request failed', err);
			stream.markdown(`Ultracode error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
