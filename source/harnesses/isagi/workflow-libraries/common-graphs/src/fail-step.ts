import type { OperationContext, WorkflowUiFeedback } from '@yourtechbudstudio/isagi-workflow-sdk';

/**
 * Reports a failure the user may fix (a missing reply, an invalid artifact) and fails the step. The
 * run fails, and Retry runs this step again, reading the conversation or files afresh. Use a failure
 * outcome instead only for results a retry cannot change.
 */
export async function failStep(
  ctx: Pick<OperationContext, 'setUiFeedback' | 'log'>,
  feedback: Required<Pick<WorkflowUiFeedback, 'phase' | 'message'>>,
  diagnostic: string,
): Promise<never> {
  await ctx.setUiFeedback({ kind: 'error', ...feedback });
  await ctx.log('error', diagnostic);
  throw new Error(diagnostic);
}
