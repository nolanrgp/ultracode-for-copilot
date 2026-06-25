---
description: "CodeGraph MCP usage — prefer codegraph_* tools for structural queries (symbol search, callers/callees, trace flow, impact analysis) over grep/read. Use when: searching for a symbol definition, tracing how X calls Y, finding what would break if Z changes, exploring code architecture, looking up function signatures."
---

# CodeGraph Usage — Prefer Over Grep for Structural Queries

CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond. Use it for **structural** questions. Use native grep/read only for **literal text** (string contents, comments, log messages) or after you already have a specific file open.

## Tool Selection

| Question | Use |
|----------|-----|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "How does X reach Y? / trace flow from X to Y" | `codegraph_trace` (one call = full path including dynamic hops) |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

## Rules

- **Answer directly — don't delegate.** For architecture questions: `codegraph_context` first, then ONE `codegraph_explore` for source. For a specific **flow**: `codegraph_trace` from→to (one call = full path), then ONE `codegraph_explore` for bodies. Don't rebuild the path manually.
- **Trust codegraph results.** They come from full AST parse. Do NOT re-verify with grep — slower, less accurate, wastes context.
- **Don't grep first** for symbol lookup. `codegraph_search` returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** — `codegraph_context` is one call.
- **Don't loop `codegraph_node`** over many symbols — one `codegraph_explore` groups several symbols' source in one capped call.
- **Index lag**: When a codegraph response starts with "⚠️ Some files referenced below were edited since the last index sync…", those specific files are stale — read them directly. Files NOT listed are fresh. `codegraph_status` also lists pending files.

## If Not Initialized

If codegraph responds "not initialized", ask: *"Want me to run `codegraph init -i` to build the index?"*
