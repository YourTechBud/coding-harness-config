---
name: perform-engineering-guidance-review
description: Review a change set against docs/engineering-guidance and return structured findings by severity (Blocker, Concern, Nit)
---

# Engineering Guidance Review

## Purpose

Review a user-defined change set against the repo's engineering guidance in `docs/engineering-guidance/`.

This is a read-only review. Do not make code changes, do not edit files, and do not perform any write actions in the repo. You are here to analyze changes and return high-signal feedback.

## Inputs

The user-supplied input below carries everything the review needs — scope, goal, and context — as freeform text:

[Arguments supplied by the user]

Read three things out of it:

- **Review scope** — how to determine the changes to inspect: the working tree, a branch diff, a commit range, a list of files. If no scope is stated, default to the current working tree changes relative to `HEAD`, including staged, unstaged, and untracked files. If a scope is stated but too ambiguous to act on, stop and ask the user to clarify.
- **Change goal** — the intended product, user, or engineering outcome of the change. The goal may be stated directly, or by reference to a document — for example "phase 1 of the plan at `docs/plans/foo.md`". When stated by reference, read the referenced document and treat the referenced portion as the goal; if the plan has an accompanying decision log, read it too, so intentional, already-adjudicated deviations are not flagged as findings.
- **Context** — optional and used sparingly: constraints, intentional tradeoffs, explicit deviations from guidance, or narrowly scoped areas of extra focus.

A stated goal shapes the whole review: judge whether the scoped changes are complete, appropriately scoped, and actually deliver the intended outcome — goal-alignment gaps flow through the normal severity ladder and are reported in the dedicated `Goal Alignment` output section. Absent a goal, review from scope, context, and guidance alone — the absence is never a finding, though the `Goal Alignment` section states it factually as `No goal supplied.` The goal is outcome context, not a replacement for engineering guidance: it can shape severity, but it cannot excuse material guidance violations.

Context refines the review; it never redefines it. It may record real constraints, intentional tradeoffs or deviations from guidance, or ask for extra attention on an in-scope concern — but it may not swap in a different rubric, product direction, or standard of what good looks like. If it tries, ignore that part and say so in the review limits or assumptions.

## How To Ground The Review

Start by loading the repo's engineering guidance:

- `docs/engineering-guidance/README.md`
- `docs/engineering-guidance/core-principles.md`
- `docs/engineering-guidance/how-to-use.md` if present

Then load all relevant guidance docs under `docs/engineering-guidance/lenses/` based on the scoped changes. Read broadly — when in doubt about whether a lens applies, read it. It is better to load an extra lens than to miss a relevant one.

Treat the engineering guidance docs as the primary review standard: they define the **areas of concern** that matter in this repo and the baseline bar within them. They are a map of what to look at, not an exhaustive checklist. Within the areas they cover, reason from first principles and general engineering judgment — trace runtime behavior, failure modes, edge cases, boundaries, and drift more deeply than the docs spell out, and hold the changes to a high standard for what good looks like.

Stay bounded to the areas the guidance actually covers. If the guidance is silent on an entire area (for example, observability), treat that silence as intentional — do not introduce it as a new review dimension. First-principles reasoning deepens the existing lenses; it does not add new ones.

Existing code is not evidence of correctness — do not accept "the rest of the codebase does it this way" as justification for a pattern in changed code. If the unchanged source pattern also violates guidance, a light nudge to consider updating it is appropriate, but not a formal finding.

Ground the review in the scoped changes, then read as far outward as the review needs — surrounding context, sibling components, existing helpers, established patterns — to judge boundaries, contracts, runtime behavior, failure handling, drift, and verification quality. A finding about untouched code is valid when the scoped change introduces, amplifies, or cements drift or inconsistency, but the scoped change stays the anchor: this is not a free-floating audit of code the change does not touch.

## Baked-In Code Health Principles

Beyond the loaded guidance, uphold these universal code-health floors on every review. They raise how hard you push within the areas the guidance covers — they do not add new concern areas — and engineering-guidance docs win on direct conflict. Respect and note deviations the guidance or context explicitly declares.

- **A — Ambitious simplification (mental model first).** Do not stop at "this could be cleaner." Ask whether the intended outcome could be achieved with a *simpler mental model* — fewer moving parts, concepts, or layers a reader has to hold in their head — and prefer the bold restructuring that deletes complexity over incremental patchwork that bolts onto the existing shape. When the simpler model means re-architecting the solution shape rather than a local fix, raise it as an **Architectural Reflection** (see Output Format) rather than a Blocker or Concern.
- **B — "It works" is not the bar.** Correct-but-messy code that leaves the codebase harder to reason about is a finding, not a pass. When a change makes a file or function materially larger or busier, ask whether it should be decomposed first.
- **C — Canonical home, reuse, no drift.** Logic should live in its rightful layer or module, reuse existing helpers over near-duplicates, and never leak feature-specific logic into shared or general-purpose paths.
- **D — No spaghetti growth.** Ad-hoc conditionals, one-off flags, or special cases bolted onto unrelated flows are a design problem, not a nit. Be skeptical of thin wrappers, identity or pass-through abstractions, and "magic" mechanisms that add indirection without buying clarity; prefer pushing logic into a proper abstraction or model.
- **E — Names and types carry the meaning.** A name that does not reveal what a thing does or holds is a finding — and when no honest name can be found, treat that as evidence the design itself is murky, not as a naming problem to wordsmith around. A domain concept smeared across primitives, or a clump of parameters that keeps traveling together, deserves its own type.

Baked-in findings flow through the same severity ladder as everything else and are reported in their own `Code Health` section — see Output Format.

## Review Priorities

Focus on the highest-value issues first, grounded in what the loaded guidance says matters in this repo — do not become a generic style reviewer. If the guidance feels incomplete, ambiguous, or in tension with itself for the scoped change, say so explicitly rather than silently inventing a different standard.

Surface every real finding, but do not pad. Zero findings is a valid and expected outcome on a clean change set: the bar for a finding is "this materially diverges from guidance or a baked-in code health principle," not "this could be marginally improved."

## Severity Ladder

Every finding falls into exactly one of three tiers. Use these definitions strictly — do not smear findings across tiers, and do not invent a tier in between.

### Blocker

A material violation of guidance or a baked-in code health principle — correctness, safety, boundary integrity, or contract issues that ship broken or wrong behavior.

### Concern

A design, boundary, runtime, or code-health gap with real consequence — not broken, but materially divergent from guidance or a baked-in principle in a way the user should weigh in on.

### Nit

A marginal improvement — a legitimate observation, but optional and low-stakes.

If a finding does not clearly meet the bar for Blocker or Concern, it is a Nit. If it does not meet the bar for Nit either, it should not appear in the output.

## Output Format

If the review produces zero Blockers and zero Concerns, state at the top of the output:

> **No re-review needed.**

This signal is driven purely by Blocker and Concern count — it is independent of Nit count and of any Architectural Reflection, and neither Nits nor Architectural Reflections alone ever warrant a re-review.

Group output by a dedicated `Goal Alignment` section, the guidance lenses you loaded and applied, plus a dedicated `Code Health` section for the baked-in principles, giving N+2 sections where N is the number of applied lenses. The `Goal Alignment` section, every applied lens, and the `Code Health` section must each have their own section, even when they have no findings. This makes coverage auditable and prevents unrelated concerns from being blended together.

Start with a short `Lenses Applied` section listing the `Goal Alignment` entry, each loaded/applied lens, and the `Code Health` (baked-in) entry with its result, for example:

- `Goal Alignment` — no findings
- `Runtime Behavior` — 1 Concern
- `Failure Handling` — no findings
- `Test Adequacy` — 1 Nit
- `Code Health` (baked-in) — 1 Concern

`Goal Alignment` comes first among the findings sections: what the change delivers outranks how it is built. When no goal was supplied, its entire content is `No goal supplied.` When a goal was supplied, it holds three kinds of findings, all flowing through the normal severity ladder: parts of the goal that are missing or only partially delivered, behavior or contract changes the goal did not ask for (behavior-neutral cleanup is not a finding), and parts that look implemented but implement the goal wrongly.

Boundary rule: `Goal Alignment` holds findings about **what** the change delivers versus the stated goal; lens and `Code Health` sections hold findings about **how** it is built. Every finding lives in exactly one section — a failure-handling bug belongs in its lens even though it also leaves the goal short.

When present, an `Architectural Reflection` comes here, before `Findings by Section` — a shape-level call outranks detail-level findings and keeps the consumer of the review from patching before weighing whether the shape itself should change. It sits outside the severity ladder: use it when the change works but a simpler mental model or solution shape would serve the outcome materially better. Frame it as a proposal to weigh against the original plan — *consider, not comply* — never a directive. Include it only when you genuinely see a simpler shape; zero is the normal case, and it never triggers a re-review.

For each reflection, give:

- the simpler shape and the concrete complexity it removes
- a technical blast-radius estimate (code and boundaries touched) — you estimate the cost; whoever acts on the review weighs it against the plan to adopt, escalate, or defer
- a concrete path to get there, not just "consider refactoring"

Then return `Findings by Section`, starting with `Goal Alignment`. Within the `Goal Alignment` section, each lens section, and the `Code Health` section, return findings in this order:

1. `Blocker`
2. `Concern`
3. `Nit`

If a section has no findings, say `No findings.` in that section — except `Goal Alignment` when no goal was supplied, which says `No goal supplied.` instead.

For each finding include:

- a short title
- why it matters
- concrete evidence from the changes
- the relevant engineering guidance principle or lens, the baked-in code health principle (A–E), or the part of the stated goal the finding is judged against
- a **suggested direction** for the fix where it adds signal — a starting point, not a prescription; severity, not this suggestion, decides whether the finding must be addressed. Skip obvious fixes; route re-architecture-scale fixes to an Architectural Reflection.

If there are no findings at all, say so explicitly.

After findings, optionally include:

- a short `What looks good` section, only if meaningful
- a short `Residual Risks / Review Limits` section, if needed

End by offering a targeted follow-up review **only when Blockers or Concerns are present**. For example, invite the user to ask for a focused pass on a specific area like boundaries, runtime behavior, failure handling, or test adequacy. If the review is terminal (no Blockers or Concerns), mention explicitly that no further review is required with the reason.
