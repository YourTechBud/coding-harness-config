import { REVIEWER_ESCALATION_AND_CLOSURE, WRITER_INPUT_POLICY, WRITER_CONTINUATION_INSTRUCTIONS } from 'isagi-workflow-common-graphs';

export const PROMPT_FOOTER =
  "Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";

const CURRENT_STATE_REVIEW_CONTRACT = `Review the artifact through each of these sections:

- **Contradictions:** Claims that conflict with the story, repository behavior, tests, documentation, another part of the artifact, or stronger evidence. Distinguish a false claim from evidence that is merely incomplete.
- **Important Simplifications:** Places where the artifact makes the current system more complex than the evidence supports, duplicates concepts, includes distracting detail, or can express the same decision-relevant truth more directly. Keep simplification descriptive; do not propose target architecture or program design.
- **Missing Information:** Story outcomes, current flows, boundaries, contracts, state, failure behavior, constraints, uncertainty, or retrievable evidence that downstream architecture work would otherwise have to rediscover.
- **Other Significant Issues:** Unsupported inferences, scope drift into future design, stale or weak evidence, misleading emphasis or organization, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** The artifact is materially false, internally incoherent, or likely to misdirect downstream architecture work. It must be corrected before the artifact can be accepted.
- **Concern:** The issue materially weakens completeness, precision, simplicity, or evidentiary support. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether downstream architecture work can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete repository evidence and a clear correction target. Optional findings may coexist with closure; Blockers and Concerns may not.`;

export function initialWriterPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Analyze the current state of the repository for the supplied story and write the complete artifact at the requested path.

Repository: ${input.repositoryPath}
Story: ${input.story}
Artifact path: ${input.artifactPath}

Work unattended. Use the repository as evidence, make reasonable evidence-backed decisions when details are uncertain, and finish with the artifact ready for an independent review. ${WRITER_INPUT_POLICY}`);
}

export function reviewToWriterPrompt(review: string): string {
  return withPromptFooter(`Here is the review of the current-state analysis:

${review}

Evaluate every finding against the story and repository evidence. Update the artifact directly wherever the review improves its correctness, completeness, simplicity, or evidentiary support. Push back with concrete evidence when a finding is incorrect or would make the artifact worse. Finish with the artifact ready for another independent review. ${WRITER_INPUT_POLICY}`);
}

export function retryWriterPrompt(): string {
  return withPromptFooter(
    `Resume the current-state analysis from the current conversation, worktree, and artifact. Reassess the original request against their current state, including whether any commands or delegated work from the previous turn are still running or have now completed. Preserve completed work, finish the requested writing or revision, verify the artifact, and provide a completed response for review. ${WRITER_INPUT_POLICY}`,
  );
}

export function continueWriterPrompt(review: string | null): string {
  return withPromptFooter(`${WRITER_CONTINUATION_INSTRUCTIONS}${review ? `\n\nReview to address:\n${review}` : ''}`);
}

export function initialReviewerPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`Independently review the current-state analysis from first principles.

Repository: ${input.repositoryPath}
Story: ${input.story}
Artifact path: ${input.artifactPath}

Inspect the repository directly. Give concrete, actionable findings with retrievable evidence. Focus on whether the artifact is trustworthy and sufficient for downstream architecture work.

${CURRENT_STATE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function writerToReviewerPrompt(writerResponse: string): string {
  return withPromptFooter(`Here is the writer's response to your review:

${writerResponse}

Re-review the current artifact from first principles. Verify claimed corrections directly, adjudicate pushback on its merits, and inspect the full artifact for remaining or newly introduced issues. Do not preserve a finding when the writer's evidence resolves it, and do not silently drop an unresolved finding.

${CURRENT_STATE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}

export function withPromptFooter(body: string): string {
  return `${body}\n\n${PROMPT_FOOTER}`;
}
