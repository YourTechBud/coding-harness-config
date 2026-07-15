import type { WorkflowContext, WorkflowUiFeedback } from '@yourtechbudstudio/isagi-workflow-sdk';

export type WorkflowStatus =
  | { readonly kind: 'discovering-plan' }
  | {
      readonly kind: 'plan-ready';
      readonly entryPlanPath: string;
      readonly decisionLogPath: string;
      readonly phaseCount: number;
      readonly completedPhaseCount: number;
      readonly nextPhase?: number | undefined;
    }
  | { readonly kind: 'preparing-phase'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'implementer-aligning'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'planner-reviewing'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'implementing'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'severe-flag'; readonly phase: number }
  | { readonly kind: 'auto-review'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'phase-review'; readonly phase: number; readonly phaseCount: number }
  | { readonly kind: 'human-verification'; readonly phase: number; readonly phaseCount: number }
  | {
      readonly kind: 'mock-human-completion';
      readonly phase: number;
      readonly phaseCount: number;
      readonly phaseSlug: string;
      readonly autoCommit: boolean;
    }
  | { readonly kind: 'commit'; readonly phase: number; readonly phaseCount: number }
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
        status.nextPhase === undefined
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
    case 'auto-review':
      return {
        kind: 'info',
        phase: 'phase-auto-review',
        message: `Reviewing phase ${status.phase} of ${status.phaseCount}`,
      };
    case 'phase-review':
      return {
        kind: 'info',
        phase: 'phase-review',
        message: `Phase ${status.phase} of ${status.phaseCount} is ready for approval. Continue to finish the phase.`,
      };
    case 'human-verification':
      return {
        kind: 'info',
        phase: 'phase-human-verification',
        message: `Phase ${status.phase} of ${status.phaseCount} is awaiting required human verification. Complete the manual checks described by the implementer, then Continue to finish the phase.`,
      };
    case 'mock-human-completion': {
      const commitInstruction = status.autoCommit
        ? ' Leave the changes uncommitted so the workflow can create the phase commit.'
        : '';
      return {
        kind: 'info',
        phase: 'mock-human-completion',
        message: `Mock-UI phase ${status.phase} of ${status.phaseCount} (${status.phaseSlug}) is ready in the UI-heavy pane. Drive the implementation and visual iteration, run the review, and complete the decision-log handoff.${commitInstruction} Continue when the phase is complete.`,
      };
    }
    case 'commit':
      return {
        kind: 'info',
        phase: 'phase-commit',
        message: `Creating a commit for phase ${status.phase} of ${status.phaseCount}`,
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
