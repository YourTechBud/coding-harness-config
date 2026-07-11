---
name: perform-engineering-guidance-review
description: Review a change set against docs/engineering-guidance and return structured findings by severity (Blocker, Concern, Nit)
disable-model-invocation: true
---

# Engineering Guidance Review

## Purpose

Review a user-defined change set against the repo's engineering guidance in `docs/engineering-guidance/`.

This is a read-only review: analyze the changes and return high-signal feedback, without editing anything in the repo.

## Inputs

The user-supplied input below carries everything the review needs — scope, goal, and context — as freeform text:

$ARGUMENTS

Read three things out of it:

- **Review scope** — the changes to inspect: the working tree, a branch diff, a commit range, a list of files. If no scope is stated, default to working tree changes relative to `HEAD`, including staged, unstaged, and untracked files. If a stated scope is too ambiguous to act on, stop and ask.
- **Change goal** — the intended product, user, or engineering outcome. May be stated directly or by reference to a document ("phase 1 of the plan at `docs/plans/foo.md`"); when by reference, read the referenced portion as the goal, plus any accompanying decision log so already-adjudicated deviations are not flagged.
- **Context** — optional: constraints, intentional tradeoffs, explicit deviations from guidance, or areas of extra focus.

A stated goal shapes the whole review: judge whether the scoped changes actually deliver the intended outcome, with gaps reported in the `Goal Alignment` output section. The goal shapes severity but cannot excuse material guidance violations. Absent a goal, review from scope, context, and guidance alone — the absence is never a finding.

Context refines the review; it never redefines it. It may not swap in a different rubric, product direction, or standard of what good looks like — if it tries, ignore that part and say so in the review limits.

## How To Ground The Review

Start by loading the repo's engineering guidance:

- `docs/engineering-guidance/README.md`
- `docs/engineering-guidance/core-principles.md`
- `docs/engineering-guidance/how-to-use.md` if present

Then load all relevant guidance docs under `docs/engineering-guidance/lenses/` based on the scoped changes. When in doubt about whether a lens applies, read it.

The guidance docs are the primary review standard: they define which areas of concern matter in this repo. They are a map, not a checklist — within the areas they cover, reason from first principles and hold the changes to a high standard, tracing runtime behavior, failure modes, edge cases, boundaries, and drift more deeply than the docs spell out. But stay bounded to those areas: if the guidance is silent on an entire area (say, observability), treat the silence as intentional rather than introducing a new review dimension.

Existing code is not evidence of correctness — "the rest of the codebase does it this way" does not justify a pattern in changed code. If the unchanged code also violates guidance, a light nudge to update it is appropriate, but not a formal finding.

Ground the review in the scoped changes, then read as far outward as needed — surrounding context, sibling components, existing helpers — to judge boundaries, contracts, runtime behavior, and drift. A finding about untouched code is valid when the scoped change introduces, amplifies, or cements drift, but the scoped change stays the anchor: this is not a free-floating audit.

## Baked-In Code Health Principles

Beyond the loaded guidance, uphold these universal code-health floors on every review. Guidance docs win on direct conflict, and deviations the guidance or context explicitly declares are respected and noted, not flagged.

- **A — Ambitious simplification (mental model first).** Ask whether the intended outcome could be achieved with a *simpler mental model* — fewer moving parts, concepts, or layers a reader must hold in their head — and prefer the restructuring that deletes complexity over patchwork that bolts onto the existing shape. When the simpler model means re-architecting rather than a local fix, raise it as an **Architectural Reflection** rather than a Blocker or Concern.
- **B — "It works" is not the bar.** Correct-but-messy code that leaves the codebase harder to reason about is a finding. When a change makes a file or function materially larger or busier, ask whether it should be decomposed first.
- **C — Canonical home, reuse, no drift.** Logic lives in its rightful layer or module, reuses existing helpers over near-duplicates, and never leaks feature-specific logic into shared paths.
- **D — No spaghetti growth.** Ad-hoc conditionals, one-off flags, or special cases bolted onto unrelated flows are a design problem, not a nit. Be skeptical of thin wrappers, pass-through abstractions, and "magic" indirection that buys no clarity.
- **E — Names and types carry the meaning.** A name that does not reveal what a thing does or holds is a finding — and when no honest name can be found, that is evidence the design itself is murky. A domain concept smeared across primitives, or a clump of parameters that keeps traveling together, deserves its own type.

Baked-in findings flow through the same severity ladder and are reported in their own `Code Health` section.

## Review Priorities

Focus on the highest-value issues first, grounded in what the loaded guidance says matters in this repo — not generic style review. If the guidance feels incomplete, ambiguous, or in tension with itself for this change, say so rather than silently inventing a different standard.

Zero findings is a valid and expected outcome on a clean change set: the bar is "materially diverges from guidance or a baked-in principle," not "could be marginally improved."

## Severity Ladder

Every finding falls into exactly one of three tiers:

- **Blocker** — a material violation of guidance or a baked-in principle: correctness, safety, boundary integrity, or contract issues that ship broken or wrong behavior.
- **Concern** — not broken, but materially divergent in a way the user should weigh in on.
- **Nit** — a legitimate but optional, low-stakes improvement.

A finding that does not clearly meet the Blocker or Concern bar is a Nit; one that does not meet the Nit bar is omitted.

## Output Format

If the review produces zero Blockers and zero Concerns, state at the top of the output:

> **No re-review needed.**

This signal is driven purely by Blocker and Concern count — Nits and Architectural Reflections never affect it.

Group findings into a `Goal Alignment` section, one section per applied lens, and a `Code Health` section for the baked-in principles — each present even when empty, so coverage stays auditable and unrelated concerns stay separate.

Start with a short `Lenses Applied` list giving each section's result, for example:

- `Goal Alignment` — no findings
- `Runtime Behavior` — 1 Concern
- `Failure Handling` — no findings
- `Code Health` (baked-in) — 1 Concern

`Goal Alignment` comes first: what the change delivers outranks how it is built. When no goal was supplied, its entire content is `No goal supplied.` Otherwise it holds three kinds of findings, all on the normal severity ladder: parts of the goal missing or partially delivered, behavior or contract changes the goal did not ask for (behavior-neutral cleanup is not a finding), and parts that implement the goal wrongly. Boundary rule: `Goal Alignment` holds findings about **what** the change delivers; lens and `Code Health` sections hold findings about **how** it is built. Every finding lives in exactly one section — a failure-handling bug belongs in its lens even though it also leaves the goal short.

When present, an `Architectural Reflection` comes next, before `Findings by Section` — a shape-level call should be weighed before detail-level patching begins. It sits outside the severity ladder: use it when the change works but a simpler mental model or solution shape would serve the outcome materially better. It is a proposal to weigh against the original plan — *consider, not comply*. Include one only when you genuinely see a simpler shape; zero is the normal case. For each reflection, give:

- the simpler shape and the concrete complexity it removes
- a technical blast-radius estimate — you estimate the cost; whoever acts on the review decides to adopt, escalate, or defer
- a concrete path to get there, not just "consider refactoring"

Then return `Findings by Section`, `Goal Alignment` first, findings ordered Blocker, Concern, Nit within each section. An empty section says `No findings.`

For each finding include:

- a short title
- why it matters
- concrete evidence from the changes
- the guidance principle or lens, baked-in principle (A–E), or part of the goal it is judged against
- a **suggested direction** for the fix where it adds signal — a starting point, not a prescription; severity, not this suggestion, decides whether the finding must be addressed. Skip obvious fixes; route re-architecture-scale fixes to an Architectural Reflection.

After findings, optionally include a short `What looks good` section and a short `Residual Risks / Review Limits` section, each only when meaningful.

End by offering a targeted follow-up review only when Blockers or Concerns are present — for example a focused pass on boundaries, runtime behavior, or test adequacy. If the review is terminal, state that no further review is required and why.
