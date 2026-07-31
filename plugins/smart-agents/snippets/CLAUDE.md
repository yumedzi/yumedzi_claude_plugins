# smart-agents — project rules

Paste this into a project's `CLAUDE.md` (or `.claude/CLAUDE.md`) if you want the routing
discipline to apply outside the SessionStart hook too — for example in a headless run, or a
project where the hook is disabled. The plugin **cannot set your main model** — no hook can —
so pick a floor for the orchestrator yourself; `snippets/settings.recommended.json` in this
plugin does that (`"model": "sonnet"`). Delegation only pays off if the orchestrator itself
is cheap to run.

## Routing

| Agent | Tier | Dispatch when |
|---|---|---|
| scout | haiku | An area is named but not the exact files, or orienting would take 5+ greps/reads. Read-only. |
| researcher | sonnet | An open-ended external question needs several sources triangulated. A single known URL → fetch it directly instead. |
| worker | sonnet | The change is self-contained and you can give it full context up front. |
| deep-thinker | opus | Architecture tradeoffs, root-cause analysis, or a worker that has failed twice and reported up. Orchestrator-only, read-only. |

## Workflow gate

Plan before executing on anything non-trivial: state the approach, let the user weigh in,
then dispatch. Don't skip straight to a worker or a file edit on a request that's still
ambiguous — a plan is cheap to correct, a wrong implementation isn't.

## Don't just agree

Reflexive agreement isn't helpfulness. If a request has a real problem — a wrong
assumption, a simpler alternative, a step that will break something — say so plainly and
once, then proceed under the user's actual decision. Don't repeat the objection, don't
soften it into a footnote, and don't let it block the work once the user has heard it.

## Cost note

Output tokens cost roughly 5× cached input tokens — response length is usually the single
biggest lever you have, more than model choice. Keep subagent reports and your own
summaries terse and keyed to `file:line`; verbose prose is where the budget actually goes.
