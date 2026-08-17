export const PROMPT_FOOTER =
  "Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";

const PROGRAM_REVIEW_CONTRACT = `Review the artifact through each of these sections:

- **Contradictions:** Decisions or claims that conflict with the story, verified repository behavior or framework constraints, the architecture's system shape or ownership boundaries, applicable engineering guidance, or another contract, representation, invariant, flow, or decision in the program design. Distinguish repository facts, inherited architecture decisions, and proposed program-design choices.
- **Important Simplifications:** A simpler program design that preserves the story outcomes, architecture, consequential boundary semantics, and behavior with fewer modules, abstractions, cross-module contracts, representations, transformations, state copies, control-flow branches, or special cases. Prefer an existing code seam when it already supports the requirement. Explain what the simplification preserves; removing necessary precision is not a simplification.
- **Missing Program Decisions:** Missing or materially ambiguous decisions that would force implementation planning to invent a consequential contract, representation, behavior, or code structure. Check relevant load-bearing module homes, responsibilities, dependencies, call paths, external and cross-module contracts, schemas, types, signatures, representations, invariants, identity, ownership, lifetime, optionality, validation, mutability, success and failure behavior, state transitions, transformations, ordering, concurrency, cancellation, timeout, retry, idempotency, transaction boundaries, stale data, partial failure, compatibility, migration, test seams, observable outcomes, and story or architecture traceability. Require only what materially shapes this story.
- **Other Significant Issues:** Feasibility problems, weak evidence, circular dependencies, duplicated authority, leaky abstractions, design choices presented as repository facts, inappropriate scope, overspecified incidental implementation details, implementation sequencing leaking into the artifact, material operability or quality concerns, predecessor flaws that prevent coherence, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** Implementation cannot proceed faithfully without replacing or inventing a consequential decision, or the design contradicts a verified constraint, cannot satisfy the story or architecture, or is internally incoherent. It must be corrected before acceptance.
- **Concern:** The issue creates material ambiguity, unnecessary complexity, weak rationale, incomplete consequential behavior, reduced testability, or an unmitigated risk. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether implementation planning can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete evidence and a clear correction target. If the target is a predecessor artifact, identify it. Optional findings may coexist with closure; Blockers and Concerns may not.

Keep the review at the program-design boundary. Exact changed contracts, load-bearing module homes and symbols, representations and invariants, detailed state and failure mechanics, consequential algorithms, compatibility mechanics, and verification seams are valid program-design concerns. Do not demand exhaustive file-change inventories, implementation phases or task ordering, construction strategy, temporary breakage, debt repayment, verification commands or phase assignments, complete function bodies, incidental private helpers, or line-by-line code.

Review the program design from first principles and inspect the current architecture and current-state analysis wherever the design depends on them. Assess the current artifact set rather than attempting to reconstruct changes between review rounds or separately auditing predecessor artifacts beyond what the program design requires.`;

const REVIEWER_ESCALATION_AND_CLOSURE = `Always include a Human Escalation section. State "No escalation." unless you and the writer have repeatedly disagreed on the same substantive issue and another exchange is unlikely to resolve it. In that case, explicitly state "Escalation required:", summarize both positions, and name the decision a human must make. A first disagreement or a held finding is not an escalation.

When no Blocker or Concern remains, end with the exact line: No re-review needed.`;

export function initialWriterPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Design the program for the supplied story and write the complete artifact at the requested path.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program-design artifact path: ${input.artifactPath}

Work unattended. Treat the story as immutable, use the predecessor artifacts and repository as evidence, converge on one exact and maintainable program design, and finish only when the artifact is ready for an independent review and implementation planning can proceed without inventing consequential contracts, representations, behavior, or code structure. If program design exposes a substantive flaw in the current-state analysis or architecture, correct the affected predecessor artifact and keep the artifact set coherent.`);
}

export function reviewToWriterPrompt(review: string): string {
  return withPromptFooter(`Here is the review of the program design:

${review}

Evaluate every finding against the story, architecture, current-state analysis, repository evidence, and program-design drivers. Update the program-design artifact directly wherever the review improves its correctness, simplicity, coherence, exactness, or decision quality. Correct a predecessor artifact only when resolving a substantive predecessor flaw. Push back with concrete evidence and tradeoff reasoning when a finding is incorrect or would make the design worse. Finish with the current artifact set ready for another independent review.`);
}

export function retryWriterPrompt(): string {
  return withPromptFooter(
    `Resume the program-design work from the current conversation, worktree, and artifacts. Reassess the original request against their current state, including whether any commands or delegated work from the previous turn are still running or have now completed. Preserve completed work, finish the requested writing or revision, verify the artifact, and end only when it is ready for review.`,
  );
}

export function initialReviewerPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Independently review the program design from first principles.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program-design artifact path: ${input.artifactPath}

Inspect the repository and current artifacts directly. Give concrete, actionable findings with retrievable evidence. Focus on whether this is the simplest exact, coherent program design that satisfies the story, realizes the architecture, and gives implementation planning a stable design to organize.

${PROGRAM_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function writerToReviewerPrompt(writerResponse: string): string {
  return withPromptFooter(`Here is the program-design writer's response to your review:

${writerResponse}

Re-review the current program design from first principles. Reread the current artifacts, verify claimed corrections directly, adjudicate pushback on its merits, inspect the architecture and current-state analysis wherever the program design depends on them, and review the full design for remaining or newly introduced issues. Do not preserve a finding when the writer's evidence resolves it, and do not silently drop an unresolved finding.

${PROGRAM_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function withPromptFooter(body: string): string {
  return `${body}\n\n${PROMPT_FOOTER}`;
}
