#!/usr/bin/env bash
#
# PreToolUse gate: the built-in Explore / Plan / general-purpose agents carry no
# model pin in their definition, so a dispatch that omits the Agent tool's
# `model` parameter silently runs at the full session-model rate — an Opus-rate
# file sweep, with no error or warning anywhere. This denies that dispatch and
# tells the model to re-issue it with an explicit tier.
#
# Deny rather than ask: the fix belongs to the model (add one parameter and
# retry), not to the user, and a prompt per dispatch would just be nagging.
#
# Costs zero context tokens in the steady state — nothing is injected at session
# start, and the reason text below only reaches the model on an actual miss.
#
# matcher in hooks.json is "Agent" (fires for every subagent dispatch); the
# filtering down to the unpinned built-ins happens here, since matchers only
# support tool-name/argument patterns (e.g. Bash(git *)), not field matches on
# tool_input. The PreToolUse payload arrives as JSON on stdin.
#
# Plugin hooks also run inside subagents, and PreToolUse fires on a subagent's
# tool calls just as on the main thread, so this catches a nested dispatch (a
# worker spawning an unpinned Explore) too — the payload then carries agent_id
# and agent_type for the calling agent, which this gate does not need: an
# unpinned built-in should be pinned no matter who asked for it.
#
# Escape hatches: CHEAP_EXPLORE_DISABLE=1 turns the gate off entirely;
# CHEAP_EXPLORE_AGENTS overrides the gated list (comma-separated).
#
# No jq dependency. Always exits 0 — a hook must never break a tool call.

set -u

if [ "${CHEAP_EXPLORE_DISABLE:-}" = "1" ]; then
  exit 0
fi

PAYLOAD="$(cat)"

# Payload goes through the environment, not stdin — the heredoc below occupies
# stdin, same as context-guard's hook.
CHEAP_EXPLORE_PAYLOAD="$PAYLOAD" python3 <<'PY' 2>/dev/null
import json, os, sys

DEFAULT_AGENTS = "Explore,Plan,general-purpose"

try:
    payload = json.loads(os.environ.get("CHEAP_EXPLORE_PAYLOAD", ""))
except Exception:
    sys.exit(0)

if payload.get("tool_name") not in ("Agent", "Task"):
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
subagent = (tool_input.get("subagent_type") or "").strip()

gated = [a.strip() for a in
         os.environ.get("CHEAP_EXPLORE_AGENTS", DEFAULT_AGENTS).split(",") if a.strip()]
if subagent not in gated:
    sys.exit(0)

# An explicit tier is a deliberate cost decision, even if it's opus — only the
# absent-or-empty case is the silent fallback this gate exists to catch.
if str(tool_input.get("model") or "").strip():
    sys.exit(0)

reason = (
    "%s carries no model pin — without the Agent tool's `model` parameter this "
    "dispatch runs at the full session-model rate. Re-dispatch the same agent with "
    "the same prompt plus model: haiku for a plain sweep, or model: sonnet when the "
    "result needs real judgment. Do not switch agents to work around this — if a "
    "harness phase mandated %s, that mandate still holds; it is about which agent, "
    "not which model." % (subagent, subagent)
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
