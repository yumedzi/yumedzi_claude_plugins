#!/usr/bin/env bash
#
# PreToolUse gate: deep-thinker runs on the opus tier, the most expensive here,
# so require an explicit yes before it dispatches instead of letting the
# orchestrator escalate to it silently.
#
# matcher in hooks.json is "Agent" (fires for every subagent dispatch), so the
# filtering down to just deep-thinker happens here, not in hooks.json — there
# is no documented `if` rule syntax for matching a tool_input field like
# subagent_type, only for tool-name/argument patterns (e.g. Bash(git *)). The
# PreToolUse payload (tool_name, tool_input.subagent_type) arrives as JSON on
# stdin instead.
#
# No jq dependency, to match the rest of this plugin's hooks. Without a working
# Python 3 the gate fails open (dispatch proceeds unprompted) — see README.

set -u

# Resolve a working Python 3: `python3` can be a broken Microsoft Store stub on
# Windows, and some installs only ship `python`.
PY=""; for c in python3 python; do "$c" -c 'import sys; sys.exit(sys.version_info[0]<3)' 2>/dev/null && { PY=$c; break; }; done
[ -z "$PY" ] && exit 0

# One interpreter call: prints "tool_name<TAB>subagent_type".
FIELDS="$("$PY" -c 'import json,sys; p=json.load(sys.stdin); print(p.get("tool_name","") + "\t" + ((p.get("tool_input") or {}).get("subagent_type") or ""))' 2>/dev/null)"
TOOL_NAME="${FIELDS%%$'\t'*}"
SUBAGENT_TYPE="${FIELDS#*$'\t'}"

if [ "$TOOL_NAME" != "Agent" ] || [ "$SUBAGENT_TYPE" != "smart-agents:deep-thinker" ]; then
  exit 0
fi

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"deep-thinker runs on the opus tier, the most expensive here — confirm before dispatching."}}
JSON
exit 0
