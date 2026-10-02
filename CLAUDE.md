# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal Claude Code plugin marketplace (`yumedzi-claude-plugins`). There is no build,
lint, or test tooling — plugins are validated by JSON-parsing the manifests and by running
hook scripts directly with a synthetic payload on stdin (see each plugin's README
"Verification" notes, e.g. `plugins/context-guard/README.md`). There is no app to run.

## Repo structure

```
.claude-plugin/marketplace.json   # registers every plugin — source of truth for the marketplace
README.md                         # one-line-per-plugin table, must stay in sync with marketplace.json
plugins/<plugin-name>/
├── .claude-plugin/plugin.json    # per-plugin manifest (name, version, description, author, license)
├── hooks/hooks.json              # picked up by convention from the plugin root — NOT referenced in plugin.json
├── hooks/*.sh                    # hook implementations
├── agents/*.md                   # subagent definitions (frontmatter + prompt), if the plugin ships agents
├── snippets/                     # optional paste-in templates, NOT auto-loaded by anything
└── README.md
```

Adding a new plugin = a new `plugins/<name>/` directory + one new entry in
`.claude-plugin/marketplace.json`'s `plugins[]` array + one new row in the root `README.md`
table. The `description` string is duplicated verbatim between `plugin.json` and the
marketplace entry — keep them identical.

## Hook script conventions (binding — house rules used across every hook here)

- `#!/usr/bin/env bash`, `set -u` (not `-e`).
- **Always `exit 0`**, even on internal failure — a hook must never break the user's prompt
  or tool call. Wrap risky logic so any error is swallowed rather than propagated.
- **No `jq` dependency.** Parse the JSON payload (delivered on stdin) with inline
  `python3 -c '...'` one-liners, or a full embedded Python block for anything nontrivial
  (see `plugins/context-guard/hooks/warn-context-usage.sh`). Only reach for `jq` if a hook
  ever needs to handle untrusted, high-volume input.
- **Resolve Python, don't assume `python3`.** On Windows `python3` is often a broken
  Microsoft Store stub, or only `python` exists. Every Python-using hook starts with:
  `PY=""; for c in python3 python; do "$c" -c 'import sys; sys.exit(sys.version_info[0]<3)' 2>/dev/null && { PY=$c; break; }; done; [ -z "$PY" ] && exit 0`
  and then calls `"$PY"`. No Python means the hook is a silent no-op — so a gating hook
  fails *open*; say so in that plugin's README.
- When a script needs to *emit* JSON output containing a variable string, build it with
  `json.dumps` inside an embedded Python block rather than hand-rolling escaping in bash.
  (`plugins/smart-agents/hooks/inject-delegation-policy.sh` hand-rolls a `json_escape()`
  bash function on purpose: it emits a static policy string and is the one hook that must
  work with no Python at all. Keep it pure bash; don't copy the pattern elsewhere.)
- In `hooks.json`, invoke scripts as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh"`, never by
  path alone — Windows (Git Bash on NTFS) has no exec bit to honour the shebang.
- Filtering logic (e.g. "only act on `tool_input.subagent_type == X`") belongs in the
  script, not in `hooks.json`'s `matcher`, since matchers only support tool-name/argument
  patterns like `Bash(git *)`, not arbitrary field matches on the payload.
- A hook that must never cost model tokens (e.g. a pure UI warning) should emit
  `systemMessage` only — never `additionalContext` or `reason`, which are read by the model
  and become part of the transcript.
- Give a hook an explicit disable escape hatch via an env var (e.g. `CONTEXT_GUARD_DISABLE=1`)
  when it runs on a hot path like `UserPromptSubmit`.

## Agent conventions (`plugins/smart-agents/agents/*.md`)

Agents are pinned by **tier alias** (`haiku` / `sonnet` / `opus`) in frontmatter's `model:`
field, not an exact model ID — this keeps routing to "the current cheapest model in that
tier" without needing a version bump whenever a new model ships. Each agent's frontmatter
`description` is the sole routing signal read by the orchestrator (via the SessionStart
policy hook); keep it decision-useful ("dispatch when X") rather than a feature list.

## Licensing note

The MIT `LICENSE` covers original content only (hooks, manifests, READMEs). The agent
prompts under `plugins/smart-agents/agents/` are adapted from
[`marsmike/claude-subagents`](https://github.com/marsmike/claude-subagents), which asserts
no license — do not add a license header to those files implying otherwise, and preserve
the attribution note in `LICENSE` and `plugins/smart-agents/README.md` if you touch them.

## Tone for READMEs and commit messages

READMEs are blunt and caveat-forward: state honestly what a hook/agent cannot do (see each
plugin's "Caveats" section) rather than only what it does. No emoji in prose. Commit
subjects follow `<plugin>: <lowercase imperative>` (e.g. `context-guard: warn on context
usage at 35% and 50%`) or `fix: <...>` for repo-wide fixes.
