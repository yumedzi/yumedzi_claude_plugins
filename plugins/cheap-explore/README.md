# cheap-explore

One hook, no agents, nothing injected into your context.

The built-in `Explore`, `Plan`, and `general-purpose` agents carry no model pin in their
definitions. If a dispatch omits the `Agent` tool's `model` parameter, the subagent runs at
whatever the session model is — an Opus-rate file sweep, with no error, no warning, and
nothing in the transcript to tell you it happened. This hook denies that dispatch and tells
the model to retry with an explicit tier.

A single `Explore` sweep that reads 30 files costs roughly $0.50–1.00 on Opus versus about
$0.05 on Haiku. That is the whole reason this plugin exists.

## Install

```
/plugin marketplace add yumedzi/yumedzi_claude_plugins
/plugin install cheap-explore@yumedzi-claude-plugins
```

Or test locally without installing:

```
claude --plugin-dir ./plugins/cheap-explore
```

Independent of [`smart-agents`](../smart-agents) — install either, both, or neither. They
overlap in intent but not in mechanism: `smart-agents` gives you pinned agents and injects
routing discipline at session start, this one enforces a single rule on the built-ins and
injects nothing.

## What it does

A `PreToolUse` hook on `Agent` reads the tool-call JSON from stdin and denies when **both**
hold:

- `tool_input.subagent_type` is one of `Explore`, `Plan`, `general-purpose`
- `tool_input.model` is absent or empty

Every other dispatch — a pinned `smart-agents` agent, or a built-in that already names a
tier — exits 0 with no output and is untouched. The deny reason tells the model to re-issue
the same agent with the same prompt plus `model: haiku` (plain sweep) or `model: sonnet`
(real judgment), and explicitly says not to swap agents to dodge the gate, since a plan-mode
phase mandate is about *which agent*, not which model.

Deny rather than ask, deliberately: the fix is the model's to make — add one parameter and
retry — not a decision worth interrupting you for on every dispatch. `deny` is also the
right call for a gate that fires where you may not be watching: hooks run inside subagents
too, and `PreToolUse` fires on a subagent's tool calls the same as on the main thread. So a
`worker` that spawns an unpinned `Explore` to protect its own context gets caught as well —
which is the case most likely to go unnoticed, since you never see that dispatch.

## Cost

Zero context tokens in the steady state. Nothing is injected at `SessionStart`, so there is
no per-turn cache-read rent at all. The ~110-token reason string reaches the model only on
an actual miss, and a miss that would have cost dollars gets corrected for a fraction of a
cent.

This is the same shape as [`context-guard`](../context-guard): the hook is free until the
moment it has something to say.

## Configuration

| Env var | Effect |
|---|---|
| `CHEAP_EXPLORE_DISABLE=1` | Turns the gate off entirely. |
| `CHEAP_EXPLORE_AGENTS` | Comma-separated override of the gated list. Default `Explore,Plan,general-purpose`. |

Add other unpinned agents your setup exposes, e.g.
`CHEAP_EXPLORE_AGENTS="Explore,Plan,general-purpose,claude"`.

## If you can't run hooks

Somewhere the hook doesn't reach, the rule has to go back to being prose. Paste this into
that project's `CLAUDE.md` — it is the paragraph `smart-agents` carried until v1.2.0, and it
costs the ~118 tokens per session that the hook exists to avoid:

> Mandatory, no exceptions, including when a phase mandates `Explore` or `Plan`: every
> dispatch of either must carry the `Agent` tool's `model` parameter (`haiku` for a plain
> sweep, `sonnet` for a real judgment call). Both default silently to the full session-model
> rate if you omit it. This never conflicts with a phase mandate — the mandate is about which
> agent, not which model.

Don't paste it if the hook is active. You'd pay the rent and get the enforcement, instead of
just the enforcement.

## Caveats

- **A denied dispatch is not free.** The model already spent output tokens composing the
  call, and those are wasted. That is a one-time cost on a miss, traded against a recurring
  per-turn cost for the prose version of this rule — but it is not zero.
- **It checks that a tier was chosen, not that it was the right one.** `model: opus` passes
  the gate. An explicit expensive choice is a deliberate decision; only the silent fallback
  is a bug.
- **If a Claude Code build doesn't expose `model` on the `Agent` tool, this deadlocks.** The
  model would retry, get denied again, and have no way to comply. Nothing here detects that
  situation. If gated dispatches start failing repeatedly, set `CHEAP_EXPLORE_DISABLE=1` and
  check whether the parameter still exists.
- **It cannot set your session model.** No hook can. Cheap subagents only help if the
  orchestrator dispatching them isn't itself expensive — see
  `../smart-agents/snippets/settings.recommended.json`.
- **Agent names are matched literally.** If the harness ever renames `general-purpose` or
  adds another unpinned built-in, the gate silently stops covering it. Update
  `CHEAP_EXPLORE_AGENTS` or the default list in the script.

## Verification

Run the hook directly with a synthetic payload — no session needed:

```bash
printf '%s' '{"tool_name":"Agent","tool_input":{"subagent_type":"Explore"}}' | bash plugins/cheap-explore/hooks/require-model-pin.sh
```

That should print a `permissionDecision: "deny"` JSON object. This one should print nothing
and exit 0:

```bash
printf '%s' '{"tool_name":"Agent","tool_input":{"subagent_type":"Explore","model":"haiku"}}' | bash plugins/cheap-explore/hooks/require-model-pin.sh
```

Unlike an `"ask"` decision, a `"deny"` is not softened by permission mode — it blocks under
`bypass permissions` and auto-approve modes too.
