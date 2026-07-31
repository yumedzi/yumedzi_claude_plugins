#!/usr/bin/env bash
#
# PreToolUse gate: deep-thinker runs on Opus, the most expensive tier here, so
# require an explicit yes before it dispatches instead of letting the
# orchestrator escalate to it silently.
#
# matcher in hooks.json is "Agent" (fires for every subagent dispatch), so the
# filtering down to just deep-thinker happens here, not in hooks.json — there
# is no documented `if` rule syntax for matching a tool_input field like
# subagent_type, only for tool-name/argument patterns (e.g. Bash(git *)). The
# PreToolUse payload (tool_name, tool_input.subagent_type) arrives as JSON on
# stdin instead.
#
# No jq dependency, to match the rest of this plugin's hooks.

set -u

PAYLOAD="$(cat)"

TOOL_NAME="$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_name",""))' 2>/dev/null)"
SUBAGENT_TYPE="$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("subagent_type",""))' 2>/dev/null)"

if [ "$TOOL_NAME" != "Agent" ] || [ "$SUBAGENT_TYPE" != "smart-agents:deep-thinker" ]; then
  exit 0
fi

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"deep-thinker runs on Opus ($5/$25 per MTok) — confirm before dispatching."}}
JSON
exit 0
