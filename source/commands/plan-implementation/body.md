
You are turning the current brainstorming session into an implementation plan. The plan will be handed to agents that have **zero context** on this work, so it must stand on its own.

<remarks>
$ARGUMENTS
</remarks>

If `<remarks>` is non-empty, treat it as the user's focus, scope, or emphasis for the plan and tailor accordingly.

## What makes the plan self-sufficient

The plan is a **reading-and-execution guide, not a knowledge dump**. A zero-context agent should be able to *become* sufficient by following the plan and its pointers — not by having everything copied in. Sort every piece of information into one of three buckets:

1. **Conversation residue** — decisions, rationale, intent, constraints, and rejected options that emerged in this session and live nowhere else yet. **Capture these in the plan.** This is the unique value you are preserving.
2. **Already-documented knowledge** — ADRs, docs, specs, tickets, existing code. **Reference these, never copy them.** Point with a path or URL *plus* what to look at and why it matters. Reference code by file and symbol/concept, not line numbers (they drift).
3. **Connective tissue** — how the pieces fit, the sequencing, and what "done" looks like for each phase. **Capture this in the plan.**

Do not duplicate content that already lives in another artifact. Redact secrets (API keys, passwords, PII).

## Ground, then clarify, then write

1. **Ground yourself.** Mine the conversation for decisions and intent, then do targeted read-only exploration of the repo (relevant files, docs, ADRs) to find the pointers the plan will reference. Look things up rather than guessing.
2. **Clarify the gaps.** Ask the user only the questions that grounding could not answer — genuine gaps that would change the plan. Do not re-ask what you can find yourself, and do not interrogate. A clean design that breaks public/API/contract/DB-schema compatibility is always such a gap — confirm the break explicitly before writing it into the plan.
3. **Write** the plan once the gaps are closed.

## Architectural stance

Plan for the cleanest design and the simplest mental model the problem allows — not the smallest diff against what exists today. Bold refactors are on the table: if reshaping existing structure yields a clearer, simpler system, plan for that rather than bending the design to preserve current internals. Where the repo has engineering guidance (e.g. `docs/engineering-guidance`), fold it into the design and honor it.

One hard gate: if the cleanest design **breaks a public contract** — a public/API surface, a wire/contract format, or a DB schema — do not silently bake that into the plan. Treat it as a gap to clarify (see above): surface the break, the cleaner design it buys, and the migration cost, then get explicit confirmation before committing to it. Once confirmed, capture the decision, the break, and the migration/rollout approach as conversation residue in the plan. Internal refactors that cross none of those boundaries need no gate — just plan them boldly.

## Phasing

Split the work into phases. Keep the number of phases to a minimum — never add a phase that is not independently meaningful. Each phase must be:

- **A vertical slice** — cuts through the layers to deliver working behavior, not a horizontal layer (e.g. "all the schema," "all the UI").
- **Independently valuable** — delivers something real on its own.
- **Independently reviewable** — a human reviewer can review it in isolation.
- **Independently testable** — its correctness can be verified on its own.

Keep each phase's body freeform; organize it however best serves a fresh agent. Make sure the goal, the work involved, how to verify it, and the references it depends on are all discoverable.

## Output

Write the plan to a single markdown file at `scratch/plans/<slug>.md`, where `<slug>` is a short descriptive kebab-case name for the work. **Never overwrite an existing plan** — if that file already exists, append `-2`, `-3`, … until the name is free.

Create only that one file; do not make any other edits. When done, report the path back to the user.
