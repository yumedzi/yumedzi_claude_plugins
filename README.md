# yumedzi Claude Code plugins

A personal Claude Code plugin marketplace.

## Install

```
/plugin marketplace add yumedzi/yumedzi_claude_plugins
```

## Plugins

| Plugin | Description |
|---|---|
| [`smart-agents`](plugins/smart-agents) | Four cost-tiered delegation agents (scout/researcher/worker/deep-thinker) plus a SessionStart hook that keeps the orchestrator routing to them. |
| [`cheap-explore`](plugins/cheap-explore) | Zero-cost PreToolUse hook that denies built-in `Explore` dispatches unless `model` is `haiku` or `sonnet`. |
| [`context-guard`](plugins/context-guard) | Zero-cost UserPromptSubmit hook that warns via systemMessage when context usage crosses 35% and 50%. |
| [`cheap-haiku`](plugins/cheap-haiku) | Warns before a Haiku 5.5 session crosses the 100k-token price tier (5x), asks before `/model haiku` on a large context, and reports Haiku subagents that crossed. Optional hard stop. |
| [`cool-progress`](plugins/cool-progress) | Desktop mod: animated progress band above the prompt plus a `/cool-progress` panel of sub-agents (mascots, model, estimated cost) and background jobs. |
| [`file-tree`](plugins/file-tree) | Desktop mod: side panel of the files Claude reads and edits, with diff and full-file views that jump between changed lines. |

## License

MIT — see [`LICENSE`](LICENSE). See each plugin's own README for upstream attribution.
