---
name: shaping-milestones
description: |
  Domain companion for product milestone work — turns raw Sparks and project context into valuable milestones and acceptance-oriented stories, reshapes existing milestone scope, and supports repository-specific persistence. Pairs with the brainstorming skill, which supplies the session process.
  Invoke only when the user explicitly asks to shape or reshape milestones or stories, work with Sparks, or configure milestone persistence.
disable-model-invocation: true
---

# Shaping Milestones

## Role

Shape and reshape product milestones and their stories from raw Sparks and project context. Pair this domain model with the brainstorming skill, which supplies the questioning, research, pushback, and shared-understanding process.

Milestones and stories preserve the product understanding that future humans and agents need. Detailed engineering decisions belong to later story-level brainstorming and, when useful, a temporary implementation plan.

## Shared Terms

- **Spark:** raw input such as an idea, pain, bug, feature notion, observation, or unfinished thread. Sparks are processed into milestone understanding or remain raw for later.
- **Milestone:** a mostly stable, product-oriented account of a valuable direction, its context, its scope, and what would make it complete.
- **Story:** a disposable, acceptance-oriented vertical slice under one milestone. A story preserves enough product context to seed later brainstorming while leaving its engineering path open.
- **Acceptance criteria:** observable product or operational conditions used to judge whether a story achieved its outcome.
- **Phase plan:** an optional engineering artifact for work complex enough to benefit from phased execution. Phase plans live in uncommitted scratch space and are separate from persisted milestones and stories.

Every story belongs to one milestone, and the persistence representation must make navigation possible in both directions. Every story has exactly one kind:

- **Exploration:** reduces consequential uncertainty and applies its conclusions to the milestone or downstream stories.
- **Implementation:** delivers a coherent product outcome that satisfies its acceptance criteria.
- **Release:** handles an exceptional external transition whose coordination, judgment, or risk requires direct human-agent work.

## Shaping Phases

Give each shaping phase its own focused user turn. Surface the phase's working understanding, apply the relevant pushback, and invite the user to correct or deepen it. Advance after the user can meaningfully confirm or edit the phase's completion criterion, then make the phase change visible.

1. **Collect:** gather relevant Sparks and product context into a grounded inventory of inputs and important ambiguities. Complete when the user can correct that inventory and identify missing inputs.
2. **Discover value:** uncover the user, product, learning, capability, or decision value beneath the inputs, separate that value from attractive engineering ideas, and return a product-value frame. Complete when the user can explain or revise what should become better and why it matters.
3. **Converge:** draft and compare candidate milestone directions, then deliberately merge, split, park, or discard them. Complete when the user has chosen or reshaped one direction with a coherent center of gravity and the meaningful alternatives have a known disposition.
4. **Harden:** turn the chosen direction into a milestone with a product goal, boundaries, completion condition, known unresolved areas, and an initial set of stories. Complete when the user can revise the shaped milestone and future work can resume without reconstructing its originating product reasoning.
5. **Persist:** translate the shared understanding into the repository's milestone representation.

Draft candidate milestone directions in Converge and draft stories in Harden. Earlier phases produce the understanding those artifacts depend on.

Persistence may follow any shaping phase when the user wants a checkpoint. Resume from the phase that matches the user's next question rather than restarting the sequence.

## References

- Read `shaping.md` when shaping or reshaping a milestone or any of its stories.
- Read `persistence.md` when persisting milestones or stories, or when creating or revising repository milestone guidance.
- When both activities are in scope, read both references before drafting persisted artifacts.

## Persistence Boundary

A request to save, checkpoint, publish, or configure repository guidance authorizes persistence. Other milestone discussion remains shaping.
