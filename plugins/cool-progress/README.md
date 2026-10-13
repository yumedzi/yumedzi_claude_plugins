# cool-progress

A Claude Code Desktop mod with two separate pieces.

**Progress bar above the prompt.** A light track with a purple gradient and round dots of varying brightness that stream right to left from the crab, an orange pixel crab riding inside it at the current position, the percent (or "done"), the elapsed time, and two counters: `🤖 N` running sub-agents and `>_ N` running background jobs. With a todo list the bar follows it; otherwise it is an estimate that speeds up and slows down with the number of model steps.

**Agents panel (`/cool-progress` toggles it).** Each sub-agent gets an animated mascot (crab, robot, owl, cat, ghost, wizard, matched by role), its model, an estimated progress bar, the current tool call, tool count, time, token count and estimated cost. Background jobs get a fixed-size terminal icon with a blinking cursor. The panel is three cards: Session (real session cost from the engine, context fill, turns, uptime, rate limits, estimated agent cost), Agents (model, estimated progress, context size, tokens, estimated cost) and Background. Timers freeze when a job ends. Finished agents and jobs are kept under a collapsed `Show completed (N)` row in each card (last 30 each), so their cost, context and time stay visible.

## Settings (`/config`)

`maxAgents`, `estimateSteps`, `agentEstimateSteps`, `mascotMap` (`scout=crab,worker=robot`), `defaultMascot`, `spritesFile` (JSON of your own pixel mascots), `showCost`.

Cost is an estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`), not a bill. Per-agent progress is a step-count estimate: there is no real completion signal.

Draws on the desktop surface (SVG). In the terminal CLI the band and the panel fall back to text: a block-character bar with a crab marker, coloured card titles, text stat tiles, character mascots and `>_` / `✓` job marks.

## Install

```
/plugin install cool-progress --marketplace yumedzi/yumedzi_claude_plugins
```
