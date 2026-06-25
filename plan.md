# Plan: Triển khai Ultracode Mode — Rewrite Toàn Diện

**Ngày:** 2026-06-25 | **Cập nhật:** 2026-06-25 (pivot sang ChatParticipant)
**Mục tiêu:** Mang Claude Code Ultracode effort mode vào Copilot Chat dưới dạng **ChatParticipant** (`@ultracode`) — không định nghĩa model, không API endpoint, thuần túy enhancement layer.

## Tổng Quan

Extension là một **ChatParticipant** (`@ultracode`). Khi user gõ `@ultracode <message>` trong Copilot Chat, participant:

1. Load AGENTS.md manifest từ workspace
2. Phát hiện Plan/Act mode của Copilot
3. Inject Ultracode system prompt vào context
4. Delegate model call cho Copilot qua `vscode.lm.sendChatRequest()`
5. Track token budget và cảnh báo khi gần giới hạn
6. Chạy reflection loop để model tự review output

```
┌──────────────────────────────────────────────────────────┐
│  Copilot Chat                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │  @ultracode refactor the auth system               │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                 │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  UltracodeChatParticipant                           │  │
│  │  1. loadManifest(AGENTS.md)                        │  │
│  │  2. detectPlanMode(messages)                       │  │
│  │  3. inject Ultracode system prompt                 │  │
│  │  4. vscode.lm.sendChatRequest() → Copilot model    │  │
│  │  5. budgetTracker.recordUsage()                    │  │
│  │  6. shouldReflect() → reflection loop              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Không đăng ký model** — `@ultracode` dùng model Copilot user đang chọn.
**Không API endpoint** — toàn bộ model call qua `vscode.lm.sendChatRequest()`.
**XÓA BỎ toàn bộ:** LanguageModelChatProvider registration, model registry, pricing, vision proxy, tool flow, replay markers, client HTTP code.

---

## ✅ Phase 0: Rebrand & Clean Slate — HOÀN THÀNH

**Commit:** `37a4b55` — 77 files, +1,038/-11,058. Compile + lint pass.

| Hạng mục | Trạng thái |
|----------|-----------|
| Đổi `deepseek-copilot` → `ultracode-copilot` (config, commands, types) | ✅ |
| Xóa ~55 files logic cũ (vision, tools, pricing, replay, routing, debug, auth) | ✅ |
| Rename `DeepSeek*` → `Ultracode*` (UltracodeClient, UltracodeChatProvider...) | ✅ |
| Rewrite core: `consts.ts`, `types.ts`, `config.ts`, `i18n.ts` | ✅ |
| Rewrite client: `core.ts`, `index.ts` | ✅ |
| Rewrite provider: `index.ts`, `convert.ts`, `request.ts`, `stream.ts` | ✅ |
| Rewrite runtime: `commands.ts`, `provider.ts`, `lifecycle.ts`, `actions.ts`, `welcome.ts` | ✅ |
| Update `package.json`: ultracode settings, commands, walkthrough | ✅ |
| Xóa Chinese localization (6 zh-cn files) | ✅ |
| Compile + lint + format:check pass | ✅ |
| Push lên origin/main | ✅ |

---

## Phase 0.5: Pivot sang ChatParticipant

**Mục tiêu:** Loại bỏ `LanguageModelChatProvider`, chuyển sang `ChatParticipant` (`@ultracode`). Xóa sạch toàn bộ code model-related còn sót lại.

### Step 0.5.1 — Xóa model provider code

| File | Hành động |
|------|-----------|
| `src/provider/index.ts` | **XÓA** — `UltracodeChatProvider` không còn cần |
| `src/provider/request.ts` | **XÓA** — `prepareChatRequest()` không còn cần |
| `src/provider/stream.ts` | **XÓA** — stream handling không còn cần |
| `src/provider/convert.ts` | **XÓA** — message conversion không còn cần |
| `src/client/core.ts` | **XÓA** — `UltracodeClient` HTTP client không còn cần |
| `src/client/index.ts` | **XÓA** — client barrel |
| `src/runtime/provider.ts` | **XÓA** — `registerProvider()` không còn cần |
| `src/consts.ts` | Xóa `ULTRACODE_MODEL_ID`, `LANGUAGE_MODEL_CHAT_SYSTEM_ROLE` |
| `src/types.ts` | Xóa `UltracodeRequest`, `UltracodeStreamChunk`, `UltracodeMessage`, `StreamCallbacks` — không còn HTTP call |
| `package.json` | Xóa `languageModelChatProviders` contribution |

### Step 0.5.2 — Tạo ChatParticipant structure

```
src/participant/
├── index.ts          — UltracodeChatParticipant (implements vscode.ChatParticipant)
├── handler.ts        — handleRequest(): parse message, invoke ultracode pipeline
└── (Phase 1 sẽ thêm ultracode subsystem ở src/provider/ultracode/)
```

```typescript
// src/participant/index.ts
import vscode from 'vscode';

export class UltracodeChatParticipant implements vscode.ChatParticipant {
  // Triggered when user types @ultracode in Copilot Chat
  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const userMessage = request.prompt;
    
    // Phase 1-2: load manifest, detect plan/act, inject prompt
    // Phase 5: budget tracking
    // Phase 6: reflection loop
    
    // Delegate to Copilot's model
    const [model] = await vscode.lm.selectChatModels();
    if (!model) {
      stream.markdown('No Copilot model available.');
      return;
    }
    
    const response = await vscode.lm.sendChatRequest(
      model,
      [vscode.LanguageModelChatMessage.User(userMessage)],
      {},
      token,
    );
    
    // Stream response back to user
    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        stream.markdown(part.value);
      }
    }
  }
}
```

### Step 0.5.3 — Cập nhật lifecycle & registration

```typescript
// src/runtime/lifecycle.ts
import { UltracodeChatParticipant } from '../participant';

export async function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant('ultracode', new UltracodeChatParticipant());
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');
  context.subscriptions.push(participant);
}
```

### Step 0.5.4 — Cập nhật package.json

```json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "ultracode",
        "name": "Ultracode",
        "description": "Claude Code-style deep reasoning with manifest, planning, and self-review."
      }
    ]
  }
}
```

Xóa toàn bộ `languageModelChatProviders`, commands không còn dùng.

### Step 0.5.5 — Kết quả sau pivot

| Before (Phase 0) | After (Phase 0.5) |
|-----------------|-------------------|
| `LanguageModelChatProvider` | `ChatParticipant` |
| Model "Ultracode" trong picker | `@ultracode` trong chat input |
| HTTP client + SSE stream | `vscode.lm.sendChatRequest()` |
| 9 source files (client + provider) | 1 source file (participant) |
| Định nghĩa model + capabilities | Không model nào được đăng ký |

---

## Phase 1: Nền tảng Ultracode Subsystem (ChatParticipant)

*Phụ thuộc vào Phase 0.5*

### Step 1.1 — Tạo `src/participant/ultracode/`

```
src/participant/ultracode/
├── types.ts      — UltracodeEffort, UltracodeContext, UltracodeTransformResult
├── consts.ts     — ULTRACODE_SYSTEM_PROMPT, REFLECTION_PROMPT, COMPLEXITY_PATTERNS
├── mode.ts       — createUltracodeService(), resolveUltracodeEffort()
├── manifest.ts   — loadManifest(), parseManifest(), manifestToSystemPrompt()
├── budget.ts     — createBudgetTracker()
└── index.ts      — barrel exports
```

### Step 1.2 — `types.ts`

```typescript
// Không dùng reasoningEffort enum (ChatParticipant không có model configurationSchema).
// Ultracode được kích hoạt đơn giản bằng cách user gõ @ultracode.

interface UltracodeContext {
  manifest: UltracodeManifest | null;
  budget: BudgetTracker;
  planModeDetected: boolean;
  complexity: RequestComplexity;
}

interface UltracodeTransformResult {
  systemPrompt: string;
  initialNotice?: string;
  budgetWarning?: string;
}

enum RequestComplexity {
  simple = 'simple',
  moderate = 'moderate',
  complex = 'complex',
  very_complex = 'very_complex',
}
```

### Step 1.3 — `mode.ts` — Core Logic

```typescript
interface UltracodeService {
  resolve(request: vscode.ChatRequest, context: vscode.ChatContext): UltracodeTransformResult;
  shouldReflect(lastResponse: string, complexity: RequestComplexity): boolean;
  generateReflectionPrompt(lastResponse: string): string;
}

function createUltracodeService(context: vscode.ExtensionContext): UltracodeService
```

### Step 1.4 — `manifest.ts` — AGENTS.md Loader

```typescript
interface UltracodeManifest {
  commands: string[];
  conventions: string[];
  architecture: string[];
  rawContent: string;
}

function loadManifest(workspaceRoot: string): UltracodeManifest | null
function parseManifest(content: string): UltracodeManifest
function manifestToSystemPrompt(manifest: UltracodeManifest): string
```

### Step 1.5 — `budget.ts` — Token Budget Tracker

```typescript
interface BudgetTracker {
  recordUsage(usage: { inputTokens: number; outputTokens: number }): void;
  getSessionUsage(): { totalInput: number; totalOutput: number };
  isApproachingLimit(threshold: number): boolean;
  formatWarning(): string;
  reset(): void;
}

function createBudgetTracker(context: vscode.ExtensionContext): BudgetTracker
```

---

## Phase 2: Tích hợp ChatParticipant Pipeline

*Phụ thuộc vào Phase 1*

### Step 2.1 — `UltracodeChatParticipant` (`src/participant/index.ts`)

```typescript
class UltracodeChatParticipant implements vscode.ChatParticipant {
  private ultracode: UltracodeService;
  private budget: BudgetTracker;

  constructor(context: vscode.ExtensionContext) {
    this.ultracode = createUltracodeService(context);
    this.budget = createBudgetTracker(context);
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // 1. Resolve Ultracode context (manifest, plan/act, complexity)
    const result = this.ultracode.resolve(request, context);

    // 2. Report initial notice
    if (result.initialNotice) stream.markdown(result.initialNotice);

    // 3. Build messages with ultracode system prompt
    const messages = [
      vscode.LanguageModelChatMessage.User(result.systemPrompt + '\n\n' + request.prompt),
    ];

    // 4. Delegate to Copilot's model via vscode.lm
    const [model] = await vscode.lm.selectChatModels();
    if (!model) { stream.markdown('No model available.'); return; }

    const response = await model.sendRequest(messages, {}, token);

    // 5. Stream response + track budget
    let fullResponse = '';
    for await (const part of response.stream) {
      if (part instanceof vscode.LanguageModelTextPart) {
        fullResponse += part.value;
        stream.markdown(part.value);
      }
    }

    // 6. Budget tracking
    // TODO: extract token counts from response metadata

    // 7. Reflection loop
    // TODO: Phase 6
  }
}
```

### Step 2.2 — Đăng ký trong lifecycle

```typescript
// src/runtime/lifecycle.ts
export async function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(
    'ultracode',
    new UltracodeChatParticipant(context),
  );
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');
  context.subscriptions.push(participant);
  logger.info('Ultracode ChatParticipant activated');
}
```

---

## Phase 3: User Experience — @ultracode

*Phụ thuộc vào Phase 2*

### Step 3.1 — Invocation

User gõ `@ultracode <message>` trong Copilot Chat:

```
┌──────────────────────────────────────────┐
│  @ultracode refactor the auth system     │
│  ─────────────────────────────────────── │
│  🟢 Ultracode Act                        │
│                                          │
│  I'll refactor the auth system...        │
│  [model response streams here]           │
└──────────────────────────────────────────┘
```

### Step 3.2 — Settings (giữ nguyên từ Phase 0)

```json
{
  "ultracode-copilot.effort.enabled": true,
  "ultracode-copilot.effort.maxReflectionRounds": 2,
  "ultracode-copilot.effort.budgetWarningThreshold": 0.8,
  "ultracode-copilot.effort.showReflection": false,
  "ultracode-copilot.manifest.path": "AGENTS.md"
}
```

---

## Phase 4: Plan/Act Mode Awareness

*Phụ thuộc vào Phase 2*

### Step 4.1 — Detection (trong `mode.ts`)

```typescript
function detectPlanMode(context: vscode.ChatContext): boolean {
  // Kiểm tra Copilot's plan mode state từ chat context
  // Copilot sets context when user presses Shift+Tab to toggle plan mode
  return context.history?.some(turn => 
    turn.participant === 'copilot' && /plan/i.test(turn.request?.prompt ?? '')
  ) ?? false;
}
```

### Step 4.2 — Behavior

| Copilot Mode | Ultracode Behavior |
|-------------|-------------------|
| **Plan** | Inject plan-specific prompt + notice "🟡 Ultracode Plan" |
| **Act** (default) | Inject act-specific prompt + notice "🟢 Ultracode Act" |

---

## Phase 5: Token Budget Tracking

*Phụ thuộc vào Phase 2*

### Step 5.1 — Track từ `vscode.lm` response metadata

```typescript
// Extract token usage from model response when available
for await (const part of response.stream) {
  if (part instanceof vscode.LanguageModelTextPart) {
    stream.markdown(part.value);
  }
}
// Token counts available via response.tokenUsage (proposed API)
if (response.tokenUsage) {
  budget.recordUsage(response.tokenUsage);
  if (budget.isApproachingLimit(threshold)) {
    stream.markdown('\n\n' + budget.formatWarning());
  }
}
```

---

## Phase 6: Reflection Loop

*Phụ thuộc vào Phase 2*

### Step 6.1 — Trigger

`shouldReflect(lastResponse, complexity)` — complexity ≥ moderate + response có code/tool calls.

### Step 6.2 — Internal Turn

Sau response chính, tự động gửi internal request với reflection prompt qua `vscode.lm.sendChatRequest()`. Ẩn internal turn (có setting để hiện).

---

## Phase 7: i18n & Polish

*Song song với Phase 2-6*

### Step 7.1 — i18n (English only, simplified)

```
ultracode.notice.planMode       → "🟡 Ultracode Plan — exploring & planning"
ultracode.notice.actMode        → "🟢 Ultracode Act — implementing"
ultracode.notice.reflection     → "🔄 Ultracode: self-review in progress..."
ultracode.notice.reflectionDone → "✅ Ultracode: review complete"
ultracode.budget.warning        → "⚠️ Token budget at {0}% ({1}/{2})"
ultracode.budget.title          → "Ultracode Session Budget"
ultracode.command.showBudget    → "Ultracode: Show Session Budget"
extension.activated             → "Ultracode ChatParticipant activated"
extension.deactivated           → "Ultracode ChatParticipant deactivated"
```

---

## Verification

| # | Test | Phase |
|---|------|-------|
| 1 | `npm run compile` + `npm run lint` pass | 0.5 |
| 2 | `@ultracode hello` trong Copilot Chat → response từ model | 0.5-2 |
| 3 | `@ultracode` với Plan mode (Shift+Tab) → "🟡 Ultracode Plan" | 4 |
| 4 | Gửi nhiều request → budget warning | 5 |
| 5 | Task complex → reflection loop trigger | 6 |
| 6 | AGENTS.md được load vào system prompt | 1-2 |

---

## Decisions

- **ChatParticipant, không LanguageModelChatProvider**: Không đăng ký model. `@ultracode` dùng model Copilot user đang chọn
- **Delegate cho Copilot**: Toàn bộ model call qua `vscode.lm.sendChatRequest()` — không HTTP client, không API endpoint
- **Xóa sạch logic cũ**: Vision proxy, tool flow, pricing, replay, classifier — tất cả đã xóa trong Phase 0
- **Plan/Act mode**: Detect từ Copilot context
- **Reflection loop**: Ẩn internal turns (có setting), max 2 rounds

---

## File Manifest — Final State

### NEW FILES
- `src/participant/index.ts` — UltracodeChatParticipant
- `src/participant/ultracode/types.ts`
- `src/participant/ultracode/consts.ts`
- `src/participant/ultracode/mode.ts`
- `src/participant/ultracode/manifest.ts`
- `src/participant/ultracode/budget.ts`
- `src/participant/ultracode/index.ts`

### KEPT (simplified)
- `src/consts.ts`, `src/config.ts`, `src/i18n.ts`, `src/types.ts`
- `src/logger.ts`, `src/json.ts`
- `src/runtime/lifecycle.ts`, `src/runtime/commands.ts`, `src/runtime/welcome.ts`, `src/runtime/actions.ts`, `src/runtime/diagnostics.ts`
- `src/extension.ts`, `src/runtime/index.ts`
- `package.json`, `package.nls.json`

### DELETED (Phase 0 + Phase 0.5)
- `src/client/` (toàn bộ)
- `src/provider/` (toàn bộ)
- `src/runtime/provider.ts`
- `src/auth.ts`, `src/endpoint.ts`


