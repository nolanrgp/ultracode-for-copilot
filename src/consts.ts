/**
 * Compile-time constants shared across the extension.
 *
 * These do NOT depend on the VS Code runtime. For run-time settings reads see `config.ts`.
 */

/** VS Code configuration section prefix for all extension settings. */
export const CONFIG_SECTION = 'ultracode-copilot';

/** URI path handled by this extension to reveal the output log. */
export const SHOW_LOGS_URI_PATH = '/showLogs';

// VS Code's internal LanguageModelChatMessageRole.System is not exposed in @types/vscode.
export const LANGUAGE_MODEL_CHAT_SYSTEM_ROLE = 3;

/** memento key tracking whether the welcome walkthrough has been shown. */
export const WELCOME_SHOWN_KEY = 'ultracode-copilot.welcomeShown';

/** Walkthrough contribution ID. */
export const WALKTHROUGH_ID = 'Vizards.ultracode-for-copilot#ultracodeGettingStarted';

/** Default model ID — used as the single model exposed by the provider. */
export const ULTRACODE_MODEL_ID = 'ultracode';
