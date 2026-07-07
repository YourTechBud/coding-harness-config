---
name: shaping-milestones
description: |
  Domain companion for project milestone work — turns raw Sparks and project context into valuable milestone directions, hardens the chosen direction with boundaries and a done condition, and persists milestones and tasks only on explicit request. Pairs with the brainstorming skill, which supplies the session process.
  Invoke only when the user explicitly asks to shape milestones or work with Sparks.
disable-model-invocation: true
---

# Shaping Milestones

## Role

Domain companion for project-scoped milestone work: turn raw Sparks and
project context into valuable milestone directions, harden the chosen one,
and persist only on request. This skill owns the milestone domain — what
Sparks, milestones, and tasks are and what good ones look like. The session
process (hats, questioning, pushback, research) comes from the brainstorming
skill; use them together. The output is clarity — a small set of valuable
directions — not a full plan.

## Definitions

- **Spark:** a raw user idea, pain, bug, feature notion, content thought,
  observation, or unfinished thread. Sparks are raw material, not tasks or
  milestones. One Spark may split into many directions; many Sparks may
  merge into one; some should remain unshaped.
- **Milestone:** a lightweight continuation marker for a valuable direction
  of work — enough shape to know why it matters, roughly what we're doing,
  where to continue, and when to stop.
- **Task:** a focused phase of work under a hardened milestone, sized for
  one human-agent collaboration cycle, that meaningfully advances it.

## Phases

Milestone work moves through domain phases; each is a hat wearing project
clothes. Move fluidly — do not force every conversation through every phase.

1. **Collect** (Interviewer): gather Sparks and project context without
   judging too early.
2. **Discover value** (Interviewer + Scout): find what is underneath the
   ideas — the pain, learning, capability, decision, or deliverable. This
   is the heart of the skill: value before structure.
3. **Converge** (Shaper): compare candidate milestone directions; merge,
   split, park, or discard. Push back on the value premise: real value, or
   just an exciting implementation?
4. **Harden** (Shaper + Closer): make one direction safe to execute —
   boundaries, done condition, continuation point, rough tasks if useful.
5. **Persist** (Closer, only on explicit request): checkpoint using the
   conventions in `persistence.md`. Persistence can happen from any phase
   when the user asks to save or checkpoint something.

## Milestone Principles

- Value is the center: a milestone exists because something becomes better,
  clearer, easier, validated, shipped, fixed, taught, or unlocked. If the
  value is unclear, stay in discovery.
- Direction-shaped, not task-shaped: a milestone names a valuable direction
  and the rough path toward it. Tasks serve the milestone.
- Directional by default: preserve intent, value, boundaries, and
  continuation without freezing the implementation path early. Add detail
  only when the user has chosen it, it is already known, or precision
  reduces risk.
- One coherent center of gravity: if it is a bucket of unrelated work, it
  is a release, backlog, or cleanup list — not a milestone.
- Done condition: every milestone needs a stop signal — shipped, fixed,
  learned, validated, rejected, decided, usable enough, or clarified enough
  to reshape.
- Boundaries prevent sprawl: say what belongs now vs later; park
  valuable-but-premature ideas as future candidates.
- Continuation over completeness: enough context for future-you to resume
  beats a perfect plan.
- Reduce mental load: if maintaining a milestone feels heavier than the
  clarity it creates, simplify it.
- Priority stays with the user: compare tradeoffs, but never choose their
  active project or milestone unless asked.

## Task Principles

- Advance the milestone: a task that does not connect to the milestone's
  value or done condition belongs elsewhere.
- Phase, not micro-todo: "Prototype correction review flow", not "Add
  button".
- Clear outcome: state what should be true when done — an artifact,
  decision, working implementation, experiment result, or clarified issue.
- Discovery is allowed: exploratory tasks are valid when they have a clear
  learning or decision outcome.
- Directional by default: describe the outcome, direction, and known
  constraints — leave room for the human-agent session to discover the best
  path.
- Incremental value slices: prefer tasks that deliver, validate, or de-risk
  a small usable slice end-to-end; go horizontal only to unlock or de-risk
  later value.
- Collaboration-sized: one focused human-agent session; spillover is fine,
  but if it obviously spans many, split it.
- Lightweight dependencies: capture them only when they affect sequencing.
- Self-contained when persisted: future-you or a future agent should
  reorient from the task file alone.
- If useful tasks are hard to define, the milestone is not hardened yet —
  revisit its boundaries and done condition instead of inventing tasks.

## Quality Checks

A useful milestone can answer briefly: Why this? What direction? What
belongs now vs later? Where do I continue? How do I know it is done enough?
Does it reduce mental load?

A useful task can answer: What milestone does this advance? What phase of
progress is this? What should be true after it? Does it fit one
collaboration cycle? What must happen before it?

## Persistence

Persist only on explicit request — "save this", "checkpoint this", "write
the files". Approval of an idea is not persistence consent. When persisting,
follow `persistence.md`; local project conventions win if they exist.
