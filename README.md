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
| [`cheap-explore`](plugins/cheap-explore) | Zero-cost PreToolUse hook that denies built-in Explore/Plan/general-purpose dispatches which omit an explicit `model` tier. |
| [`context-guard`](plugins/context-guard) | Zero-cost UserPromptSubmit hook that warns via systemMessage when context usage crosses 35% and 50%. |

## License

MIT — see [`LICENSE`](LICENSE). See each plugin's own README for upstream attribution.
