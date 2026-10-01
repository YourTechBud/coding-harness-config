import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  suspend,
  wait,
  type EdgeDecision,
  type GraphUpdate,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { ownedPane, type AgentPane } from 'isagi-workflow-common-graphs';
import {
  EngineeringGuidanceReviewGraph,
  type EngineeringGuidanceReviewOutput,
  type EngineeringGuidanceReviewParameters,
} from 'isagi-workflow-engineering-guidance-review-loop/graph';

import { completionReportPrompt } from '../completion.js';
import type { ImplementerProfile } from '../constants.js';
import { renderWorkflowStatus, setWorkflowStatus } from '../feedback.js';
import type { PlanPhase } from '../judgments.js';
import {
  completionAcceptedPrefix,
  humanResolutionPrompt,
  implementerApprovalPrompt,
  implementerFollowUpPrompt,
  initialImplementerPrompt,
  initialMockUiPrompt,
  plannerPrompt,
} from '../prompts.js';
import { ChooseImplementerGraph, type ChooseImplementerOutput, type ChooseImplementerParameters } from './choose-implementer.js';
import { CommitGraph, type CommitOutput, type CommitParameters } from './commit-phase.js';
import {
  must,
  type CompletionCheckpoint,
  type Failed,
  type Failure,
  type ImplementerExchanged,
  type Options,
  type PlannerExchanged,
  type TurnPurpose,
} from './context.js';
import {
  ImplementerExchangeGraph,
  PlannerExchangeGraph,
  type ImplementerExchangeParameters,
  type PlannerExchangeParameters,
} from './exchanges.js';

export type PhaseParameters = {
  readonly plannerSessionId: number;
  readonly options: Options;
  readonly entryPlanPath: string;
  readonly phases: readonly PlanPhase[];
  readonly phaseIndex: number;
};

export type PhaseOutput = { readonly outcome: 'implemented' } | Failed;

// What the implementer is asked next. The exchange's prompt, feedback, and purpose follow from it.
type ImplementerRequest =
  | { readonly kind: 'start' }
  | { readonly kind: 'follow-up'; readonly plannerTurn: string; readonly approvalBlocked: boolean }
  | { readonly kind: 'approval'; readonly plannerTurn: string }
  | { readonly kind: 'human-resolution'; readonly plannerTurn: string; readonly approvalBlocked: boolean }
  | { readonly kind: 'completion-report'; readonly checkpoint: CompletionCheckpoint; readonly plannerTurn: string | null };

type State = {
  readonly repositoryPath: string;
  readonly plannerSessionId: number;
  readonly options: Options;
  readonly entryPlanPath: string;
  readonly phase: PlanPhase;
  readonly phaseCount: number;
  readonly profile: ImplementerProfile | null;
  readonly implementer: AgentPane | null;
  readonly request: ImplementerRequest | null;
  readonly implementerExchange: ImplementerExchanged | null;
  readonly plannerExchange: PlannerExchanged | null;
  /** The implementer's last turn asked questions, so the planner cannot approve this exchange. */
  readonly approvalBlocked: boolean;
  /** Automatic review has completed for the current implementation. */
  readonly reviewComplete: boolean;
  readonly requiresHumanVerification: boolean;
  readonly failure: Failure | null;
};

// One phase: a fresh implementer aligns with the planner, implements, reports completion, is reviewed,
// optionally waits for the human and commits, and is closed. The routing between the implementer and
// planner exchanges is this graph's policy.
export const PhaseGraph = createGraph<State, {}, PhaseParameters, PhaseOutput>({
  key: 'ImplementPhaseWisePlanPhase',
  title: 'Implement a phase',
  label: (parameters) => `Phase ${parameters.phases[parameters.phaseIndex]?.number ?? parameters.phaseIndex + 1} of ${parameters.phases.length}`,
  init: (destination, parameters) => ({
    repositoryPath: destination.worktreePath,
    plannerSessionId: parameters.plannerSessionId,
    options: parameters.options,
    entryPlanPath: parameters.entryPlanPath,
    phase: requirePhase(parameters),
    phaseCount: parameters.phases.length,
    profile: null,
    implementer: null,
    request: null,
    implementerExchange: null,
    plannerExchange: null,
    approvalBlocked: false,
    reviewComplete: false,
    requiresHumanVerification: false,
    failure: null,
  }),
  state: {
    repositoryPath: reduce.replace<string>(),
    plannerSessionId: reduce.replace<number>(),
    options: reduce.replace<Options>(),
    entryPlanPath: reduce.replace<string>(),
    phase: reduce.replace<PlanPhase>(),
    phaseCount: reduce.replace<number>(),
    profile: reduce.replace<ImplementerProfile | null>(),
    implementer: reduce.replace<AgentPane | null>(),
    request: reduce.replace<ImplementerRequest | null>(),
    implementerExchange: reduce.replace<ImplementerExchanged | null>(),
    plannerExchange: reduce.replace<PlannerExchanged | null>(),
    approvalBlocked: reduce.replace<boolean>(),
    reviewComplete: reduce.replace<boolean>(),
    requiresHumanVerification: reduce.replace<boolean>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'chooseImplementer',
  nodes: {
    chooseImplementer: subgraph<State, State, ChooseImplementerParameters, ChooseImplementerOutput>({
      graph: ChooseImplementerGraph,
      title: 'Choose the implementer',
      parameters: (state) => ({ phase: state.phase, phaseCount: state.phaseCount, entryPlanPath: state.entryPlanPath }),
      onResult: (_state, { output }) => ({ profile: output.profile }),
    }),

    // A mock-UI phase is human-led: the implementer is started and the human drives the mockups.
    startMockUp: operation<State, State>(async (ctx, state) => {
      const profile = must(state.profile, 'implementer profile');
      await setWorkflowStatus(ctx, {
        kind: 'mock-human-completion',
        phase: state.phase.number,
        phaseCount: state.phaseCount,
        phaseSlug: state.phase.slug,
        autoReview: state.options.autoReview,
        autoCommit: state.options.autoCommit,
      });
      const spawned = await ctx.spawnAgentSession({
        harness: profile.harness,
        model: profile.model,
        effort: profile.effort,
        prompt: initialMockUiPrompt({ phaseNumber: state.phase.number, entryPlanPath: state.entryPlanPath }),
        modifiers: [{ kind: 'skill', name: 'designing-ui' }],
      });
      await ctx.log('info', `Spawned ${profile.kind} implementer for phase ${state.phase.number}/${state.phaseCount}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${spawned.agentSessionId}, paneId=${spawned.paneId}.`);
      return suspend({ update: { implementer: { agentSessionId: spawned.agentSessionId, paneId: spawned.paneId } }, wait: wait.userContinue() });
    }, { title: 'Start the human-led mock-up' }),

    exchangeWithImplementer: subgraph<State, State, ImplementerExchangeParameters, ImplementerExchanged | Failed>({
      graph: ImplementerExchangeGraph,
      title: 'Exchange with the implementer',
      parameters: implementerExchangeParameters,
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { implementerExchange: output, implementer: output.implementer }),
    }),

    exchangeWithPlanner: subgraph<State, State, PlannerExchangeParameters, PlannerExchanged | Failed>({
      graph: PlannerExchangeGraph,
      title: 'Exchange with the planner',
      parameters: (state): PlannerExchangeParameters => ({
        phase: state.phase,
        phaseCount: state.phaseCount,
        plannerSessionId: state.plannerSessionId,
        prompt: plannerPrompt({ phaseNumber: state.phase.number, implementerTurn: must(state.implementerExchange, 'implementer exchange').implementerTurn, reviewComplete: state.reviewComplete }),
        feedback: renderWorkflowStatus({ kind: 'planner-reviewing', phase: state.phase.number, phaseCount: state.phaseCount }),
      }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { plannerExchange: output }),
    }),

    review: subgraph<State, State, EngineeringGuidanceReviewParameters, EngineeringGuidanceReviewOutput>({
      graph: EngineeringGuidanceReviewGraph,
      title: 'Review the phase',
      parameters: (state) => ({
        context: `The workflow is implementing phase ${state.phase.number} of the plan in ${state.entryPlanPath}. Review all the changes since HEAD.`,
        // The implementer fixes review findings in its own session; the review loop never closes it.
        fixerSessionId: must(state.implementer, 'implementer').agentSessionId,
      }),
      onResult: (state, { output }) =>
        output.outcome === 'failed'
          ? { failure: { message: `Automatic review failed for phase ${state.phase.number}`, diagnostic: `Automatic review failed for phase ${state.phase.number}: ${output.reason}` } }
          : {},
    }),

    awaitHumanApproval: operation<State, State>(async (ctx, state) => {
      await setWorkflowStatus(ctx, { kind: state.requiresHumanVerification ? 'human-verification' : 'phase-review', phase: state.phase.number, phaseCount: state.phaseCount });
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Wait for human approval' }),

    commit: subgraph<State, State, CommitParameters, CommitOutput>({
      graph: CommitGraph,
      title: 'Commit the phase',
      parameters: (state) => ({ phase: state.phase, phaseCount: state.phaseCount, entryPlanPath: state.entryPlanPath }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : {}),
    }),

    closeImplementer: operation<State, State>(async (ctx, state) => {
      const implementer = must(state.implementer, 'implementer');
      await ctx.log('info', `Closing implementer pane ${implementer.paneId} after phase ${state.phase.number}.`);
      await ctx.closePane(ownedPane(implementer));
      return complete();
    }, { title: 'Close the implementer' }),
  },
  edges: {
    afterChooseImplementer: edge<State, State>({
      from: 'chooseImplementer',
      to: ['startMockUp', 'exchangeWithImplementer'],
      choose: (state) => (state.phase.type === 'mock-ui' ? { to: 'startMockUp' } : { to: 'exchangeWithImplementer', update: { request: { kind: 'start' } } }),
    }),
    afterStartMockUp: edge<State, State>({
      from: 'startMockUp',
      to: ['exchangeWithImplementer'],
      choose: (state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Phase ${state.phase.number} human checkpoint resumed with an unexpected ${event.kind} event.`);
        return { to: 'exchangeWithImplementer', update: { request: completionReport(state, 'before-review') } };
      },
    }),
    afterExchangeWithImplementer: edge<State, State>({
      from: 'exchangeWithImplementer',
      to: ['failed', 'exchangeWithImplementer', 'exchangeWithPlanner', 'review', 'awaitHumanApproval', 'commit', 'closeImplementer'],
      choose: routeImplementerExchange,
    }),
    afterExchangeWithPlanner: edge<State, State>({
      from: 'exchangeWithPlanner',
      to: ['failed', 'exchangeWithImplementer'],
      choose: routePlannerExchange,
    }),
    afterReview: edge<State, State>({
      from: 'review',
      to: ['failed', 'exchangeWithImplementer'],
      choose: (state) => {
        if (state.failure) return { to: 'failed' };
        return { to: 'exchangeWithImplementer', update: { reviewComplete: true, request: { kind: 'completion-report', checkpoint: 'after-review', plannerTurn: null } } };
      },
    }),
    afterAwaitHumanApproval: edge<State, State>({
      from: 'awaitHumanApproval',
      to: ['commit', 'closeImplementer'],
      choose: (state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Phase ${state.phase.number} human approval resumed with an unexpected ${event.kind} event.`);
        return { to: state.options.autoCommit ? 'commit' : 'closeImplementer' };
      },
    }),
    afterCommit: edge<State, State>({ from: 'commit', to: ['failed', 'closeImplementer'], choose: (state) => ({ to: state.failure ? 'failed' : 'closeImplementer' }) }),
    afterCloseImplementer: edge<State, State>({ from: 'closeImplementer', to: ['implemented'], choose: () => ({ to: 'implemented' }) }),
  },
  outcomes: {
    implemented: outcome({ kind: 'success', title: 'Phase implemented', output: () => ({ outcome: 'implemented' }) }),
    failed: outcome({ kind: 'failure', title: 'Phase failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// After an implementer turn: alignment turns without questions move to the completion report; turns
// with questions, and every confirmation turn, go to the planner. Completion reports move through
// review, final approval, and commit, or back to the planner when work remains.
function routeImplementerExchange(state: State): EdgeDecision<GraphUpdate<State>> {
  if (state.failure) return { to: 'failed' };
  const { result } = must(state.implementerExchange, 'implementer exchange');
  const request = must(state.request, 'implementer request');
  const plannerNeeded = result === 'planner-response-needed' || result === 'planner-questions';
  const approvalBlocked = result === 'planner-questions';

  if (request.kind !== 'completion-report') {
    if (!plannerNeeded && turnPurpose(request) !== 'confirmation') {
      return { to: 'exchangeWithImplementer', update: { request: completionReport(state, 'before-review') } };
    }
    return { to: 'exchangeWithPlanner', update: { approvalBlocked } };
  }

  if (plannerNeeded) {
    const reviewComplete = request.checkpoint === 'after-review' && state.options.autoReview ? true : state.reviewComplete;
    return { to: 'exchangeWithPlanner', update: { approvalBlocked, reviewComplete } };
  }
  if (request.checkpoint === 'before-review') {
    if (state.options.autoReview) return { to: 'review' };
    return { to: 'exchangeWithImplementer', update: { request: { kind: 'completion-report', checkpoint: 'after-review', plannerTurn: null } } };
  }
  const requiresHumanVerification = result === 'phase-complete-awaiting-human-verification';
  if (state.options.humanInTheLoop || requiresHumanVerification) return { to: 'awaitHumanApproval', update: { requiresHumanVerification } };
  return { to: state.options.autoCommit ? 'commit' : 'closeImplementer' };
}

// After a planner turn: a resolved severe flag goes back with human-resolution framing; a blocked
// approval is returned as feedback; accepted completion asks for the completion report; approval
// starts implementation; anything else is alignment feedback.
function routePlannerExchange(state: State): EdgeDecision<GraphUpdate<State>> {
  if (state.failure) return { to: 'failed' };
  const { plannerTurn, result } = must(state.plannerExchange, 'planner exchange');
  if (result === 'severe-flag-resolved') {
    return {
      to: 'exchangeWithImplementer',
      update: { request: { kind: 'human-resolution', plannerTurn, approvalBlocked: state.approvalBlocked }, ...(state.approvalBlocked ? {} : { reviewComplete: false }) },
    };
  }
  if (state.approvalBlocked) return { to: 'exchangeWithImplementer', update: { request: { kind: 'follow-up', plannerTurn, approvalBlocked: true } } };
  if (result === 'completion-approved') return { to: 'exchangeWithImplementer', update: { request: completionReport(state, 'before-review', plannerTurn) } };
  if (result === 'approved') return { to: 'exchangeWithImplementer', update: { request: { kind: 'approval', plannerTurn }, reviewComplete: false } };
  return { to: 'exchangeWithImplementer', update: { request: { kind: 'follow-up', plannerTurn, approvalBlocked: false } } };
}

// A completed review always moves the completion report to its after-review checkpoint.
function completionReport(state: State, checkpoint: CompletionCheckpoint, plannerTurn: string | null = null): ImplementerRequest {
  return { kind: 'completion-report', checkpoint: state.reviewComplete ? 'after-review' : checkpoint, plannerTurn };
}

function turnPurpose(request: ImplementerRequest): TurnPurpose {
  switch (request.kind) {
    case 'start':
      return 'alignment';
    case 'follow-up':
      return request.approvalBlocked ? 'confirmation' : 'alignment';
    case 'approval':
      return 'implementation';
    case 'human-resolution':
      return request.approvalBlocked ? 'confirmation' : 'implementation';
    case 'completion-report':
      return request.checkpoint;
  }
}

function implementerExchangeParameters(state: State): ImplementerExchangeParameters {
  const request = must(state.request, 'implementer request');
  const phaseNumber = state.phase.number;
  const status = (kind: 'implementer-aligning' | 'implementing') => renderWorkflowStatus({ kind, phase: phaseNumber, phaseCount: state.phaseCount });
  const common = { phase: state.phase, phaseCount: state.phaseCount, entryPlanPath: state.entryPlanPath, turnPurpose: turnPurpose(request) };

  if (request.kind === 'start') {
    const profile = must(state.profile, 'implementer profile');
    return {
      ...common,
      session: { kind: 'spawn', harness: profile.harness, model: profile.model, effort: profile.effort },
      prompt: initialImplementerPrompt({ phaseNumber, entryPlanPath: state.entryPlanPath }),
      feedback: status('implementer-aligning'),
    };
  }

  const session = { kind: 'existing' as const, ...must(state.implementer, 'implementer') };
  switch (request.kind) {
    case 'follow-up':
      return { ...common, session, prompt: implementerFollowUpPrompt(phaseNumber, request.plannerTurn, request.approvalBlocked), feedback: status('implementer-aligning') };
    case 'approval':
      return { ...common, session, prompt: implementerApprovalPrompt(phaseNumber, request.plannerTurn), feedback: status('implementing') };
    case 'human-resolution':
      return { ...common, session, prompt: humanResolutionPrompt(phaseNumber, request.plannerTurn, request.approvalBlocked), feedback: status(request.approvalBlocked ? 'implementer-aligning' : 'implementing') };
    case 'completion-report':
      return {
        ...common,
        session,
        prompt: (request.plannerTurn ? completionAcceptedPrefix(request.plannerTurn) : '') + completionReportPrompt({
          phaseNumber,
          phaseCount: state.phaseCount,
          entryPlanPath: state.entryPlanPath,
          checkpoint: request.checkpoint,
          autoReview: state.options.autoReview,
        }),
        feedback: renderWorkflowStatus({ kind: 'completion-check', phase: phaseNumber, phaseCount: state.phaseCount, checkpoint: request.checkpoint }),
      };
  }
}

function requirePhase(parameters: PhaseParameters): PlanPhase {
  const phase = parameters.phases[parameters.phaseIndex];
  if (!phase) throw new Error(`Phase index ${parameters.phaseIndex} is outside the plan's ${parameters.phases.length} phases.`);
  return phase;
}
