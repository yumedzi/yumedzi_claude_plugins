#!/usr/bin/env bash
# context-guard: UserPromptSubmit hook.
#
# Warns (via systemMessage, user-visible only — never sent to the model, never
# written to the transcript) when context usage crosses 35% and again at 50%.
# Fires at most once per threshold per session. Never blocks the prompt: this
# is advisory only, since hooks cannot prompt interactively (no /dev/tty) and
# cannot trigger compaction — see code.claude.com/docs/en/hooks.
#
# Rules matching the rest of this repo's hooks:
#   - always exit 0 (never break the prompt path)
#   - no jq dependency
#   - any unexpected failure is swallowed silently
set -u

# Escape hatch.
if [ "${CONTEXT_GUARD_DISABLE:-}" = "1" ]; then
  exit 0
fi

PAYLOAD="$(cat)"

WARN1="${CONTEXT_GUARD_WARN1:-35}"
WARN2="${CONTEXT_GUARD_WARN2:-50}"
LIMIT_OVERRIDE="${CONTEXT_GUARD_LIMIT:-}"
STATE_DIR="${TMPDIR:-/tmp}/claude-context-guard"

CONTEXT_GUARD_PAYLOAD="$PAYLOAD" python3 - "$WARN1" "$WARN2" "$LIMIT_OVERRIDE" "$STATE_DIR" <<'PYEOF' 2>/dev/null
import json, sys, os

def main():
    warn1 = float(sys.argv[1])
    warn2 = float(sys.argv[2])
    limit_override = sys.argv[3].strip()
    state_dir = sys.argv[4]

    try:
        payload = json.loads(os.environ.get("CONTEXT_GUARD_PAYLOAD", ""))
    except Exception:
        return

    transcript_path = payload.get("transcript_path")
    session_id = payload.get("session_id")
    if not transcript_path or not session_id:
        return
    if not os.path.isfile(transcript_path):
        return

    # Tail-read: transcripts can be tens of MB. Grab the last 512KB, drop the
    # first (likely partial) line, scan remaining lines newest-first for the
    # latest main-thread assistant turn with a usage block.
    CHUNK = 512 * 1024
    try:
        size = os.path.getsize(transcript_path)
        with open(transcript_path, "rb") as f:
            if size > CHUNK:
                f.seek(size - CHUNK)
                f.readline()  # discard partial line
            else:
                f.seek(0)
            data = f.read()
    except Exception:
        return

    lines = data.decode("utf-8", errors="ignore").splitlines()

    used = None
    model = None
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        if entry.get("type") != "assistant":
            continue
        if entry.get("isSidechain"):
            continue
        message = entry.get("message") or {}
        usage = message.get("usage")
        if not usage:
            continue
        used = (
            (usage.get("input_tokens") or 0)
            + (usage.get("cache_creation_input_tokens") or 0)
            + (usage.get("cache_read_input_tokens") or 0)
        )
        model = message.get("model")
        break

    if used is None:
        return  # no usage found in the tail; nowhere near threshold anyway

    # Determine the context window limit.
    if limit_override:
        try:
            limit = int(limit_override)
        except ValueError:
            limit = 200000
    else:
        limit = 200000  # every current Opus/Sonnet/Haiku/Fable id defaults here
        tiers = [200000, 500000, 1000000]
        # Self-correct: if usage already exceeds the assumed limit, the
        # session must be on a larger window (e.g. 1M-context beta) — no
        # payload field advertises this directly, so escalate tiers.
        for tier in tiers:
            if used <= tier:
                limit = tier
                break
        else:
            limit = tiers[-1]

    if limit <= 0:
        return

    pct = (100.0 * used) / limit

    tier_hit = 0
    if pct >= warn2:
        tier_hit = 2
    elif pct >= warn1:
        tier_hit = 1

    if tier_hit == 0:
        return

    # Once-per-tier-per-session state.
    try:
        os.makedirs(state_dir, exist_ok=True)
    except Exception:
        return
    state_file = os.path.join(state_dir, session_id)

    prev_tier = 0
    try:
        with open(state_file) as f:
            prev_tier = int(f.read().strip() or "0")
    except Exception:
        prev_tier = 0

    if tier_hit <= prev_tier:
        return  # already warned at this tier (or higher)

    try:
        with open(state_file, "w") as f:
            f.write(str(tier_hit))
    except Exception:
        return

    threshold = warn2 if tier_hit == 2 else warn1
    used_k = f"{used // 1000}k" if used >= 1000 else str(used)
    limit_k = f"{limit // 1000}k" if limit >= 1000 else str(limit)
    msg = (
        f"⚠ Context {pct:.0f}% ({used_k}/{limit_k} tokens"
        f"{', model ' + model if model else ''}) "
        f"— consider /compact or wrapping up soon. "
        f"(context-guard, {threshold:.0f}% threshold)"
    )

    print(json.dumps({"systemMessage": msg}))

main()
PYEOF

exit 0
