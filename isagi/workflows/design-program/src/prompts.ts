export const PROMPT_FOOTER =
  "Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";

const DESIGN_SCOPE = `The story defines the bounded scope through its acceptance criteria, provided contracts, and explicitly agreed design decisions. Treat initial thinking, plans, and other suggested approaches recorded in the story as strong starting suggestions rather than requirements, except where they record those binding commitments. The supplied architecture artifact is completed predecessor work to build on, not an initial suggestion to redesign. Preserve its system shape and decisions within the story's scope, correcting substantive flaws when necessary. Ground factual constraints in repository evidence. Prefer the simplest program design that fulfills the story's binding scope within that architecture. Keep behavior and edge-case coverage to what that scope requires. Surface any needed scope change as a decision for the user rather than adopting it unattended.`;

const PROGRAM_REVIEW_CONTRACT = `${DESIGN_SCOPE}

Review the artifact through each of these sections:

- **Contradictions:** Decisions or claims that conflict with the story, verified repository behavior or framework constraints, the supplied architecture's system shape and decisions within the story's scope, or another contract, representation, invariant, flow, or decision in the program design. Distinguish repository facts, inherited architecture decisions, and proposed program-design choices.
- **Important Simplifications:** A simpler program design that preserves the binding scope and required behavior with fewer modules, abstractions, cross-module contracts, representations, transformations, state copies, control-flow branches, or special cases. Prefer an existing code seam when it already supports the requirement. Explain what the simplification preserves; removing necessary precision is not a simplification.
- **Missing Program Decisions:** Missing or materially ambiguous decisions that would force implementation planning to invent a consequential contract, representation, behavior, or code structure. Check relevant load-bearing module homes, responsibilities, dependencies, call paths, external and cross-module contracts, schemas, types, signatures, representations, invariants, identity, ownership, lifetime, optionality, validation, mutability, success and failure behavior, state transitions, transformations, ordering, concurrency, cancellation, timeout, retry, idempotency, transaction boundaries, stale data, partial failure, compatibility, migration, test seams, observable outcomes, and story or architecture traceability. Require only what materially shapes this story.
- **Other Significant Issues:** Feasibility problems, weak evidence, circular dependencies, duplicated authority, leaky abstractions, design choices presented as repository facts, inappropriate scope, overspecified incidental implementation details, implementation sequencing leaking into the artifact, material operability or quality concerns, predecessor flaws that prevent coherence, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** Implementation cannot proceed faithfully without replacing or inventing a consequential decision, or the design contradicts a verified constraint, cannot satisfy the binding scope, or is internally incoherent. It must be corrected before acceptance.
- **Concern:** The issue creates material ambiguity, unnecessary complexity, weak rationale, incomplete consequential behavior, reduced testability, or an unmitigated risk. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether implementation planning can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete evidence and a clear correction target. If the target is a predecessor artifact, identify it. Optional findings may coexist with closure; Blockers and Concerns may not. Keep findings within the binding scope above. A departure from an initial suggestion recorded in the story alone is not a defect; assess consistency with the completed architecture separately.

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

${DESIGN_SCOPE}

Work unattended. Preserve the story, use the predecessor artifacts and repository as evidence, and converge on one simple, maintainable program design with enough precision to implement the binding scope. Finish with the artifact ready for an independent review, making any unresolved user decision explicit. If program design exposes a substantive flaw in the current-state analysis or architecture, update the affected predecessor artifact and keep the artifact set coherent.`);
}

export function reviewToWriterPrompt(review: string): string {
  return withPromptFooter(`Here is the review of the program design:

${review}

${DESIGN_SCOPE}

Evaluate every finding against the story's binding scope, current-state analysis, and repository evidence, building on the completed architecture. Update the program-design artifact wherever the review improves its correctness, simplicity, coherence, or decision quality within that scope. Correct a predecessor artifact only when resolving a substantive flaw. Push back with concrete evidence and tradeoff reasoning when a finding is incorrect, expands the binding scope, treats a suggestion as a requirement, or would make the design worse. Finish with the current artifact set ready for another independent review.`);
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

Inspect the repository and current artifacts directly. Give concrete, actionable findings with retrievable evidence. Focus on whether this is the simplest exact, coherent program design that fulfills the binding scope and gives implementation planning a stable design to organize within the completed architecture.

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
