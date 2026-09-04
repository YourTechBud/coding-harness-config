# Shaping Issues

Shape bounded product milestones, called epics, and the stories supported by current understanding. Pair with the brainstorming skill for questioning, research, and shared understanding. Help the user evaluate value, alternatives, and tradeoffs; the user owns consequential decisions.

## Shaping Phases

Use these phases to guide the conversation with the user, making the current phase and its purpose clear. Develop shared understanding together before advancing to decisions that depend on it.

1. **Problem discovery:** establish the problem and its context. Use existing information and ask questions to draw out missing needs, circumstances, and assumptions the user may not have articulated.
2. **Discover value:** explore who benefits, what product outcome would meaningfully improve the problem, and why that outcome matters. Establish the desired value before choosing features or an engineering approach.
3. **Converge:** explore alternative ways to deliver that value and help the user choose the product approach and features to pursue.
4. **Sharpen:** narrow the direction to the smallest worthwhile outcome needed today. Challenge scope and sequence the work so usable value arrives incrementally, rather than requiring the entire story set before anything is useful.
5. **Harden:** review the chosen epic's goal, rationale, scope and exclusions, completion condition, and supported stories. Address remaining details and make consequential uncertainty explicit, using spikes where needed; readiness may mean a clear investigation rather than a complete implementation backlog.

Sharpen and Harden may share an exchange, but give scope reduction and final review distinct attention. Revisit earlier phases when new understanding warrants it. After a spike or other new evidence, resume from established context at the phases affected by what changed.

## Epic

An epic may span investigation and implementation while remaining a bounded promise. Its initial story set is provisional: add, remove, move, split, merge, or revise stories as evidence warrants. Revisit the epic itself with the user when findings affect its goal, scope, or completion condition; it remains open until that condition is met or the user chooses to defer or end it.

Focus on the current epic. Preserve a candidate epic only when the user explicitly requests it, recording its possible outcome, value, reason for deferral, and context needed to resume. Candidates remain uncommitted and have no stories until shaped for active work.

## Stories

Each story belongs to one epic and has one kind: spike or implementation. Capture its outcome, contribution to the epic, observable acceptance criteria, and context needed to work on it in a later session. Preserve decisions, rationale, serious alternatives, constraints, and evidence where losing them would cause misunderstanding or repeat an important discussion.

Create only stories whose outcomes and acceptance criteria are supported by current understanding. Defer stories whose shape depends on a spike's findings; independent stories may coexist with that spike. Represent dependencies where another story gates useful work.

### Spike

Use a spike when consequential uncertainty requires investigation and user judgment before dependent implementation is ready. This includes product or UI exploration, design decisions, and technical feasibility. State the uncertainty, the decisions it should enable, its parent epic context, and any existing work affected by the result.

Recommend which spike to do first by explaining which uncertainty most affects the epic's direction, unlocks subsequent decisions, or avoids wasted work. The user chooses the order.

A spike's acceptance criteria require usable findings and their application to the epic:

- Record conclusions, supporting evidence, limitations, serious alternatives, and remaining questions, including infeasibility when supported.
- Use the findings with the user to update the epic and its stories, whether that means implementation work, a narrower spike, a deliberate decision under uncertainty, deferral, or ending the epic.
- Persist the findings and resulting epic and story updates before closing the spike, including the rationale for retaining any existing scope or stories.

Resume this work from either the live investigation or findings supplied in a later session.

### Implementation

An implementation story delivers a coherent vertical slice end-to-end, including the UI and other changes needed for its outcome. Settle significant product and design decisions through shaping or spikes so the agent can complete implementation with minimal human involvement.

Write acceptance criteria as observable pass-or-fail conditions that distinguish success from a materially incomplete result, while leaving the engineering route open. Keep preparatory technical steps within the slice's implementation; size stories as meaningful outcomes that can be worked on one at a time.

When implementation reveals consequential uncertainty or a need for new product decisions, return that work to shaping with the user and consider a spike.

## Persistence

After Harden, present the agreed epic and stories and offer to persist them. Persist only with the user's explicit approval of the proposed writes; an explicit request to save them counts as approval. Earlier checkpoints are available on the same basis. Approval of the shaping direction or a request to close a spike alone does not authorize persistence; obtain approval for the required updates before closing the spike.

Read [persistence.md](persistence.md) before saving epics or stories or configuring repository issue-tracker guidance.
