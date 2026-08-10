#!/usr/bin/env bash
#
# SessionStart hook: inject the smart-agents delegation policy into context, so
# the orchestrator actually routes work to the cheaper scout / researcher /
# worker / deep-thinker agents instead of doing everything itself.
#
# Fires on every SessionStart event (startup, resume, clear, compact) — no
# matcher in hooks.json — so the policy survives a /clear or a compaction
# instead of only applying to the very first prompt of a session.
#
# The agent *descriptions* are already loaded by the plugin; this adds only
# the cross-cutting routing DISCIPLINE, kept lean to avoid duplicating those
# descriptions. No `jq` dependency: the text is static, printf builds the
# JSON. Always exits 0 so it can never break a session.

set -u

# The policy text. Edit here freely — json_escape below handles the escaping.
read -r -d '' POLICY <<'POLICY_EOF' || true
smart-agents is installed: scout (haiku), researcher (sonnet), worker (sonnet), deep-thinker (opus). Route substantive work to whichever fits instead of doing it yourself — you pick the agent, the user doesn't pick a model per task. Each agent's own description says when it applies; don't re-derive that here.

Do it yourself when delegating buys nothing: a single grep, a small lookup, output you need verbatim. Judge by how much of the result you'd read back anyway, not by how small the task sounds.

Send simple recon — an area named but not the exact files — to scout, not Explore. Reserve Explore and general-purpose for when you need a synthesized conclusion out of ambiguous candidates, not a file map. When a harness phase mandates a built-in (plan mode mandates Explore for exploration, Plan for design), comply — don't substitute scout.

Escalate cheap-first: start on whichever agent plausibly fits. A worker that fails or stalls twice stops and reports up; dispatch deep-thinker to diagnose, then hand its plan to a fresh worker. Never spawn deep-thinker from inside a worker — that skips a cost call that is yours.

Your context is the recurring cost; a subagent's is discarded the moment it reports. So: decide and speak to the user yourself, never delegate that. Give a subagent everything it needs up front — it starts from nothing. Fire independent dispatches in one turn so they run in parallel. Re-read the files you're about to edit; a scout summary is not the literal bytes. Require terse reports keyed to file:line — their prose is the real cost, not their existence.
POLICY_EOF

# json_escape <string>: escape for embedding inside a JSON string literal.
json_escape() {
  local s="$1" out="" c
  local LC_ALL=C       # byte-wise bracket ranges below, regardless of session locale
  s="${s//\\/\\\\}"    # backslash first, so later escapes aren't doubled
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\b'/\\b}"
  s="${s//$'\f'/\\f}"
  # ponytail: JSON forbids raw C0 control chars; the named escapes above cover the
  # common ones. This guarded byte-loop escapes any leftover (e.g. \v) as \u00XX so
  # output stays valid JSON. Guard skips the loop entirely in the normal (no-control)
  # case; upgrade to jq only if these hooks ever handle untrusted, high-volume input.
  case $s in
    *[$'\x01'-$'\x1f']*)
      while IFS= read -r -d '' -n 1 c; do
        case $c in
          [$'\x01'-$'\x1f']) printf -v c '\\u%04x' "'$c" ;;
        esac
        out+=$c
      done < <(printf '%s' "$s")
      s=$out ;;
  esac
  printf '%s' "$s"
}

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
  "$(json_escape "$POLICY")"
exit 0
