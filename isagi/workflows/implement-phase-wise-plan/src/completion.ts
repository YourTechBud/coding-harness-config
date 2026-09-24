export function completionReportPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly checkpoint: 'before-review' | 'after-review';
  readonly autoReview: boolean;
}): string {
  const phase = `phase ${input.phaseNumber} of ${input.phaseCount} in ${input.entryPlanPath}`;
  if (input.checkpoint === 'before-review') {
    return `The workflow is checking whether ${phase} is ready for review.

Is there anything explicitly left in this phase to complete, apart from human verification? Check the entire agreed phase scope against what has actually been completed, rather than only your latest implementation work.

If concrete current-phase work remains or a decision blocks completion, describe your current understanding and the necessary questions for the planner. Keep non-blocking observations and later-phase obligations separate from remaining phase work.

Otherwise, explicitly state that the phase's implementation is complete and can be marked complete once any required human verification and workflow gates are satisfied. Mention any explicitly required human verification separately; it will happen after automatic review, if review is enabled.

This turn is for reporting only; do not implement changes. You are running unattended, so include questions in your response for the workflow to forward to the planner.`;
  }
  return `${input.autoReview ? 'Automatic review has completed' : 'Automatic review is disabled for this run'}. The workflow is checking ${phase} before human approval and optional commit.

Report the status of the entire agreed phase scope, including changes made during review, using the verification evidence already gathered. Repeat checks only when changes or unresolved failures make that evidence stale. This checkpoint is not a fresh open-ended audit.

Return two distinct sections:

## Anything left in the phase

Describe concrete unfinished work in the current phase apart from human verification, and decisions that block completion. Keep non-blocking questions, optional improvements, and assigned later-phase obligations in the handoff rather than treating them as unfinished phase work.

If nothing remains, explicitly state that the phase's implementation is complete.

## Anything the human needs to verify

List any explicitly required human verification that remains outstanding, including previously identified checks that have not been completed. Explain what the human needs to check and the expected result.

If none remains, explicitly state that no required human verification is outstanding. Distinguish optional suggestions from required checks.

This turn is for reporting only; do not implement changes. You are running unattended, so include questions in your response rather than waiting for answers. Any question or request for planner confirmation returns to the planner before final human verification, including non-blocking questions. Caveats that request no planner response can remain in the handoff without reopening the phase.`;
}
