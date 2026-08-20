# Shaping Reference

## Product Lens

Shape milestones and stories around value that becomes available through the chosen increment rather than the engineering route or completeness of an eventual architecture. Preserve enough reasoning to help later collaborators challenge earlier technical ideas without losing the goal those ideas served.

## Milestone Contract

A milestone has a clear product goal, why that goal matters, a coherent scope, and a completion condition. Its supporting context adapts to the conversation and may include:

- The product experience or capability being pursued.
- Consequential decisions with their rationale and serious alternatives.
- Tradeoffs that explain the chosen direction.
- Known unresolved areas and why they matter.
- Boundaries and deliberately excluded directions.
- Material scope changes and the reasoning behind them.
- Relationships to its stories.

Keep the milestone mostly stable after shaping. Revise it when its product direction, boundary, completion condition, or story set changes materially. Keep routine progress and engineering execution history in the story's working context or temporary plan.

Persist processed understanding. Preserve context when losing it would cause a future collaborator to misunderstand the goal, repeat an important debate, or overlook known uncertainty.

## Candidate Milestone Contract

A candidate milestone preserves a possible later product outcome, why it may matter, why it was deferred, and whatever relationships, activation signals, or originating reasoning would be expensive to recover. Adapt its supporting context to the conversation.

A candidate milestone has no stories and makes no implementation commitment. It may later change, merge, or disappear. When it becomes relevant, use it as input to a fresh shaping discussion rather than promoting it directly to a hardened milestone.

## Sequencing the Direction

In Sharpen, identify the coherent promise that provides worthwhile value now and separate later increments into candidate milestones when preserving them is useful. A valuable increment may be a product experience, operational improvement, learning result, or enabling capability that unlocks immediate use.

Let the human choose how much sequence to preserve: the active milestone alone, its likely successor, or a broader candidate roadmap. Make dependencies and accepted rework visible when they affect that choice. Treat deferred candidates as options whose value and order can change, not as obligations.

## Story Contract

A story names one coherent product, operational, learning, or enabling outcome under its parent milestone. It provides observable value or unlocks immediate use, has acceptance criteria, and carries the branch-local context that later brainstorming cannot cheaply recover from the milestone or repository.

Useful story context may include:

- Why the story exists and how it advances the milestone.
- Product behavior, constraints, or experience that should survive changes in implementation.
- Current ideas, hypotheses, and serious alternatives that seed later brainstorming.
- Genuine dependencies or downstream consumers.

Treat the story as a starting hypothesis. Later brainstorming may choose a different engineering route while preserving the story when its outcome and acceptance criteria still hold. Use this skill again when the product outcome, acceptance criteria, or milestone story set needs reshaping.

## Story Kinds

### Exploration

Use an exploration story when a consequential uncertainty should be reduced before downstream product work is shaped or implemented. Research, inspection, discussion, and prototyping are possible methods within the story rather than separate story kinds.

State the uncertainty, the decisions it should enable, and the milestone or downstream stories that will consume the result. Its acceptance criteria cover a usable verdict and the resulting reconciliation:

- Resolve or narrow the named uncertainty enough to act.
- Make the consequential conclusions and supporting evidence clear.
- Assess feasibility, including an explicit infeasible result when that is what the evidence supports.
- Using the milestone skill, reconcile the conclusions into the parent milestone and every affected downstream story.

Reconciliation may confirm, revise, add, remove, split, or merge stories, or reshape the milestone itself.

### Implementation

Use an implementation story for a coherent valuable outcome whose major uncertainties are understood well enough to build. Its acceptance criteria describe observable behavior or capability and a coherent end state while allowing later engineering work to choose the implementation.

An implementation story may receive a temporary phase plan when its reasoning or execution burden benefits from one. The completed story leaves the product in a stable state and repays temporary debt introduced within its plan.

### Release

Use a release story when an external transition is itself exceptional work requiring live human judgment, coordination, verification, or recovery decisions. Examples include a one-time migration, customer cutover, or novel infrastructure transition.

Routine publication follows the repository's established release process. Building or changing release capability is an implementation story.

## Acceptance Criteria

Write acceptance criteria as observable outcome conditions with a clear pass-or-fail judgment. Keep them independent of the code structure and implementation sequence so a later brainstorming session can improve the engineering route without silently changing the promised outcome.

Cover the conditions that distinguish success from a plausible but materially incomplete result. Let the repository guidance add project-specific conventions such as scenario syntax or required review fields.

## Story Slicing

Prefer stories that deliver, validate, or de-risk a coherent valuable increment. A vertical outcome is often useful but is not required when an enabling capability itself unlocks immediate use. Keep purely preparatory architectural steps within the implementation path of a value-bearing story or defer them with the candidate milestone they serve.

A story can be large enough to warrant its own brainstorming session and phase plan; it is not sized as a minute task or implementation checklist. Treat a large story set as a signal to return to Sharpen and challenge the now promise, not as a numerical limit.

Represent a dependency when another story genuinely gates useful work. For exploration, name the downstream consumer so its conclusions have an operational destination rather than ending as detached documentation.

When coherent stories remain hard to shape, return to the milestone's product goal, boundaries, completion condition, or sequence and sharpen the missing context.

## Quality Checks

Before presenting or persisting shaped artifacts, reread the milestone and its stories as a future collaborator without the conversation. Check that every story is necessary to the now promise and traceable to its originating reasoning, and that each known consequential uncertainty is visible in the milestone or assigned to an exploration story. Check that candidate milestones remain uncommitted seeds without stories.
