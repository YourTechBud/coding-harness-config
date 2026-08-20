---
name: shaping-issues
description: |
  Domain companion for product issue shaping — turns raw Sparks and project context into sequenced active and candidate epics with acceptance-oriented stories, reshapes existing epic scope, and supports repository-specific issue-tracker persistence. Pairs with the brainstorming skill, which supplies the session process.
  Invoke only when the user explicitly asks to shape or reshape epics or stories, work with Sparks, or configure issue-tracker persistence.
---

# Shaping Issues

## Role

Shape and reshape product epics and their stories from raw Sparks and project context. Pair this domain model with the brainstorming skill, which supplies the questioning, research, pushback, and shared-understanding process.

Epics and stories preserve the product understanding that future humans and agents need. Detailed engineering decisions belong to later story-level brainstorming and, when useful, a temporary implementation plan.

## Shared Terms

- **Spark:** raw input such as an idea, pain, bug, feature notion, observation, or unfinished thread. Sparks are processed into epic understanding or remain raw for later.
- **Epic:** a mostly stable, product-oriented account of the valuable promise currently being pursued, its context, its scope, and what would make it complete.
- **Candidate epic:** an uncommitted seed for a direction that may become valuable later. It preserves enough context to resume shaping without treating today's understanding as settled.
- **Story:** a disposable, acceptance-oriented increment under one epic. A story preserves enough product context to seed later brainstorming while leaving its engineering path open.
- **Acceptance criteria:** observable conditions used to judge whether a story achieved its outcome.

Every story belongs to one epic, and the persistence representation must make navigation possible in both directions. Every story has exactly one kind:

- **Exploration:** reduces consequential uncertainty and applies its conclusions to the epic or downstream stories.
- **Implementation:** delivers a coherent valuable outcome that satisfies its acceptance criteria.
- **Release:** handles an exceptional external transition whose coordination, judgment, or risk requires direct human-agent work.

## Shaping Phases

Give each shaping phase its own focused user turn. Surface the phase's working understanding, apply the relevant pushback, and invite the user to correct or deepen it. Advance after the user can meaningfully confirm or edit the phase's completion criterion, then make the phase change visible.

1. **Collect:** gather relevant Sparks, current needs, longer aspirations, and product context into a grounded inventory of inputs and important ambiguities. Complete when the user can correct that inventory and identify missing inputs.
2. **Discover value:** uncover the user, product, learning, capability, or decision value beneath the inputs, distinguish value available now from payoff contingent on distant work, and return a product-value frame. Complete when the user can explain or revise what should become better and why it matters.
3. **Converge:** draft and compare candidate epic directions, then deliberately merge, split, park, or discard them. Complete when the user has chosen or reshaped one direction with a coherent center of gravity and the meaningful alternatives have a known disposition.
4. **Sharpen:** sequence the chosen direction into a now promise that delivers worthwhile observable value and optional candidate epics for later increments. Weigh current value, dependencies, acceptable rework, and available effort without forcing a fixed roadmap depth. Complete when the user can explain or revise why the now promise should be pursued next and how deferred directions should be preserved.
5. **Harden:** turn the now promise into an epic with a product goal, boundaries, completion condition, known unresolved areas, and an initial set of stories. Complete when the user can revise the shaped epic and future work can resume without reconstructing its originating product reasoning.
6. **Persist:** translate the shared understanding into the repository's issue-tracker representation.

Draft possible directions in Converge, sequence the active and candidate epics in Sharpen, and draft stories only for the active epic in Harden. Earlier phases produce the understanding those artifacts depend on.

Persistence may follow any shaping phase when the user wants a checkpoint. Resume from the phase that matches the user's next question rather than restarting the sequence.

## References

- Read `shaping.md` when shaping or reshaping an epic or any of its stories.
- Read `persistence.md` when persisting epics or stories, or when creating or revising repository issue-tracking guidance.
- When both activities are in scope, read both references before drafting persisted artifacts.

## Persistence Boundary

A request to save, checkpoint, publish, or configure repository guidance authorizes persistence. Other epic or story discussion remains shaping.
