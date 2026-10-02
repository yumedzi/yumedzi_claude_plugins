#!/usr/bin/env bash
#
# PreToolUse gate: Explore (and any other agent listed in CHEAP_AGENTS) carries
# no model pin in its definition, so a dispatch is only cheap if the Agent
# tool's `model` parameter says so. This denies a dispatch whose model is
# missing, empty, or outside the allowed cheap tiers, and tells the model to
# re-issue it with haiku or sonnet.
#
# Deny rather than ask: the fix belongs to the model (set the parameter and
# retry), not to the user, and a prompt per dispatch would just be nagging.
#
# Costs zero context tokens in the steady state — nothing is injected at session
# start, and the reason text below only reaches the model on an actual miss.
#
# matcher in hooks.json is "Agent" (fires for every subagent dispatch); the
# filtering down to the gated agents happens here, since matchers only support
# tool-name/argument patterns (e.g. Bash(git *)), not field matches on
# tool_input. The PreToolUse payload arrives as JSON on stdin.
#
# Plugin hooks also run inside subagents, and PreToolUse fires on a subagent's
# tool calls just as on the main thread, so this catches a nested dispatch (a
# worker spawning an unpinned Explore) too — the payload then carries agent_id
# and agent_type for the calling agent, which this gate does not need: a gated
# agent should stay cheap no matter who asked for it.
#
# Escape hatches: CHEAP_AGENTS_DISABLE=1 turns the gate off entirely;
# CHEAP_AGENTS overrides the gated list (comma-separated).
#
# No jq dependency. Always exits 0 — a hook must never break a tool call.

set -u

if [ "${CHEAP_AGENTS_DISABLE:-}" = "1" ]; then
  exit 0
fi

# Resolve a working Python 3: `python3` can be a broken Microsoft Store stub on
# Windows, and some installs only ship `python`. No Python -> silent no-op.
PY=""; for c in python3 python; do "$c" -c 'import sys; sys.exit(sys.version_info[0]<3)' 2>/dev/null && { PY=$c; break; }; done
[ -z "$PY" ] && exit 0

PAYLOAD="$(cat)"

# Payload goes through the environment, not stdin — the heredoc below occupies
# stdin, same as context-guard's hook.
CHEAP_AGENTS_PAYLOAD="$PAYLOAD" "$PY" <<'PY' 2>/dev/null
import json, os, sys

DEFAULT_AGENTS = "Explore"
ALLOWED_TIERS = {"haiku", "sonnet"}

try:
    payload = json.loads(os.environ.get("CHEAP_AGENTS_PAYLOAD", ""))
except Exception:
    sys.exit(0)

if payload.get("tool_name") not in ("Agent", "Task"):
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
subagent = (tool_input.get("subagent_type") or "").strip()

gated = [a.strip() for a in
         os.environ.get("CHEAP_AGENTS", DEFAULT_AGENTS).split(",") if a.strip()]
if subagent not in gated:
    sys.exit(0)

model = str(tool_input.get("model") or "").strip().lower()
if model in ALLOWED_TIERS:
    sys.exit(0)

reason = (
    "%s is a gated cheap agent — the Agent tool's `model` parameter must be "
    "haiku or sonnet, not '%s'. Re-dispatch the same agent with the same prompt "
    "plus model: haiku for a plain sweep, or model: sonnet when the result needs "
    "more judgment. Do not switch agents to work around this — if a harness phase "
    "mandated %s, that mandate still holds; it is about which agent, not which "
    "model." % (subagent, model or "(missing)", subagent)
)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}))
PY

exit 0
