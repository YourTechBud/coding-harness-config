export function completionReportPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly checkpoint: 'before-review' | 'after-review';
  readonly autoReview: boolean;
}): string {
  const phase = `phase ${input.phaseNumber} of ${input.phaseCount} in ${input.entryPlanPath}`;
  if (input.checkpoint === 'before-review') {
    return `We are checking whether ${phase} is ready for review.

Is there anything explicitly left in this phase to complete, apart from human verification? Check the entire agreed phase scope against what has actually been completed, rather than only your latest implementation work.

If work remains or questions are unresolved, describe your current understanding of what remains and include any necessary questions for the planner.

Otherwise, explicitly state that the phase's implementation is complete and can be marked complete once any required human verification and workflow gates are satisfied. Mention any explicitly required human verification separately; it will happen after automatic review, if review is enabled.

This turn is for reporting only; do not implement changes. You are running unattended, so include questions in your response for the workflow to forward to the planner.`;
  }
  return `${input.autoReview ? 'Automatic review has completed' : 'Automatic review is disabled for this run'}. We are checking ${phase} before human approval and optional commit.

Check the entire agreed phase scope against the current implementation, including any changes made during review.

Return two distinct sections:

## Anything left in the phase

Describe anything explicitly left to complete apart from human verification, your current understanding of that work, and any necessary questions for the planner.

If nothing remains, explicitly state that the phase's implementation is complete.

## Anything the human needs to verify

List any explicitly required human verification that remains outstanding, including previously identified checks that have not been completed. Explain what the human needs to check and the expected result.

If none remains, explicitly state that no required human verification is outstanding. Distinguish optional suggestions from required checks.

This turn is for reporting only; do not implement changes. You are running unattended, so include questions in your response rather than waiting for answers. Remaining work or questions will return to the planner before the workflow requests final human verification.`;
}
