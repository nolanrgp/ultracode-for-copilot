# Plan: Triển khai Ultracode Mode — Rewrite Toàn Diện

**Ngày:** 2026-06-25
**Mục tiêu:** Mang Claude Code Ultracode effort mode vào Copilot Chat. Xóa bỏ toàn bộ logic cũ của repo cha, xây dựng extension mới tập trung vào một mục tiêu duy nhất: **cung cấp chế độ Effort "Ultracode"** trong Copilot Chat.

## Tổng Quan

Extension là một `LanguageModelChatProvider` thuần túy cung cấp **chế độ Effort "Ultracode"** — **không cung cấp API provider, không định nghĩa API endpoint, không hardcode model**. Extension hoạt động như một lớp enhancement bên trên hạ tầng Copilot có sẵn.

Trong model picker của Copilot, extension thêm một effort level mới: **"Ultracode"** — bên cạnh các level có sẵn (none/high/max).

Khi user chọn reasoning effort = **Ultracode**, provider kích hoạt toàn bộ enhancement:

- Load AGENTS.md manifest từ workspace → inject vào system prompt
- Phát hiện Plan/Act mode của Copilot → điều chỉnh hành vi
- Classify task complexity → auto-escalate thinking
- Track token budget → cảnh báo khi gần giới hạn
- Reflection loop → model tự review output

```
┌─────────────────────────────────────────────────┐
│  Copilot Chat Model Picker                      │
│  ┌─────────────────────────────────────────────┐│
│  │  Model:     [Copilot existing models]       ││
│  │  Effort:    none | high | max | ultracode   ││  ← Ultracode là effort level
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**XÓA BỎ toàn bộ:** model registry cứng (`MODELS` array), pricing display, balance/currency resolver, tool flow stabilization, request kind classification cũ, vision proxy subsystem, replay markers cũ, API endpoint defaults, external URLs, DeepSeek-specific error handling.

---

## Phase 0: Rebrand & Clean Slate

**Mục tiêu:** Đổi tên extension + xóa tất cả logic cũ không cần thiết. Phase 0 thực hiện như PR đầu tiên để tạo nền sạch.

### Step 0.1 — Đổi tên extension `deepseek-copilot` → `ultracode-copilot`

| Phạm vi        | Chi tiết                                                                                                                             | Files chính                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Config prefix  | `deepseek-copilot.*` → `ultracode-copilot.*`                                                                                         | `package.json`, `src/consts.ts`, `src/config.ts`, tất cả `getConfiguration()` calls            |
| Command IDs    | `deepseek-copilot.{...}` → `ultracode-copilot.{...}`                                                                                 | `package.json`, `src/runtime/provider.ts`, `src/runtime/commands.ts`, `src/runtime/actions.ts` |
| Walkthrough ID | `deepseekGettingStarted` → `ultracodeGettingStarted`                                                                                 | `src/consts.ts`, `package.json`, walkthrough files                                             |
| i18n keys      | Tất cả `deepseek-copilot.*` → `ultracode-copilot.*`                                                                                  | `package.nls.json`                                                                             |
| Internal types | `DeepSeekMessage` → `UltracodeMessage`, `DeepSeekClient` → `UltracodeClient`, `DeepSeekChatProvider` → `UltracodeChatProvider`, etc. | `src/types.ts`, `src/client/core.ts`, `src/provider/index.ts`, ~15 files                       |
| Display name   | `"DeepSeek"` → `"Ultracode"`                                                                                                         | `package.json`, `src/logger.ts`, `src/i18n.ts`, docs                                           |
| Model names    | `"DeepSeek V4 Pro/Flash"` → model do user config, không hardcode                                                                     | `src/consts.ts` (xóa `MODELS`), `src/provider/models.ts` (xóa)                                 |

### Step 0.2 — Xóa bỏ toàn bộ logic cũ

**XÓA HOÀN TOÀN các file/thư mục sau (không còn cần thiết):**

| File/Thư mục                         | Lý do xóa                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/provider/models.ts`             | Hardcode model registry — xóa, model giờ do user config                                                                             |
| `src/provider/pricing/` (toàn bộ)    | `costs.ts`, `currency.ts` — pricing display, balance resolver                                                                       |
| `src/provider/tools/flow.ts`         | Tool flow stabilization — DeepSeek-specific                                                                                         |
| `src/provider/tools/preflight.ts`    | Preflight round system — DeepSeek-specific                                                                                          |
| `src/provider/tools/notices.ts`      | Tool drift/vision notices                                                                                                           |
| `src/provider/tools/consts.ts`       | Tool constants cũ (128 limit, preflight prefix)                                                                                     |
| `src/provider/tools/request.ts`      | Tool request preparation cũ                                                                                                         |
| `src/provider/routing/classifier.ts` | Request kind classification cũ (12 loại)                                                                                            |
| `src/provider/routing/index.ts`      | Routing barrel                                                                                                                      |
| `src/provider/vision/` (toàn bộ)     | Vision proxy subsystem — `consts.ts`, `index.ts`, `log.ts`, `resolve.ts`, `service.ts`, `types.ts`, `protocols/`, `sources/`, `ui/` |
| `src/provider/debug/diagnostics.ts`  | Cache diagnostics cũ                                                                                                                |
| `src/provider/debug/dump.ts`         | Request dump cũ                                                                                                                     |
| `src/provider/debug/index.ts`        | Debug barrel                                                                                                                        |
| `src/provider/replay/` (toàn bộ)     | Replay markers — `consts.ts`, `index.ts`, `markers.ts`, `types.ts`                                                                  |
| `src/provider/segment.ts`            | Conversation segment resolution cũ                                                                                                  |
| `src/provider/tokens.ts`             | Token estimation cũ                                                                                                                 |
| `src/client/error/network.ts`        | Network error cũ                                                                                                                    |
| `src/client/error/index.ts`          | Error handling cũ                                                                                                                   |
| `src/client/consts.ts`               | Client constants cũ — không còn cần                                                                                                 |
| `src/client/types.ts`                | Client types cũ                                                                                                                     |
| `src/endpoint.ts`                    | URL normalization cũ — không còn cần vì extension không cung cấp API endpoint                                                       |
| `docs/notices/tool-drift.en.md`      | Tool drift doc cũ                                                                                                                   |

**SỬA ĐỔI LỚN các file giữ lại:**

| File                                   | Thay đổi                                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/consts.ts`                        | Chỉ giữ: `CONFIG_SECTION`, `WELCOME_SHOWN_KEY`, `WALKTHROUGH_ID`. Xóa: `MODELS`, `EXTERNAL_URLS`, `REPLAY_MARKER_WRITER_ID`, `DEEPSEEK_TOOLS_LIMIT`, `API_KEY_SECRET`                                |
| `src/types.ts`                         | Viết lại: chỉ giữ `UltracodeMessage`, `UltracodeRequest`, `UltracodeStreamChunk`, `StreamCallbacks`. Xóa: `ModelDefinition`, `ModelCapabilities`, `ModelPricing`, `DeepSeekTool`, `DeepSeekToolCall` |
| `src/config.ts`                        | Viết lại accessors: `getDebugMode()`, `getEffortEnabled()`, `getManifestPath()`, `getMaxReflectionRounds()`, `getBudgetWarningThreshold()`                                                           |
| `src/i18n.ts`                          | Xóa: vision strings, pricing strings, tool drift strings, error strings cũ. Giữ: auth strings. Thêm: ultracode effort strings                                                                        |
| `src/client/core.ts`                   | `UltracodeClient` với `streamChatCompletion()`. Giữ SSE parsing cơ bản. Xóa tool call accumulation phức tạp                                                                                          |
| `src/client/index.ts`                  | Chỉ export `UltracodeClient`                                                                                                                                                                         |
| `src/provider/index.ts`                | Viết lại `UltracodeChatProvider`: model từ config, effort "ultracode" trigger enhancement                                                                                                            |
| `src/provider/request.ts`              | Viết lại `prepareChatRequest()`: đơn giản — convert + ultracode injection + stream                                                                                                                   |
| `src/provider/convert.ts`              | Viết lại `convertMessages()`: hỗ trợ ultracode system prompt injection                                                                                                                               |
| `src/provider/stream.ts`               | Viết lại: SSE handling + budget tracking                                                                                                                                                             |
| `src/runtime/commands.ts`              | Đơn giản: `showLogs`, `showBudget`                                                                                                                                                                   |
| `src/runtime/provider.ts`              | Đơn giản: register 1 provider, 1 model                                                                                                                                                               |
| `src/runtime/actions.ts`               | Đơn giản URI handlers                                                                                                                                                                                |
| `src/runtime/lifecycle.ts`             | Đơn giản activate/deactivate                                                                                                                                                                         |
| `src/runtime/welcome.ts`               | Cập nhật walkthrough                                                                                                                                                                                 |
| `package.json`                         | Viết lại: simplified configuration, ultracode settings                                                                                                                                               |
| `AGENTS.md`                            | Viết lại cho extension mới                                                                                                                                                                           |
| `README.md`                            | Viết lại: Ultracode effort mode                                                                                                                                                                      |
| `CHANGELOG.md`                         | Entry v1.0.0                                                                                                                                                                                         |
| `resources/walkthrough/*.md` (4 files) | Viết lại walkthrough content                                                                                                                                                                         |

### Step 0.3 — Cập nhật documentation

| File                                         | Hành động                                            |
| -------------------------------------------- | ---------------------------------------------------- |
| `AGENTS.md`                                  | Viết lại: mô tả extension mới, ultracode effort mode |
| `README.md`                                  | Viết lại: Ultracode effort mode, manifest            |
| `CHANGELOG.md`                               | Thêm entry v1.0.0 — rewrite toàn diện                |
| `docs/notices/`                              | Xóa `tool-drift.*.md`, tạo `ultracode-mode.md` mới   |
| `resources/walkthrough/show-models.md`       | Viết lại: hướng dẫn chọn effort Ultracode            |
| `resources/walkthrough/advanced-settings.md` | Viết lại: các settings mới                           |

---

## Phase 1: Nền tảng Ultracode Subsystem

_Phụ thuộc vào Phase 0_

### Step 1.1 — Tạo cấu trúc `src/provider/ultracode/`

```
src/provider/ultracode/
├── types.ts      — UltracodeEffort, UltracodeContext, UltracodeTransformResult
├── consts.ts     — ULTRACODE_SYSTEM_PROMPT, REFLECTION_PROMPT, COMPLEXITY_PATTERNS
├── mode.ts       — createUltracodeService(), resolveUltracodeEffort()
├── manifest.ts   — loadManifest(), parseManifest(), manifestToSystemPrompt()
├── budget.ts     — createBudgetTracker()
└── index.ts      — barrel exports
```

### Step 1.2 — `types.ts`

```typescript
// Ultracode là một effort level, không phải model
type UltracodeEffort = "ultracode"; // thêm vào enum reasoningEffort

interface UltracodeContext {
  manifest: UltracodeManifest | null;
  budget: BudgetTracker;
  planModeDetected: boolean;
  complexity: RequestComplexity;
}

interface UltracodeTransformResult {
  systemPrompt: string; // injected ultracode system prompt
  initialNotice?: string; // notice hiển thị đầu response
  budgetWarning?: string; // warning nếu gần giới hạn
}

enum RequestComplexity {
  simple = "simple",
  moderate = "moderate",
  complex = "complex",
  very_complex = "very_complex",
}
```

### Step 1.3 — `mode.ts` — Core Ultracode Logic

```typescript
interface UltracodeService {
  resolveUltracodeEffort(
    messages: LanguageModelChatRequestMessage[],
    options: { reasoningEffort: string },
  ): UltracodeTransformResult;
  shouldReflect(lastResponse: string, complexity: RequestComplexity): boolean;
  generateReflectionPrompt(lastResponse: string): string;
}

function createUltracodeService(
  context: vscode.ExtensionContext,
): UltracodeService;

// Chỉ kích hoạt khi reasoningEffort === 'ultracode'
function resolveUltracodeEffort(messages, options): UltracodeTransformResult {
  if (options.reasoningEffort !== "ultracode") return { systemPrompt: "" };

  const manifest = loadManifest(workspaceRoot);
  const planMode = detectPlanMode(messages);
  const complexity = classifyComplexity(messages);

  return {
    systemPrompt: buildUltracodePrompt(manifest, planMode, complexity),
    initialNotice: planMode ? "🟡 Ultracode Plan" : "🟢 Ultracode Act",
  };
}
```

### Step 1.4 — `manifest.ts` — AGENTS.md Loader

```typescript
interface UltracodeManifest {
  commands: string[];
  conventions: string[];
  architecture: string[];
  rawContent: string;
}

function loadManifest(
  workspaceRoot: string,
  manifestPath?: string,
): UltracodeManifest | null;
function parseManifest(content: string): UltracodeManifest;
function manifestToSystemPrompt(manifest: UltracodeManifest): string;
function resolveImports(content: string, workspaceRoot: string): string; // @path imports, max 2 hops
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

function createBudgetTracker(context: vscode.ExtensionContext): BudgetTracker;
```

---

## Phase 2: Tích hợp Provider Pipeline

_Phụ thuộc vào Phase 1_

### Step 2.1 — `UltracodeChatProvider` (`src/provider/index.ts`)

```typescript
class UltracodeChatProvider implements vscode.LanguageModelChatProvider {
  private ultracode: UltracodeService;
  private budget: BudgetTracker;

  constructor(context: vscode.ExtensionContext) {
    this.ultracode = createUltracodeService(context);
    this.budget = createBudgetTracker(context);
  }

  // Trả về model Ultracode — hoạt động bên trên Copilot models có sẵn
  provideLanguageModelChatInformation(): vscode.LanguageModelChatInformation[] {
    return [{
      id: 'ultracode',
      name: 'Ultracode',
      family: 'ultracode',
      maxInputTokens: 655360,
      maxOutputTokens: 393216,
      // configurationSchema thêm reasoningEffort với option "ultracode"
    }];
  }

  // Pipeline chính khi user gửi message:
  // 1. resolveUltracodeEffort() — nếu effort='ultracode' thì inject prompt
  // 2. prepareChatRequest() — build request với system prompt
  // 3. streamChatCompletion() — SSE stream + budget tracking
  // 4. shouldReflect() — nếu cần, chạy reflection loop
  async provideLanguageModelChatResponse(request, options, token) { ... }
}
```

### Step 2.2 — `prepareChatRequest()` (`src/provider/request.ts`)

```typescript
interface PreparedChatRequest {
  client: UltracodeClient; // HTTP client
  request: UltracodeRequest; // API request body
  initialNotice?: string; // notice hiển thị trước response
  budgetWarning?: string; // budget warning nếu có
}

function prepareChatRequest(
  messages: LanguageModelChatRequestMessage[],
  options: {
    reasoningEffort: string; // 'none' | 'high' | 'max' | 'ultracode'
    ultracodeResult: UltracodeTransformResult;
    tools?: LanguageModelChatTool[];
  },
): PreparedChatRequest;
```

### Step 2.3 — `convertMessages()` (`src/provider/convert.ts`)

- Convert VS Code `LanguageModelChatRequestMessage[]` → `UltracodeMessage[]`
- Nếu `ultracodeResult.systemPrompt` không rỗng → prepend `{role: 'system', content: ultracodePrompt}`
- Hỗ trợ thinking content (`reasoning_content`) từ previous turns

---

## Phase 3: Model Picker — Thêm Effort "Ultracode"

_Phụ thuộc vào Phase 2_

### Step 3.1 — Model Registration

Extension đăng ký một model duy nhất với Copilot:

```typescript
provideLanguageModelChatInformation(): vscode.LanguageModelChatInformation[] {
  return [{
    id: 'ultracode',
    name: 'Ultracode',
    family: 'ultracode',
    version: '1.0.0',
    maxInputTokens: 655360,
    maxOutputTokens: 393216,
    capabilities: { toolCalling: true, imageInput: false, thinking: true },
    // KEY: configurationSchema thêm reasoningEffort với option "ultracode"
    configurationSchema: {
      type: 'object',
      properties: {
        reasoningEffort: {
          type: 'string',
          enum: ['none', 'high', 'max', 'ultracode'],
          default: 'high',
          description: t('ultracode.effort.description')
        }
      }
    }
  }];
}
```

### Step 3.2 — Model Picker UX

Trong Copilot Chat model picker, user thấy:

```
┌──────────────────────────────────────────┐
│  Model                                    │
│  ▼ Ultracode                             │
│                                           │
│  Reasoning Effort                         │
│  ▼ Ultracode  ← deep reasoning + manifest│
│    None                                   │
│    High                                   │
│    Max                                    │
│    ●Ultracode                             │
└──────────────────────────────────────────┘
```

### Step 3.3 — Settings (`package.json`)

```json
{
  "ultracode-copilot.effort.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable Ultracode effort mode enhancements"
  },
  "ultracode-copilot.effort.maxReflectionRounds": {
    "type": "number",
    "default": 2,
    "description": "Max reflection rounds per message (Ultracode effort only)"
  },
  "ultracode-copilot.effort.budgetWarningThreshold": {
    "type": "number",
    "default": 0.8,
    "description": "Token budget warning threshold (0.0-1.0)"
  },
  "ultracode-copilot.effort.showReflection": {
    "type": "boolean",
    "default": false,
    "description": "Show internal reflection turns in chat"
  },
  "ultracode-copilot.manifest.path": {
    "type": "string",
    "default": "AGENTS.md",
    "description": "Path to Ultracode manifest file (relative to workspace root)"
  }
}
```

### Step 3.4 — Config Accessors (`src/config.ts`)

```typescript
function getEffortEnabled(): boolean; // default: true
function getMaxReflectionRounds(): number; // default: 2
function getBudgetWarningThreshold(): number; // default: 0.8
function getShowReflection(): boolean; // default: false
function getManifestPath(): string; // default: 'AGENTS.md'
function getDebugMode(): "minimal" | "metadata" | "verbose";
```

---

## Phase 4: Plan/Act Mode Awareness

_Phụ thuộc vào Phase 2_

### Step 4.1 — Plan Mode Detection

Trong `mode.ts`, detect Copilot Plan mode từ system prompt pattern:

```typescript
function detectPlanMode(messages: LanguageModelChatRequestMessage[]): boolean {
  // Tìm system message chứa Copilot plan mode indicators:
  // - "You are a PLANNING AGENT"
  // - "Your SOLE responsibility is planning"
  // - "NEVER start implementation"
  // - "You are currently running in \"Plan\" mode"
  const systemMsg = messages.find((m) => m.role === "system");
  if (!systemMsg) return false;
  const content = extractText(systemMsg);
  return (
    /PLANNING AGENT/.test(content) ||
    /NEVER start implementation/.test(content) ||
    /Plan.*mode/.test(content)
  );
}
```

### Step 4.2 — Behavior Per Mode

| Copilot Mode           | Ultracode Behavior                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan Mode**          | Inject: "You are in PLAN MODE. Explore codebase thoroughly. Create detailed implementation plans. Do NOT write code. Ask clarifying questions when needed." + Notice: "🟡 Ultracode Plan" |
| **Act Mode** (default) | Inject: "You are in ACT MODE. Execute the plan. Write production-quality code. Verify against the plan." + Notice: "🟢 Ultracode Act"                                                     |

---

## Phase 5: Token Budget Tracking

_Phụ thuộc vào Phase 2_

### Step 5.1 — Stream Integration

Trong `stream.ts`, sau mỗi `onUsage` callback từ SSE:

```typescript
onUsage: (usage) => {
  budget.recordUsage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
  });

  if (budget.isApproachingLimit(threshold)) {
    // Emit budget warning qua report()
    report({ content: budget.formatWarning() });
  }
};
```

### Step 5.2 — Budget Display

- Model picker tooltip: `"Session: 45K tokens"` (khi hover)
- Command `ultracode-copilot.showBudget` → QuickPick hiển thị:

```
Session Token Usage
──────────────────
Input:   32,450 tokens
Output:  12,580 tokens
Total:   45,030 tokens
Warning: at 80% (52,400 tokens)
```

### Step 5.3 — Persistence

Lưu `{ totalInput, totalOutput, lastReset }` vào `context.workspaceState`. Reset khi user chạy command hoặc khi vượt quá 24h.

---

## Phase 6: Reflection Loop

_Phụ thuộc vào Phase 2_

### Step 6.1 — Trigger Conditions

`shouldReflect(lastResponse, complexity)`:

- Complexity ≥ `moderate`
- VÀ response chứa code blocks hoặc tool calls > 2
- VÀ số reflection rounds hiện tại < `maxReflectionRounds` (default: 2)

### Step 6.2 — Reflection Prompt

```
[Ultracode Self-Review]
Review your last response carefully:
1. Are there edge cases not handled?
2. Can the code be simpler or clearer?
3. Are there any bugs, logic errors, or security issues?
4. Is the implementation complete per the plan?
If issues found → fix them. If not → confirm "Review complete — no issues found."
```

### Step 6.3 — Internal Turn Execution

Sau khi stream hoàn tất (`onDone`):

1. Kiểm tra `shouldReflect()` → nếu false, kết thúc
2. Tạo internal message với reflection prompt
3. Gọi `prepareChatRequest()` + `streamChatCompletion()` lần nữa
4. Ẩn internal turn với user (chỉ hiển thị kết quả reflection cuối cùng)
5. Có setting `ultracode-copilot.effort.showReflection` (default: false) để user chọn hiển thị

---

## Phase 7: i18n & Final Polish

_Song song với Phase 2-6_

### Step 7.1 — i18n Keys (English only)

```
# Effort level
ultracode.effort.label       → "Ultracode"
ultracode.effort.description → "Deep reasoning with manifest, planning, and self-review. Inspired by Claude Code Ultracode."

# Notices
ultracode.notice.planMode    → "🟡 Ultracode Plan — exploring & planning"
ultracode.notice.actMode     → "🟢 Ultracode Act — implementing"
ultracode.notice.reflection  → "🔄 Ultracode: self-review in progress..."
ultracode.notice.reflectionDone → "✅ Ultracode: review complete"

# Budget
ultracode.budget.warning     → "⚠️ Token budget at {0}% ({1}/{2}) — consider starting a new session"
ultracode.budget.title       → "Ultracode Session Budget"
ultracode.budget.input       → "Input: {0} tokens"
ultracode.budget.output      → "Output: {0} tokens"
ultracode.budget.total       → "Total: {0} tokens"

# Commands
ultracode.command.showBudget → "Ultracode: Show Session Budget"
ultracode.command.resetBudget → "Ultracode: Reset Session Budget"

# Settings descriptions
ultracode.setting.effortEnabled      → "Enable Ultracode effort mode enhancements"
ultracode.setting.maxReflectionRounds → "Maximum self-review rounds per message"
ultracode.setting.budgetThreshold     → "Token budget warning threshold (0.0-1.0)"
ultracode.setting.manifestPath        → "Path to manifest file (AGENTS.md)"
ultracode.setting.showReflection      → "Show internal reflection turns in chat"

# Model description
ultracode.model.description → "Ultracode — Claude Code-style deep reasoning effort mode with manifest, planning, and self-review."

# Extension lifecycle
extension.activated   → "Ultracode activated — {0} models"
extension.deactivated → "Ultracode deactivated"
```

### Step 7.2 — Walkthrough Content

3 bước walkthrough đơn giản:

1. **Choose Ultracode Effort** — Hướng dẫn chọn effort "Ultracode" trong model picker
2. **Configure Manifest** — Hướng dẫn tạo AGENTS.md với conventions, commands, architecture

---

## Verification

| #   | Test                                                                                                  | Phase |
| --- | ----------------------------------------------------------------------------------------------------- | ----- |
| 1   | `npm run compile` + `npm run lint` + `npm run format:check` pass                                      | 0     |
| 2   | Launch Extension Host → model xuất hiện trong Copilot model picker với effort dropdown có "Ultracode" | 0-3   |
| 3   | Chọn effort "Ultracode", gửi message → request thành công, response hiển thị kèm notice               | 2-3   |
| 4   | Bật Copilot Plan mode (Shift+Tab) → hiển thị "🟡 Ultracode Plan"                                      | 4     |
| 5   | Gửi nhiều request → budget warning khi vượt ngưỡng (set threshold=0.1 để test)                        | 5     |
| 6   | Gửi task complex ("refactor toàn bộ auth system") → reflection loop trigger (max 2 rounds)            | 6     |
| 7   | Settings page hiển thị đúng prefix `ultracode-copilot`                                                | 0-3   |
| 8   | AGENTS.md được load và inject vào system prompt khi effort=Ultracode                                  | 1-2   |

---

## Decisions

- **Ultracode là effort level, không phải model**: Extension thêm "ultracode" vào enum `reasoningEffort` trong model configuration schema. Các enhancement chỉ kích hoạt khi user chọn effort này
- **Xóa sạch logic cũ**: Vision proxy, tool flow stabilization, pricing, replay markers, request classifier — tất cả bị xóa. Extension mới tập trung 100% vào Ultracode effort
- **Không API provider, không endpoint**: Extension không cung cấp bất kỳ API endpoint hay model nào. Hoạt động thuần túy như lớp enhancement trên Copilot có sẵn
- **Plan/Act mode**: Detect từ Copilot system prompt, không tự implement mode riêng
- **Reflection loop**: Ẩn internal turns (có setting để hiện), max 2 rounds
- **Phase 0 tách riêng**: PR đầu tiên clean slate, các phase sau build trên nền sạch

---

## File Manifest — Final State

### NEW FILES (7 + docs)

- `src/provider/ultracode/types.ts`
- `src/provider/ultracode/consts.ts`
- `src/provider/ultracode/mode.ts`
- `src/provider/ultracode/manifest.ts`
- `src/provider/ultracode/budget.ts`
- `src/provider/ultracode/index.ts`
- `docs/notices/ultracode-mode.md`

### REWRITTEN FILES (~20)

- `src/consts.ts`, `src/types.ts`, `src/config.ts`, `src/i18n.ts`
- `src/client/core.ts`, `src/client/index.ts`
- `src/provider/index.ts`, `src/provider/request.ts`, `src/provider/convert.ts`, `src/provider/stream.ts`
- `src/runtime/commands.ts`, `src/runtime/provider.ts`, `src/runtime/actions.ts`, `src/runtime/lifecycle.ts`, `src/runtime/welcome.ts`
- `package.json`, `package.nls.json`
- `AGENTS.md`, `README.md`, `CHANGELOG.md`
- `resources/walkthrough/*.md` (4 files)

### DELETED (~25 files/dirs)

- `src/provider/models.ts`, `src/provider/segment.ts`, `src/provider/tokens.ts`
- `src/provider/pricing/`, `src/provider/tools/`, `src/provider/routing/`
- `src/provider/vision/`, `src/provider/debug/`, `src/provider/replay/`
- `src/client/error/`, `src/client/consts.ts`, `src/client/types.ts`
- `src/endpoint.ts`
- `docs/notices/tool-drift.en.md`
