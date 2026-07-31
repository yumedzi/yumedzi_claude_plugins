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
smart-agents is installed: scout (haiku), researcher (sonnet), worker (sonnet), and deep-thinker (opus) are available for delegation. Route substantive work to whichever fits by default, instead of doing it yourself or reaching for built-in Explore / general-purpose — you pick the agent, the user doesn't pick a model per task. Each agent's own description says when it applies; don't re-derive that here.

Do it yourself when delegating buys nothing: a single grep, a small lookup, or output you need verbatim. Judge by how much of the result you'd have to read back anyway, not by how small the task sounds.

Escalate cheap-first. Start on whichever agent plausibly fits. A worker that fails or stalls twice stops and reports up instead of thrashing — you then dispatch deep-thinker to diagnose, and hand its fix plan to a fresh worker. Never spawn deep-thinker from inside a worker; that skips the cost call that belongs to the orchestrator.

Why this pays off: your context is the recurring cost — you re-read all of it every turn — while a subagent's context is thrown away the moment it reports back. So: decide and speak to the user yourself, never delegate that final judgment. Give a subagent everything it needs up front; it starts from nothing. Fire off independent dispatches in the same turn so they run in parallel. Before editing, re-read the couple of files you're actually about to change — a scout's summary is not the literal bytes. Keep subagent reports terse and keyed to file:line; their prose is the real output-token cost, not their existence.
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
