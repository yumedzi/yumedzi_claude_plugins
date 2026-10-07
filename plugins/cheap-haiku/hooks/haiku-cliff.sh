#!/usr/bin/env bash
# cheap-haiku: one script for four hook events, dispatched on hook_event_name.
#
# Haiku 5.5 is priced by prompt length: a request whose prompt is over 100,000
# tokens pays 5x on everything (input, cache writes/reads, output). The window is
# 1M and Claude Code auto-compacts near 967k, so nothing stops a Haiku session
# from sitting above the cliff for hours. This hook surfaces the cliff:
#
#   UserPromptSubmit, PostToolBatch (main thread only)
#       Project the next request's prompt size from the last usage block plus
#       what is about to be appended, and warn once per tier: approaching
#       (>= WARN), will cross (> THRESHOLD), crossed (last request > THRESHOLD).
#       PostToolBatch runs right before the next model call, which is the last
#       moment to act inside an agentic loop. CHEAP_HAIKU_MODE=block also stops
#       the loop / the prompt once per crossing.
#   PreModelSwitch
#       Switching to a Haiku 5.5 model with context already over THRESHOLD asks
#       for confirmation (interactive /model only; anywhere else it only warns,
#       since "ask" outside /model counts as a refusal).
#   SubagentStop
#       Report-only: a Haiku 5.5 subagent that made requests above THRESHOLD is
#       summarised after it finishes. A SubagentStop systemMessage only lands in
#       the subagent's own transcript, so the report is queued in the state dir
#       and shown by the next main-thread UserPromptSubmit / PostToolBatch.
#
# Output is systemMessage (shown to the user, never sent to the model) plus an
# optional terminalSequence desktop notification. The only model-visible output
# is the block `reason` in opt-in block mode.
#
# Repo rules: always exit 0, no jq, Python resolved as python3 or python, any
# failure swallowed. A PreModelSwitch hook that times out blocks the switch, so
# everything here stays cheap and returns nothing on doubt.
set -u

if [ "${CHEAP_HAIKU_DISABLE:-}" = "1" ]; then
  exit 0
fi

PY=""; for c in python3 python; do "$c" -c 'import sys; sys.exit(sys.version_info[0]<3)' 2>/dev/null && { PY=$c; break; }; done
[ -z "$PY" ] && exit 0

PAYLOAD="$(cat)"

CHEAP_HAIKU_PAYLOAD="$PAYLOAD" "$PY" - <<'PYEOF' 2>/dev/null
import json, os, re, sys

THRESHOLD_DEFAULT = 100000
WARN_DEFAULT = 85000
MODEL_RE_DEFAULT = r"haiku-5"
CHARS_PER_TOKEN = 3.0      # deliberately low: the 4.7+ tokenizer runs ~30% denser
IMAGE_TOKENS = 1600        # rough per-image estimate for tool results with images
TAIL_BYTES = 512 * 1024
SUBAGENT_MAX_BYTES = 16 * 1024 * 1024

# Haiku 5.5 list prices per MTok at or below the threshold. Above it every rate
# is 5x, so the extra cost of a crossing request is 4x these. Update here when
# pricing changes: platform.claude.com/docs/en/about-claude/pricing
PRICE = {"input": 0.10, "cache_5m": 0.125, "cache_1h": 0.20, "cache_read": 0.01, "output": 0.50}
LONG_MULT = 5.0


def env_int(name, default):
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


THRESHOLD = env_int("CHEAP_HAIKU_THRESHOLD", THRESHOLD_DEFAULT)
WARN = env_int("CHEAP_HAIKU_WARN", WARN_DEFAULT)
MODE = (os.environ.get("CHEAP_HAIKU_MODE") or "warn").strip().lower()
NOTIFY = (os.environ.get("CHEAP_HAIKU_NOTIFY") or "auto").strip().lower()
try:
    MODEL_RE = re.compile(os.environ.get("CHEAP_HAIKU_MODEL_RE") or MODEL_RE_DEFAULT, re.I)
except re.error:
    MODEL_RE = re.compile(MODEL_RE_DEFAULT, re.I)
STATE_DIR = os.path.join(os.environ.get("TMPDIR") or "/tmp", "claude-cheap-haiku")


def is_cliff_model(model):
    return bool(model) and bool(MODEL_RE.search(model))


def k(n):
    return "%dk" % round(n / 1000.0) if n >= 1000 else str(int(n))


def short_model(model):
    return re.sub(r"^.*?claude-", "", model or "") or "haiku"


def prompt_tokens(usage):
    return ((usage.get("input_tokens") or 0)
            + (usage.get("cache_creation_input_tokens") or 0)
            + (usage.get("cache_read_input_tokens") or 0))


def est_tokens(value):
    """Rough token estimate for a tool result / prompt: string or content blocks."""
    if value is None:
        return 0
    if isinstance(value, str):
        return int(len(value) / CHARS_PER_TOKEN)
    if isinstance(value, list):
        total = 0
        for block in value:
            if isinstance(block, dict):
                if block.get("type") == "image":
                    total += IMAGE_TOKENS
                elif "text" in block:
                    total += est_tokens(block.get("text"))
                else:
                    total += est_tokens(json.dumps(block))
            else:
                total += est_tokens(block)
        return total
    return est_tokens(json.dumps(value))


def last_main_usage(transcript_path):
    """(prompt, output, model) of the newest main-thread assistant turn, or None."""
    try:
        size = os.path.getsize(transcript_path)
        with open(transcript_path, "rb") as f:
            if size > TAIL_BYTES:
                f.seek(size - TAIL_BYTES)
                f.readline()  # drop the partial line
            data = f.read()
    except Exception:
        return None
    for line in reversed(data.decode("utf-8", errors="ignore").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        if entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        message = entry.get("message") or {}
        usage = message.get("usage")
        if not usage:
            continue
        return prompt_tokens(usage), (usage.get("output_tokens") or 0), message.get("model") or ""
    return None


def notify_seq(title, body):
    """Desktop notification escape sequence for terminalSequence, or None."""
    mode = NOTIFY
    if mode in ("off", "none", "0"):
        return None
    if mode == "auto":
        term = (os.environ.get("TERM_PROGRAM") or "").lower()
        if os.environ.get("KITTY_WINDOW_ID") or "kitty" in (os.environ.get("TERM") or ""):
            mode = "osc99"
        elif term in ("ghostty", "warpterminal"):
            mode = "osc777"
        elif term in ("iterm.app", "wezterm") or os.environ.get("WT_SESSION"):
            mode = "osc9"
        else:
            mode = "bell"
    # Keep control characters out of the payload text.
    body = re.sub(r"[\x00-\x1f\x7f;]", " ", body)
    title = re.sub(r"[\x00-\x1f\x7f;]", " ", title)
    if mode == "osc9":
        return "\x1b]9;%s: %s\x07" % (title, body)
    if mode == "osc777":
        return "\x1b]777;notify;%s;%s\x07" % (title, body)
    if mode == "osc99":
        return "\x1b]99;;%s: %s\x1b\\" % (title, body)
    if mode == "bell":
        return "\x07"
    return None


def emit(obj):
    print(json.dumps(obj))


def read_tier(session_id):
    try:
        with open(os.path.join(STATE_DIR, session_id)) as f:
            return int(f.read().strip() or "0")
    except Exception:
        return 0


def write_tier(session_id, tier):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(os.path.join(STATE_DIR, session_id), "w") as f:
            f.write(str(tier))
        return True
    except Exception:
        return False


def safe_id(session_id):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "")


def queue_report(session_id, msg):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(os.path.join(STATE_DIR, session_id + ".reports"), "a") as f:
            f.write(json.dumps(msg) + "\n")
    except Exception:
        pass


def pop_reports(session_id):
    path = os.path.join(STATE_DIR, session_id + ".reports")
    tmp = path + ".%d" % os.getpid()
    try:
        os.rename(path, tmp)  # atomic claim, so concurrent hooks can't double-show
    except Exception:
        return []
    msgs = []
    try:
        with open(tmp) as f:
            for line in f:
                try:
                    msgs.append(json.loads(line))
                except Exception:
                    pass
    finally:
        try:
            os.remove(tmp)
        except Exception:
            pass
    return msgs


def main_thread(payload, event):
    if payload.get("agent_id"):
        return  # subagents are report-only, see SubagentStop
    session_id = safe_id(payload.get("session_id"))
    if not session_id:
        return
    # Subagent reports queued by SubagentStop are shown here, on the main
    # thread, whatever model the main thread runs.
    reports = pop_reports(session_id)
    out = tier_output(payload, event, session_id) or {}
    if reports:
        msgs = [m for m in reports if isinstance(m, str)]
        if out.get("systemMessage"):
            msgs.append(out["systemMessage"])
        out["systemMessage"] = "\n".join(msgs)
        if "terminalSequence" not in out:
            seq = notify_seq("Claude Code", "Haiku subagent crossed the %s price tier" % k(THRESHOLD))
            if seq:
                out["terminalSequence"] = seq
    if out:
        emit(out)


def tier_output(payload, event, session_id):
    transcript_path = payload.get("transcript_path")
    if not transcript_path or not os.path.isfile(transcript_path):
        return None
    last = last_main_usage(transcript_path)
    if last is None:
        return None
    prompt, output, model = last
    if not is_cliff_model(model):
        return None

    if event == "PostToolBatch":
        added = sum(est_tokens((c or {}).get("tool_response")) for c in (payload.get("tool_calls") or []))
    else:
        added = est_tokens(payload.get("prompt"))
    projected = prompt + output + added

    prev = read_tier(session_id)
    if prompt < WARN and projected < WARN:
        if prev:
            write_tier(session_id, 0)  # compacted or cleared: re-arm
        return None

    if prompt > THRESHOLD:
        tier = 3
    elif projected > THRESHOLD:
        tier = 2
    else:
        tier = 1
    if prev == 3 and prompt <= THRESHOLD:
        # Compacted back under the cliff but not under WARN: re-arm the tiers
        # above where we are now.
        prev = tier - 1
        write_tier(session_id, prev)
    if tier <= prev:
        return None
    if not write_tier(session_id, tier):
        return None

    name = short_model(model)
    out = {}
    if tier == 1:
        out["systemMessage"] = (
            "%s context ~%s, next request ~%s of the %s cheap tier. "
            "/compact soon to stay at the low rate. (cheap-haiku)"
            % (name, k(prompt), k(projected), k(THRESHOLD)))
        return out

    if tier == 2:
        msg = ("%s context ~%s -> next request ~%s crosses the %s price tier "
               "(5x on every token). /compact now to stay cheap. (cheap-haiku)"
               % (name, k(prompt), k(projected), k(THRESHOLD)))
    else:
        msg = ("%s last request was ~%s, over the %s price tier: every request "
               "now bills at 5x until you /compact. (cheap-haiku)"
               % (name, k(prompt), k(THRESHOLD)))
    out["systemMessage"] = msg
    seq = notify_seq("Claude Code", "%s context %s, over %s price tier"
                     % (name, k(max(prompt, projected)), k(THRESHOLD)))
    if seq:
        out["terminalSequence"] = seq

    if MODE == "block" and tier == 2:
        # Once per crossing: the tier is already recorded, so the next attempt
        # (resubmitted prompt or "continue") goes through.
        if event == "PostToolBatch":
            out["decision"] = "block"
            out["reason"] = ("cheap-haiku stopped the loop: the next request (~%s tokens) "
                             "would cross the %s Haiku price tier. Wait for the user; they "
                             "will /compact or tell you to continue."
                             % (k(projected), k(THRESHOLD)))
        else:
            out["decision"] = "block"
            out["reason"] = ("cheap-haiku: this prompt would take the request to ~%s tokens, "
                             "over the %s Haiku price tier (5x). Run /compact first, or "
                             "resubmit to continue anyway." % (k(projected), k(THRESHOLD)))
    return out


def model_switch(payload):
    to_model = payload.get("to_model") or ""
    if not is_cliff_model(to_model):
        return
    try:
        ctx = int(payload.get("context_tokens") or 0)
    except (TypeError, ValueError):
        return
    if ctx < WARN:
        return
    name = short_model(to_model)
    if ctx > THRESHOLD:
        text = ("Context is ~%s: every %s request will bill at the over-%s rate (5x). "
                "/compact first to get the cheap tier." % (k(ctx), name, k(THRESHOLD)))
        if payload.get("source") == "command":
            emit({"hookSpecificOutput": {
                "hookEventName": "PreModelSwitch",
                "permissionDecision": "ask",
                "permissionDecisionReason": text + " Switch anyway?",
            }})
        else:
            # No decision: "ask" anywhere but interactive /model is a refusal,
            # and "allow" would skip Claude Code's own warm-cache confirmation.
            emit({"systemMessage": text + " (cheap-haiku)"})
        return
    emit({"systemMessage": "Context is ~%s, %s below the %s %s price tier. /compact soon "
                           "after switching to stay cheap. (cheap-haiku)"
                           % (k(ctx), k(THRESHOLD - ctx), k(THRESHOLD), name)})


def subagent_report(payload):
    path = payload.get("agent_transcript_path") or ""
    path = os.path.expanduser(path)
    if not path or not os.path.isfile(path):
        return
    seen = {}
    model = ""
    read = 0
    try:
        with open(path, "rb") as f:
            for raw in f:
                read += len(raw)
                if read > SUBAGENT_MAX_BYTES:
                    break
                try:
                    entry = json.loads(raw)
                except Exception:
                    continue
                if entry.get("type") != "assistant":
                    continue
                message = entry.get("message") or {}
                usage = message.get("usage")
                m = message.get("model") or ""
                if not usage or not is_cliff_model(m):
                    continue
                model = m
                # One API response is written as several entries (one per content
                # block) sharing message.id; keep the last copy, it has final usage.
                key = message.get("id") or entry.get("uuid") or str(len(seen))
                seen[key] = usage
    except Exception:
        return
    if not seen:
        return

    over = [u for u in seen.values() if prompt_tokens(u) > THRESHOLD]
    if not over:
        return
    peak = max(prompt_tokens(u) for u in seen.values())
    extra = 0.0
    for u in over:
        cc = u.get("cache_creation") or {}
        c1h = cc.get("ephemeral_1h_input_tokens") or 0
        c5m = (u.get("cache_creation_input_tokens") or 0) - c1h
        base = ((u.get("input_tokens") or 0) * PRICE["input"]
                + max(c5m, 0) * PRICE["cache_5m"]
                + c1h * PRICE["cache_1h"]
                + (u.get("cache_read_input_tokens") or 0) * PRICE["cache_read"]
                + (u.get("output_tokens") or 0) * PRICE["output"]) / 1e6
        extra += base * (LONG_MULT - 1)
    agent = payload.get("agent_type") or "subagent"
    msg = ("%s (%s) made %d/%d requests above the %s Haiku price tier "
           "(peak ~%s, ~$%.3f extra at list price). (cheap-haiku)"
           % (agent, short_model(model), len(over), len(seen), k(THRESHOLD), k(peak), extra))
    # A SubagentStop systemMessage lands in the subagent's own transcript, not
    # in front of the user, so queue it for the next main-thread hook.
    session_id = safe_id(payload.get("session_id"))
    if session_id:
        queue_report(session_id, msg)


def main():
    try:
        payload = json.loads(os.environ.get("CHEAP_HAIKU_PAYLOAD", ""))
    except Exception:
        return
    if not isinstance(payload, dict):
        return
    event = payload.get("hook_event_name")
    if event in ("UserPromptSubmit", "PostToolBatch"):
        main_thread(payload, event)
    elif event == "PreModelSwitch":
        model_switch(payload)
    elif event == "SubagentStop":
        subagent_report(payload)


try:
    main()
except Exception:
    pass
PYEOF

exit 0
