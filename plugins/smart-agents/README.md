# smart-agents

Four delegation agents, each pinned to the cheapest model tier that can do the job, plus a
SessionStart hook that reminds the orchestrator to actually route work to them instead of
doing everything itself.

| Agent | Tier | Current model | $/MTok in | $/MTok out | Dispatch when |
|---|---|---|---|---|---|
| `scout` | `haiku` | Haiku 4.5 | $1 | $5 | An area is named but not the exact files, or orienting would take 5+ greps/reads. Read-only. |
| `researcher` | `sonnet` | Sonnet 5 | $3 ($2 intro thru 2026-08-31) | $15 ($10 intro) | An open-ended external question needs several sources triangulated. |
| `worker` | `sonnet` | Sonnet 5 | $3 ($2 intro thru 2026-08-31) | $15 ($10 intro) | A self-contained code change with full context given up front. |
| `deep-thinker` | `opus` | Opus 5 | $5 | $25 | Architecture tradeoffs, root-cause analysis, or a worker that failed twice and reported up. Orchestrator-only, read-only. |

Agents are pinned by **tier alias** (`haiku` / `sonnet` / `opus`), not an exact model ID, so
the plugin keeps routing to "the current Haiku-tier model" rather than needing a version
bump every time a new model ships in that tier.

## Install

```
/plugin marketplace add yumedzi/yumedzi_claude_plugins
/plugin install smart-agents@yumedzi-claude-plugins
```

Or test locally without installing:

```
claude --plugin-dir ./plugins/smart-agents
```

## What the hook does

A `SessionStart` hook injects a short delegation policy — route by task shape, do trivial
lookups yourself, escalate cheap-first on repeated failure, keep subagent reports terse —
so the orchestrator doesn't have to be reminded in every prompt. It fires on every
`SessionStart` event (startup, resume, `/clear`, compaction), not just the first prompt of a
session, so the policy doesn't silently disappear partway through a long session.

Measured cost of that injection: ~1,570 bytes (~390 tokens), written to the prompt cache
once per SessionStart event and read back on every subsequent turn. On Opus 5 pricing that's
roughly $0.0047 to write and $0.0004 per turn to read — under 5 cents for a 100-turn
session. The rent is not the reason to think twice about this hook; if you'd rather not pay
even that, drop `hooks/` and keep only `agents/` — the four agents still work standalone,
you'll just need to ask for them by name.

## Two honest caveats

- **The `Agent` tool listed in each agent's frontmatter is not a spawn sandbox.** It reflects
  intent — "this agent is meant to delegate to these others" — but once an agent is running
  as a dispatched subagent, nothing in the harness actually enforces that list. The cost
  hierarchy (never spawn `deep-thinker` from `worker`) lives in the agent prompts and the
  hook text as an instruction, not as tooling that blocks the call.
- **This plugin cannot set your main model.** No hook can. Delegation only saves money if
  the orchestrator itself runs on a reasonably cheap model — see
  `snippets/settings.recommended.json` for a starting point (`"model": "sonnet"`).

## Attribution

The agent prompts in this plugin are adapted from
[`marsmike/claude-subagents`](https://github.com/marsmike/claude-subagents). That
repository does not declare a license. This project's own `LICENSE` (MIT) covers only
the original content here — the hook script, manifests, and docs — not the adapted
agent prompts; see `LICENSE` for the full note.
