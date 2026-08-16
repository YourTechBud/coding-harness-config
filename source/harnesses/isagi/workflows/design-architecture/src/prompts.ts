export const PROMPT_FOOTER =
  "Do not run any tasks in the background, but you are allowed to run tasks and shell commands in the foreground.";

const ARCHITECTURE_REVIEW_CONTRACT = `Review the artifact through each of these sections:

- **Contradictions:** Decisions or claims that conflict with the story, verified current-state facts, repository constraints, applicable engineering guidance, another architectural decision, or the architecture's own boundaries and flows. Distinguish repository facts from proposed design choices.
- **Important Simplifications:** A simpler architecture that preserves the same story outcomes with fewer new components, abstractions, boundaries, state owners, or integration paths. Prefer existing extension seams and one clear source of authority. Explain which outcomes and quality drivers the simpler design preserves.
- **Missing Architectural Decisions:** Unsettled ownership, responsibilities, dependency direction, major success or failure flows, state authority, compatibility or transition policy, quality drivers, risks, assumptions, or story traceability that would force program design to invent or revise the system shape.
- **Other Significant Issues:** Feasibility problems, circular dependencies, duplicated authority, design choices presented as repository facts, unresolved branches passed downstream, weak evidence, inappropriate scope, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** The architecture cannot satisfy the story, contradicts a verified constraint, is internally incoherent, or would force downstream program design to replace the system shape. It must be corrected before acceptance.
- **Concern:** The issue creates material complexity, ambiguity, weak rationale, a missing architectural decision, or an unmitigated risk. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether program design can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete evidence and a clear correction target. Optional findings may coexist with closure; Blockers and Concerns may not.

Keep the review at the architecture boundary. Do not treat absent exact API signatures or routes, schema fields, concrete types, validation rules, detailed state machines, error taxonomies, algorithms, pseudocode, transaction or retry mechanics, or component-level collaboration as gaps unless their absence leaves ownership, boundary semantics, major behavior, or the system shape unresolved.`;

const REVIEWER_ESCALATION_AND_CLOSURE = `Always include a Human Escalation section. State "No escalation." unless you and the writer have repeatedly disagreed on the same substantive issue and another exchange is unlikely to resolve it. In that case, explicitly state "Escalation required:", summarize both positions, and name the decision a human must make. A first disagreement or a held finding is not an escalation.

When no Blocker or Concern remains, end with the exact line: No re-review needed.`;

export function initialWriterPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentStatePath: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Design the target architecture for the supplied story and write the complete artifact at the requested path.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture artifact path: ${input.artifactPath}

Work unattended. Treat the story as immutable, use the current-state analysis and repository as evidence, converge on one recommended system shape, and finish only when the architecture artifact is ready for an independent review. If architecture work exposes a substantive flaw in the current-state analysis, correct that predecessor artifact and keep both artifacts coherent.`);
}

export function reviewToWriterPrompt(review: string): string {
  return withPromptFooter(`Here is the review of the target architecture:

${review}

Evaluate every finding against the story, current-state analysis, repository evidence, and architectural drivers. Update the architecture artifact directly wherever the review improves its correctness, simplicity, coherence, or decision quality. Correct the current-state artifact only when resolving a substantive predecessor flaw. Push back with concrete evidence and tradeoff reasoning when a finding is incorrect or would make the architecture worse. Finish with the artifacts ready for another independent review.`);
}

export function retryWriterPrompt(): string {
  return withPromptFooter(`Resume the architecture work from the current conversation, worktree, and artifacts. Reassess the original request against their current state, including whether any commands or delegated work from the previous turn are still running or have now completed. Preserve completed work, finish the requested writing or revision, verify the artifact, and end only when it is ready for review.`);
}

export function initialReviewerPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentStatePath: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Independently review the target architecture from first principles.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture artifact path: ${input.artifactPath}

Inspect the repository and predecessor artifact directly. Give concrete, actionable findings with retrievable evidence. Focus on whether the architecture is the simplest coherent system shape that satisfies the story and gives program design a stable boundary to elaborate.

${ARCHITECTURE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function writerToReviewerPrompt(writerResponse: string): string {
  return withPromptFooter(`Here is the architecture writer's response to your review:

${writerResponse}

Re-review the current architecture from first principles. Verify claimed corrections directly, adjudicate pushback on its merits, inspect the current-state analysis wherever the architecture depends on it, and review the full architecture for remaining or newly introduced issues. Do not preserve a finding when the writer's evidence resolves it, and do not silently drop an unresolved finding.

${ARCHITECTURE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function withPromptFooter(body: string): string {
  return `${body}\n\n${PROMPT_FOOTER}`;
}
