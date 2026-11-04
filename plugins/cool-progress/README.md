# cool-progress

A Claude Code Desktop mod with two separate pieces.

**Progress bar above the prompt.** A light track with a purple gradient and round dots of varying brightness that stream right to left from the crab, an orange pixel crab riding inside it at the current position (it walks, snaps its claws and blinks while a turn runs, and only blinks when idle), the percent (or "done"), the elapsed time, and two counters pinned to the right edge: `🤖 N` running sub-agents and a small terminal window with `N` running background jobs (`>_ N` in the CLI). With a todo list the bar follows it; otherwise it is an estimate that speeds up and slows down with the number of model steps.

**Agents panel (`/cool-progress` toggles it).** Each sub-agent gets an animated 14 x 8 pixel mascot: crab, robot, owl, cat, ghost, wizard, fox, octopus, frog, dragon or penguin, matched by role keywords. An agent that matches none gets a kind no running agent has, and two agents of one kind wear different colours. Running mascots cycle their frames, bob and blink now and then, its model, an estimated progress bar, the current tool call, tool count, time, token count and estimated cost. Background jobs get a fixed-size terminal icon with a blinking cursor. The panel is three cards: Session (real session cost from the engine, context fill, turns, uptime, rate limits, estimated agent cost), Agents (model, estimated progress, context size, tokens, estimated cost) and Background. Timers freeze when a job ends. Finished agents and jobs are kept under a collapsed `Show completed (N)` row in each card (last 30 each), so their cost, context and time stay visible.

The Session card leads with a context ring: green under 250k tokens, yellow to 350k, red past it (or by share of a small window, whichever is worse). Session, turn and agent costs stand beside it. The panel picks one of three views by the pane's height, so it never needs to scroll: **full** (the cards), **middle** (a one-row strip led by the context ring, then one row per agent or job, then `+N more`) and **ultra** (the strip alone, with agent and job counts stacked in its last column; at the smallest height it goes slim, one line of icons and values with no labels, costs kept over the counts).

## Settings (`/config`)

`maxAgents`, `estimateSteps`, `agentEstimateSteps`, `mascotMap` (`scout=crab,worker=robot`), `defaultMascot` (empty by default: a different kind per agent), `spritesFile` (JSON of your own pixel mascots), `showCost`.

Cost is an estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill. Per-agent progress is a step-count estimate: there is no real completion signal.

Draws on the desktop surface (SVG). In the terminal CLI the band and the panel fall back to text: a block-character bar with a crab marker (on the desktop the crab walks, snaps its claws and blinks; idle, it only blinks), coloured card titles, text stat tiles, a pie glyph (◔ ◑ ◕) for context, character mascots and `>_` / `✓` job marks.

`claude plugin test plugins/cool-progress` renders the panel on the desktop and terminal surfaces in all three views.

## Install

```
/plugin install cool-progress --marketplace yumedzi/yumedzi_claude_plugins
```
