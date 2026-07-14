import type { WorkflowContext, WorkflowUiFeedback } from '@yourtechbudstudio/isagi-workflow-sdk';

export type WorkflowStatus =
  | { readonly kind: 'discovering-plan' }
  | {
      readonly kind: 'plan-ready';
      readonly entryPlanPath: string;
      readonly decisionLogPath: string;
      readonly phaseCount: number;
      readonly completedPhaseCount: number;
      readonly nextPhase: number;
    }
  | { readonly kind: 'preparing-phase'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'implementer-aligning'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'planner-reviewing'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'implementing'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'severe-flag'; readonly phase: number }
  | { readonly kind: 'phase-review'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'complete' }
  | { readonly kind: 'failed'; readonly message: string };

export function setWorkflowStatus(ctx: WorkflowContext, status: WorkflowStatus): Promise<void> {
  return ctx.setUiFeedback(renderWorkflowStatus(status));
}

export function renderWorkflowStatus(status: WorkflowStatus): WorkflowUiFeedback {
  switch (status.kind) {
    case 'discovering-plan':
      return {
        kind: 'info',
        phase: 'plan-discovery',
        message: 'Finding the current plan',
      };
    case 'plan-ready': {
      const next =
        status.nextPhase > status.phaseCount
          ? 'No remaining phase'
          : `Phase ${status.nextPhase} of ${status.phaseCount}`;
      return {
        kind: 'info',
        phase: 'plan-confirmation',
        message: [
          `Plan: ${status.entryPlanPath}`,
          `Decision log: ${status.decisionLogPath}`,
          `Phases: ${status.phaseCount}`,
          `Completed: ${status.completedPhaseCount}`,
          `Next: ${next}`,
        ].join('\n\n'),
      };
    }
    case 'preparing-phase':
      return {
        kind: 'info',
        phase: 'phase-preparation',
        message: `Choosing an implementer for phase ${status.phase} of ${status.phaseCount}`,
      };
    case 'implementer-aligning':
      return {
        kind: 'info',
        phase: 'phase-alignment',
        message: `Implementer reviewing phase ${status.phase} of ${status.phaseCount}`,
      };
    case 'planner-reviewing':
      return {
        kind: 'info',
        phase: 'phase-alignment',
        message: `Planner reviewing phase ${status.phase} of ${status.phaseCount}`,
      };
    case 'implementing':
      return {
        kind: 'info',
        phase: 'phase-implementation',
        message: `Implementing phase ${status.phase} of ${status.phaseCount}`,
      };
    case 'severe-flag':
      return {
        kind: 'warning',
        phase: 'human-intervention',
        message: `Phase ${status.phase} paused — the planner raised a severe flag.\n\nResolve it in the planner pane, then Continue. The latest planner response will be sent to the implementer verbatim.`,
      };
    case 'phase-review':
      return {
        kind: 'info',
        phase: 'phase-review',
        message: `Phase ${status.phase} of ${status.phaseCount} is ready for your review`,
      };
    case 'complete':
      return {
        kind: 'info',
        phase: 'complete',
        message: 'Plan implementation complete',
      };
    case 'failed':
      return {
        kind: 'error',
        phase: 'failed',
        message: status.message,
      };
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow status: ${String(value)}`);
}
