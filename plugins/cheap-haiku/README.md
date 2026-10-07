# cheap-haiku

Keeps Claude Haiku 5.5 on its cheap price tier, or at least tells you when it's leaving it.

Haiku 5.5 is priced by prompt length
([pricing](https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing)):

| Haiku 5.5, per MTok | input | 5m cache write | cache read | output |
|---|---|---|---|---|
| prompt up to 100,000 tokens | $0.10 | $0.125 | $0.01 | $0.50 |
| prompt over 100,000 tokens | $0.50 | $0.625 | $0.05 | $2.50 |

One request over the line pays 5x on every token in it, output included. Its window is 1M
and Claude Code auto-compacts it at about 967k, so nothing stops a Haiku session, or a
Haiku `Explore` / `scout` subagent, from running for hours on the expensive side. This
plugin watches for that line. It talks to you, not to the model: in the default mode it
costs zero model tokens.

Keep the size of the penalty in perspective: above the line Haiku 5.5 is still about 4x
cheaper than Sonnet 5.5 ($2 / $10). The fix is `/compact`, not switching model.

## Install

```
/plugin marketplace add yumedzi/yumedzi_claude_plugins
/plugin install cheap-haiku@yumedzi-claude-plugins
```

Or test locally without installing:

```
claude --plugin-dir ./plugins/cheap-haiku
```

Pairs with [`cheap-explore`](../cheap-explore) and [`smart-agents`](../smart-agents),
which push sweeps onto Haiku. This plugin tells you when one of those sweeps outgrew the
cheap tier.

## What it does

One script, `hooks/haiku-cliff.sh`, on four events:

- **`UserPromptSubmit` and `PostToolBatch`, main thread only.**
  - Reads the latest main-thread `usage` block from the transcript tail. This is the same
    tail-read as [`context-guard`](../context-guard). The prompt size is
    `input + cache_creation + cache_read`.
  - Projects the next request: last prompt + last output + whatever is about to be
    appended. That is either the tool results in the batch or the prompt you just typed,
    at about 3 characters per token, plus a flat estimate per image.
  - Only acts when the last response came from a model matching `CHEAP_HAIKU_MODEL_RE`
    (default `haiku-5`).
  - `PostToolBatch` runs after every batch of tool calls, right before the next model
    call. In a long agentic turn, that is the last moment anything can see the crossing
    coming.
- **`PreModelSwitch`** (`/model haiku` and friends).
  - Context already over 100k: an interactive `/model` gets a confirmation prompt saying
    every request will bill at 5x. Every other surface (`/config`, the SDK) only gets a
    warning, because Claude Code treats "ask" there as a refusal.
  - Context between `WARN` and 100k: a headroom note.
  - The hook never returns "allow", so Claude Code's own warm-cache confirmation still
    shows.
- **`SubagentStop`**, report only. When a Haiku 5.5 subagent finishes, its own transcript
  is read and you get a summary if any request crossed:

  `Explore (haiku-5-5) made 6/23 requests above the 100k Haiku price tier (peak ~131k, ~$0.040 extra at list price)`

  - Requests are deduplicated by `message.id`.
  - The extra cost is 4x the low-tier rates for the crossing requests, using a small price
    table in the script.
  - A `SubagentStop` `systemMessage` would only land in the subagent's own transcript, so
    the report is queued and shown by the next main-thread hook. That is normally the
    `PostToolBatch` right after the `Agent` call returns, or your next prompt for a
    background subagent.

Main-thread warnings come in three tiers, each shown **once per session**:

| tier | when | shows |
|---|---|---|
| approaching | projected next request >= `CHEAP_HAIKU_WARN` (85k) | `systemMessage` |
| will cross | projected next request > `CHEAP_HAIKU_THRESHOLD` (100k) | `systemMessage` + desktop notification; in block mode, also stops |
| crossed | last actual request > threshold | `systemMessage` + desktop notification |

- State is one small file per session under `${TMPDIR:-/tmp}/claude-cheap-haiku/`.
- When the context drops back below `WARN` (`/compact`, `/clear`), the tiers re-arm.
- After compacting from above 100k to somewhere between `WARN` and 100k, the tiers above
  the current one re-arm.

### Block mode

With `CHEAP_HAIKU_MODE=block`, the "will cross" tier also stops things before the
expensive request goes out:

- On `PostToolBatch`, it stops the agentic loop.
- On `UserPromptSubmit`, it blocks the prompt.

It blocks **once per crossing**. Resubmit the prompt, or tell Claude to continue, and it
goes through, so you stay in charge of whether the next stretch of work is worth 5x.

The block `reason` is read by the model. That is the one place this plugin costs tokens: a
few dozen, only in block mode, only when it fires.

## Configuration

All via environment variables, e.g. in `settings.json`'s `env` block:

| Variable | Default | Effect |
|---|---|---|
| `CHEAP_HAIKU_THRESHOLD` | `100000` | Price-tier boundary in tokens. |
| `CHEAP_HAIKU_WARN` | `85000` | Early-warning level in tokens. |
| `CHEAP_HAIKU_MODE` | `warn` | `block` also stops the loop / prompt once before crossing. |
| `CHEAP_HAIKU_MODEL_RE` | `haiku-5` | Regex (case-insensitive) for models with tiered pricing. Haiku 4.5 and older are flat-priced and excluded. |
| `CHEAP_HAIKU_NOTIFY` | `auto` | Desktop notification via `terminalSequence`. `auto` picks OSC 9 (iTerm2, WezTerm, Windows Terminal), OSC 777 (Ghostty, Warp), OSC 99 (kitty), else the terminal bell. Or set `osc9`, `osc777`, `osc99`, `bell`, `off`. |
| `CHEAP_HAIKU_DISABLE` | *(unset)* | Set to `1` to make every hook a no-op. |

Recommended alongside it, as a native backstop: run `/autocompact 100k` while on Haiku.

- From Claude Code v2.1.288 that is saved for the current model only. Before that it
  applies to every model.
- 100k is the smallest window the setting accepts. So it bounds how long a session stays
  above the line, but it doesn't stop the first crossing.
- That is why this plugin warns from 85k.

## Cost

Zero model tokens by default. `systemMessage` and `terminalSequence` are UI-only. The
exception is block mode's `reason`, see above.

Wall-clock cost is one Python run per prompt and per tool batch. That run reads up to
512KB of transcript tail, or up to 16MB of a finished subagent's transcript, and typically
takes well under 50ms.

## Requirements

`bash` and Python 3 on `PATH` (as `python3` or `python`). The hook tries both and skips a
broken Microsoft Store `python3` stub. With no working Python, every hook does nothing:
block mode fails *open*.

- `PreModelSwitch` needs Claude Code v2.1.251+.
- `PostToolBatch` needs a version that ships that event. On older versions only the
  per-prompt warning works.

## Caveats

- **The projection is an estimate, and it errs high.** Tool results are counted at about 3
  characters per token, to cover the newer, denser tokenizer, and images at a flat 1,600.
  Expect warnings a little early, not late.
- **The model is read from the last response.** Right after a `/model` switch, the first
  check still sees the old model. `PreModelSwitch` covers the switch itself.
- **Assumes cached tokens count toward the 100k.** The pricing page says "prompt length",
  and cache reads and writes are part of the prompt, so this is the conservative reading.
- **Subagents get no live warning, only a report after they finish.** That is deliberate.
  Nudging a subagent to wrap up would mean injecting text into its context, which costs
  tokens and changes its behavior.
- **Prices are hardcoded** for the extra-cost estimate in subagent reports. They are list
  prices for the first-party API. Bedrock and Google Cloud price separately, and
  negotiated rates aren't known to the hook. The warnings themselves only depend on the
  threshold.
- **Notifications depend on your terminal.** `terminalSequence` only fires in interactive
  sessions, and only terminals that understand the chosen OSC show anything. `-p` and
  Agent SDK runs get the `systemMessage` only.
- **Cannot compact for you.** Hooks can't trigger compaction. The plugin can only tell you,
  or stop and wait for you.

## Verification

Synthetic payload, without starting Claude Code:

```
T=$(mktemp -d)
echo '{"type":"assistant","message":{"model":"claude-haiku-5-5","usage":{"input_tokens":10,"cache_read_input_tokens":90000,"output_tokens":500}}}' > $T/t.jsonl
echo "{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"test\",\"transcript_path\":\"$T/t.jsonl\",\"prompt\":\"hi\"}" \
  | TMPDIR=$T bash plugins/cheap-haiku/hooks/haiku-cliff.sh
```

That prints the "approaching" warning. Live, with low thresholds so it triggers fast:

```
CHEAP_HAIKU_WARN=3000 CHEAP_HAIKU_THRESHOLD=8000 claude --plugin-dir ./plugins/cheap-haiku --model haiku
```
