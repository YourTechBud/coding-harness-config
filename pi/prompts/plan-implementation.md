---
description: Turn a brainstorming session into a phased, self-sufficient implementation plan
---

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

**A phase may leave functionality degraded.** Optimizing for the cleanest end-state sometimes means an intermediate phase regresses behavior — a feature switched off, routed through a stub, or temporarily less capable — so the architecture can be reshaped without contorting the sequence. This is allowed and often preferable to bending the design to keep everything working at every step. **Degraded is not broken**, though: every phase must still leave the system *coherent* — it builds, it runs, and its tests pass. And every degradation is a debt: name it, and name the later phase that pays it back, both in the phase write-up and in the decision log (see below). Never let a degradation go silent.

**Public-contract breaks are the one hard gate.** If the cleanest design breaks a public contract — a public/API surface, a wire/contract format, or a DB schema — do not silently bake it in. Treat it as a gap to clarify (see above): surface the break, the cleaner design it buys, and the migration cost, then get explicit confirmation before committing to it. Once confirmed, capture the decision, the break, and the migration/rollout approach as conversation residue in the plan. Internal refactors and degradations that cross none of those boundaries need no separate gate — just plan them boldly.

## Architecture overview (open the plan with this)

Open the plan with a concise architecture overview, before the phases. Writing it is not busywork — it forces you to reason about clean-architecture moves, breakage, and payback in fixed slots before you commit to the phase prose, and it gives a fresh agent the shape of the whole effort at a glance. Keep it tight; it is a map, not the plan.

Structure it exactly like this:

- **Target architecture** — the end-state shape you are driving toward and the simplest mental model for it, in a few sentences.
- **Principles applied** — the clean-architecture principles or guidance you are leaning on, and where they bite.
- **Phase map** — one block per phase, each with these fixed fields:
  - **Goal** — what this phase changes.
  - **Clean-arch move** — what it restructures or simplifies.
  - **Breaks / degrades** — what stops working or gets worse (or "nothing").
  - **Paid back by** — the later phase that restores it, or "permanent" if the degradation is the intended end-state.
  - **⚠ Public-contract break?** — flag if it touches a public/API surface, wire format, or DB schema; otherwise omit.

## Phasing

Split the work into phases. Keep the number of phases to a minimum — never add a phase that is not independently meaningful. Each phase must be:

- **Coherent** — it builds, runs, and passes its tests. It may leave functionality degraded (see "Architectural stance"), but never the system broken.
- **Independently reviewable** — a human reviewer can review it in isolation.
- **Independently testable** — its correctness can be verified on its own.

Prefer slices that cut through the layers rather than horizontal layers (e.g. "all the schema," "all the UI") — but a phase whose whole purpose is architectural restructuring is legitimate even when it ships no new user-facing value on its own.

Keep each phase's body freeform; organize it however best serves a fresh agent. Make sure the goal, the work involved, how to verify it, the references it depends on, and — as its closing step — the decision-log update are all discoverable.

## Decision log

Phases are implemented by separate zero-context agents, so each phase must hand the next one a written trail of what it actually did and what it left behind. The plan carries this as a **decision log** kept at `scratch/plans/<slug>-decisions.md` — right next to the plan, one file for the whole effort.

Do not create this file yourself; it is an execution-time artifact. Instead, bake its upkeep into the plan so the implementing agents maintain it naturally:

- Tell agents to **read the decision log at the start of each phase** (alongside the plan) so they inherit prior decisions and any debt owed to them.
- Make the **final step of every phase** an update to the decision log, appending under that phase's heading: the decisions made and why, any deviations from the plan, and every degradation/debt introduced with the phase that will pay it back.
- The plan itself stays immutable — agents record drift in the log, never by editing the plan.

Weave this in lightly — a natural closing step in each phase, not a heavy ceremony. The goal is that decisions and deferred work are never lost between phases, without the plan reading like a process manual.

## Output

Write the plan to a single markdown file at `scratch/plans/<slug>.md`, where `<slug>` is a short descriptive kebab-case name for the work. **Never overwrite an existing plan** — if that file already exists, append `-2`, `-3`, … until the name is free.

Create only that one file; do not make any other edits — in particular, do not create the decision-log file, which the implementing agents create at execution time. When done, report the path back to the user.
