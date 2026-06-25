# AGENTS.md — Ultracode for Copilot

VS Code extension that brings Ultracode mode to Copilot Chat — inspired by Claude Code's Ultracode effort mode — with DeepSeek V4 Pro & Flash, vision proxy, thinking mode, and BYOK. Pure TypeScript + Node built-ins — zero runtime dependencies.

## Commands

```bash
npm run compile        # clean + tsc
npm run watch          # clean + tsc --watch (background)
npm run lint           # oxlint
npm run format         # oxfmt --write src/
npm run format:check   # oxfmt --check src/ (CI)
npm run package        # vsce package
```

No test suite exists. Manual testing: launch Extension Host via the VS Code Run and Debug panel, then open Copilot Chat and select a DeepSeek model.

## Architecture

```
src/extension.ts          → re-exports src/runtime/
src/runtime/lifecycle.ts  → activate/deactivate, wires up everything
src/runtime/provider.ts   → registers DeepSeekChatProvider as LanguageModelChatProvider
src/runtime/commands.ts   → VS Code command registrations (setApiKey, showLogs, etc.)
src/provider/index.ts     → DeepSeekChatProvider — the core provider implementation
src/client/core.ts        → DeepSeekClient — raw SSE-streaming HTTP client (Node fetch, no deps)
src/auth.ts               → AuthManager — SecretStorage API key with settings fallback
src/config.ts             → All settings reads (baseUrl, model overrides, debugMode, etc.)
src/consts.ts             → Compile-time constants + model registry
src/types.ts              → DeepSeek API request/response types
src/logger.ts             → VS Code LogOutputChannel ("DeepSeek")
src/endpoint.ts           → URL normalization + official host detection
src/provider/vision/      → Vision proxy (images → another LLM → text description → DeepSeek)
src/provider/tools/       → Tool flow stabilization, preflight, drift notices
src/provider/stream.ts    → SSE response handling + usage stats
src/provider/routing/     → Request kind classification for diagnostics
src/provider/debug/       → Cache diagnostics, request dumping
src/provider/pricing/     → Model pricing display in picker
src/provider/replay/      → Replay markers for conversation reconstruction
```

## Key Conventions

- **Strict TypeScript** — `tsconfig.json` has `"strict": true`. No `any` without good reason.
- **No runtime dependencies** — use Node built-ins (`fetch`, `fs`, `crypto`). No `axios`, `node-fetch`, etc.
- **Settings live in `src/config.ts`** — all `workspace.getConfiguration('deepseek-copilot')` reads go through typed accessors here. Never read config inline.
- **i18n via `t()`** — all user-facing strings use `t('key')` from `src/i18n.ts`. Add keys to both `en` (implicit) and `zh` dictionaries.
- **Secrets use `SecretStorage`** — API keys go through `AuthManager` (`src/auth.ts`). Fallback to `settings.json` exists for CI but is discouraged.
- **Format with oxfmt** — run `npm run format` before committing. CI checks with `npm run format:check`.
- **Logging via `logger`** from `src/logger.ts` — uses VS Code `LogOutputChannel`. Output channel name: "DeepSeek".
- **Extension is a `LanguageModelChatProvider`** — implements the VS Code proposed API. Model picker integration uses `contributes.languageModelChatProviders`.
- **Files are small and focused** — most files under 150 lines. New code should follow this pattern.

## Areas with High Complexity

- **Vision proxy** (`src/provider/vision/`) — multi-source architecture with VS Code LM fallback and API endpoint proxy. Protocol-level header/URL handling for OpenAI and Anthropic vision APIs.
- **Tool flow stabilization** (`src/provider/tools/flow.ts`) — preflight round system to stabilize tool lists for DeepSeek, which can drift tool definitions across requests. See [docs/notices/tool-drift.en.md](docs/notices/tool-drift.en.md).
- **Request kind classification** (`src/provider/routing/classifier.ts`) — pattern-matches system prompts to classify requests (agent, terminal, git, etc.) for diagnostics and thinking-mode control.

## Links

- [README.md](README.md) — full feature overview, settings, screenshots
- [CHANGELOG.md](CHANGELOG.md) — release history
- [.github/instructions/codegraph.instructions.md](.github/instructions/codegraph.instructions.md) — CodeGraph MCP usage rules
- [.github/instructions/karpathy-guidelines.instructions.md](.github/instructions/karpathy-guidelines.instructions.md) — behavioral guidelines for AI coding agents
