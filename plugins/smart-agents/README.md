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

The policy also covers the built-in `Explore` and `Plan` agents, which this plugin cannot
replace: simple recon goes to `scout` instead, and whenever a harness phase mandates `Explore`
or `Plan` (plan mode does, for its exploration and design phases respectively), the policy says
to comply with that restriction but always pass the `Agent` tool's `model` parameter explicitly
— those two built-ins carry no model pin and otherwise default to the session model.

Measured cost of that injection: ~2,550 bytes (~640 tokens), written to the prompt cache
once per SessionStart event and read back on every subsequent turn. On Opus 5 pricing that's
roughly $0.0077 to write and $0.0007 per turn to read — under 8 cents for a 100-turn
session. The rent is not the reason to think twice about this hook; if you'd rather not pay
even that, drop `hooks/` and keep only `agents/` — the four agents still work standalone,
you'll just need to ask for them by name.

## deep-thinker confirmation gate

A `PreToolUse` hook fires on every `Agent` dispatch and reads the tool-call JSON from stdin;
`hooks/gate-deep-thinker.sh` checks `tool_input.subagent_type` and only returns
`permissionDecision: "ask"` when it's `smart-agents:deep-thinker` — every other dispatch
(scout, researcher, worker) exits 0 with no output and is unaffected. The filtering happens
in the script rather than in `hooks.json` because there's no documented `if`-rule syntax for
matching a `tool_input` field (the documented forms are tool-name/argument patterns like
`Bash(git *)`, not `key=value` field matches).

This asks for confirmation on every dispatch, not just once per session — by design, since
each dispatch is a separate cost decision. If that gets in the way for your workflow, remove
the `PreToolUse` block from `hooks/hooks.json` (the `SessionStart` policy hook is independent
and unaffected).

Whether `"ask"` surfaces as a real interactive approval prompt depends on your terminal's
permission mode — under `bypass permissions` or an auto-approve mode it may resolve without
stopping. Test it in your own interactive session with:

    claude --plugin-dir ./plugins/smart-agents

then ask it to use the deep-thinker agent, and confirm you see a prompt naming the cost
before it dispatches.

## Optional: project CLAUDE.md snippet

`snippets/CLAUDE.md` is **not** loaded automatically by anything — it's a template you can
paste into a project's real `CLAUDE.md` (or `.claude/CLAUDE.md`) if you want the routing
discipline to apply somewhere the SessionStart hook doesn't reach — a headless run, or a
project where the hook is disabled. Once pasted, it *is* loaded every session for that
project, the same as any other project instructions, so only copy it if you actually want
that. `snippets/settings.recommended.json` pairs with it — it sets the orchestrator's own
model floor (`"model": "sonnet"`), since delegation only saves money if the orchestrator
itself is cheap to run and no hook or CLAUDE.md snippet can set that for you.

## Three honest caveats

- **The `Agent` tool listed in each agent's frontmatter is not a spawn sandbox.** It reflects
  intent — "this agent is meant to delegate to these others" — but once an agent is running
  as a dispatched subagent, nothing in the harness actually enforces that list. The cost
  hierarchy (never spawn `deep-thinker` from `worker`) lives in the agent prompts and the
  hook text as an instruction, not as tooling that blocks the call.
- **This plugin cannot set your main model.** No hook can. Delegation only saves money if
  the orchestrator itself runs on a reasonably cheap model — see
  `snippets/settings.recommended.json` for a starting point (`"model": "sonnet"`).
- **The `model` override on Explore/Plan dispatches is a parameter of the `Agent` tool, not
  something this plugin enforces.** The policy text asks the orchestrator to pass it; nothing
  checks that it did. If a Claude Code build doesn't expose the parameter, or the orchestrator
  just omits it, the dispatch silently falls back to the session model and the saving disappears
  with no error or warning anywhere.

## Attribution

The agent prompts in this plugin are adapted from
[`marsmike/claude-subagents`](https://github.com/marsmike/claude-subagents). That
repository does not declare a license. This project's own `LICENSE` (MIT) covers only
the original content here — the hook script, manifests, and docs — not the adapted
agent prompts; see `LICENSE` for the full note.
