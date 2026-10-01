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
  type OperationContext,
  type WorkflowPromptModifiers,
  type WorkflowUiFeedback,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, type AgentTurnOutput, type AgentTurnSession, type JudgmentOutput, type JudgmentParameters } from 'isagi-workflow-common-graphs';

import { headlessJudgment } from '../constants.js';
import { renderWorkflowStatus, setWorkflowStatus } from '../feedback.js';
import {
  classifyImplementerOutcomePrompt,
  classifyPlannerOutcomePrompt,
  latestAssistantTurnText,
  type ImplementerOutcome,
  type PlanPhase,
  type PlannerOutcome,
} from '../judgments.js';
import {
  ImplementerOutcomeJudgment,
  PlannerOutcomeJudgment,
  must,
  type Failed,
  type Failure,
  type ImplementerExchanged,
  type PlannerExchanged,
  type TurnPurpose,
} from './context.js';

// Implementer exchange: one implementer turn, read and classified for the phase routing.

export type ImplementerExchangeParameters = {
  readonly phase: PlanPhase;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly session: AgentTurnSession;
  readonly prompt: string;
  readonly modifiers?: WorkflowPromptModifiers;
  readonly feedback: WorkflowUiFeedback;
  readonly turnPurpose: TurnPurpose;
};

type ImplementerState = {
  readonly repositoryPath: string;
  readonly request: ImplementerExchangeParameters;
  readonly turn: AgentTurnOutput | null;
  readonly implementerTurn: string | null;
  readonly result: ImplementerOutcome | null;
  readonly failure: Failure | null;
};

const purposeLabels: Record<TurnPurpose, string> = {
  alignment: 'Align with the planner',
  confirmation: 'Confirm alignment',
  implementation: 'Implement the phase',
  'before-review': 'Report completion before review',
  'after-review': 'Report completion after review',
};

export const ImplementerExchangeGraph = createGraph<ImplementerState, {}, ImplementerExchangeParameters, ImplementerExchanged | Failed>({
  key: 'ImplementPhaseWisePlanImplementerExchange',
  title: 'Implementer exchange',
  label: (parameters) => purposeLabels[parameters.turnPurpose],
  init: (destination, request) => ({ repositoryPath: destination.worktreePath, request, turn: null, implementerTurn: null, result: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    request: reduce.replace<ImplementerExchangeParameters>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    implementerTurn: reduce.replace<string | null>(),
    result: reduce.replace<ImplementerOutcome | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'turn',
  nodes: {
    turn: agentTurn<ImplementerState, ImplementerState>({
      title: 'Prompt the implementer',
      parameters: ({ request }) => ({
        label: 'Implementer',
        session: request.session,
        prompt: request.prompt,
        ...(request.modifiers ? { modifiers: request.modifiers } : {}),
        feedback: request.feedback,
      }),
      onResult: (_state, turn) => ({ turn }),
    }),
    readTurn: operation<ImplementerState, ImplementerState>(async (ctx, state) => {
      const { agentSessionId } = must(state.turn, 'implementer turn').agent;
      const implementerTurn = await readLatestTurn(ctx, agentSessionId, 'implementer', state.request.phase.number);
      return complete({ update: { implementerTurn } });
    }, { title: "Read the implementer's turn" }),
    classify: subgraph<ImplementerState, ImplementerState, JudgmentParameters, JudgmentOutput<ImplementerOutcome>>({
      graph: ImplementerOutcomeJudgment,
      title: 'Classify the implementer turn',
      parameters: ({ repositoryPath, request, implementerTurn }) => ({
        label: 'implementer',
        profile: headlessJudgment,
        prompt: classifyImplementerOutcomePrompt({
          worktreePath: repositoryPath,
          phaseNumber: request.phase.number,
          phaseCount: request.phaseCount,
          entryPlanPath: request.entryPlanPath,
          turnPurpose: request.turnPurpose,
          implementerTurn: must(implementerTurn, 'implementer turn'),
        }),
      }),
      // A rejudge reads the implementer's latest turn again before classifying it.
      onResult: (_state, { output }) => ({ result: output.outcome === 'judged' ? output.route : null }),
    }),
  },
  edges: {
    afterTurn: edge<ImplementerState, ImplementerState>({
      from: 'turn',
      to: ['readTurn', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'implementer turn');
        if (turn.outcome === 'ended') return { to: 'readTurn' };
        const phase = state.request.phase.number;
        return { to: 'failed', update: { failure: { message: `Implementer turn failed during phase ${phase}`, diagnostic: `Implementer turn failed during phase ${phase}: ${turn.reason}` } } };
      },
    }),
    afterReadTurn: edge<ImplementerState, ImplementerState>({ from: 'readTurn', to: ['classify'], choose: () => ({ to: 'classify' }) }),
    afterClassify: edge<ImplementerState, ImplementerState>({ from: 'classify', to: ['exchanged', 'readTurn'], choose: (state) => ({ to: state.result === null ? 'readTurn' : 'exchanged' }) }),
  },
  outcomes: {
    exchanged: outcome({
      kind: 'success',
      title: 'Implementer turn classified',
      output: (state) => ({ outcome: 'exchanged', implementer: must(state.turn, 'implementer turn').agent, implementerTurn: must(state.implementerTurn, 'implementer turn'), result: must(state.result, 'implementer outcome') }),
    }),
    failed: outcome({ kind: 'failure', title: 'Implementer exchange failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// Planner exchange: one planner turn in the launching planner session, classified. A severe flag
// waits for the human, then the planner's latest turn is read again and returned as resolved.

export type PlannerExchangeParameters = {
  readonly phase: PlanPhase;
  readonly phaseCount: number;
  readonly plannerSessionId: number;
  readonly prompt: string;
  readonly feedback: WorkflowUiFeedback;
};

type PlannerState = {
  readonly request: PlannerExchangeParameters;
  readonly turn: AgentTurnOutput | null;
  readonly plannerTurn: string | null;
  readonly result: PlannerOutcome | null;
  readonly resolved: boolean;
  readonly failure: Failure | null;
};

export const PlannerExchangeGraph = createGraph<PlannerState, {}, PlannerExchangeParameters, PlannerExchanged | Failed>({
  key: 'ImplementPhaseWisePlanPlannerExchange',
  title: 'Planner exchange',
  label: () => 'Consult the planner',
  init: (_destination, request) => ({ request, turn: null, plannerTurn: null, result: null, resolved: false, failure: null }),
  state: {
    request: reduce.replace<PlannerExchangeParameters>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    plannerTurn: reduce.replace<string | null>(),
    result: reduce.replace<PlannerOutcome | null>(),
    resolved: reduce.replace<boolean>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'turn',
  nodes: {
    turn: agentTurn<PlannerState, PlannerState>({
      title: 'Prompt the planner',
      parameters: ({ request }) => ({
        label: 'Planner',
        // The planner is the session that launched the workflow; the workflow never owns its pane.
        session: { kind: 'existing', agentSessionId: request.plannerSessionId, paneId: null },
        prompt: request.prompt,
        feedback: request.feedback,
      }),
      onResult: (_state, turn) => ({ turn }),
    }),
    readTurn: operation<PlannerState, PlannerState>(async (ctx, { request }) => complete({ update: { plannerTurn: await readLatestTurn(ctx, request.plannerSessionId, 'planner', request.phase.number) } }), { title: "Read the planner's turn" }),
    classify: subgraph<PlannerState, PlannerState, JudgmentParameters, JudgmentOutput<PlannerOutcome>>({
      graph: PlannerOutcomeJudgment,
      title: 'Classify the planner turn',
      parameters: ({ request, plannerTurn }) => ({
        label: 'planner',
        profile: headlessJudgment,
        prompt: classifyPlannerOutcomePrompt({ phaseNumber: request.phase.number, phaseCount: request.phaseCount, plannerTurn: must(plannerTurn, 'planner turn') }),
      }),
      // A rejudge reads the planner's latest turn again before classifying it.
      onResult: (_state, { output }) => ({ result: output.outcome === 'judged' ? output.route : null }),
    }),
    askHuman: operation<PlannerState, PlannerState>(async (ctx, state) => {
      const phase = state.request.phase.number;
      await setWorkflowStatus(ctx, { kind: 'severe-flag', phase });
      await ctx.log('warning', `Planner raised a severe flag during phase ${phase}; waiting for human resolution.`);
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Wait for the human to resolve the severe flag' }),
    rereadTurn: operation<PlannerState, PlannerState>(async (ctx, state) => {
      const plannerTurn = await readLatestTurn(ctx, state.request.plannerSessionId, 'planner', state.request.phase.number);
      await ctx.log('info', `Human continued after the severe flag in phase ${state.request.phase.number}; sending the latest planner turn with human-resolution framing and preserving the question gate.`);
      return complete({ update: { plannerTurn, resolved: true } });
    }, { title: "Read the planner's latest turn" }),
  },
  edges: {
    afterTurn: edge<PlannerState, PlannerState>({
      from: 'turn',
      to: ['readTurn', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'planner turn');
        if (turn.outcome === 'ended') return { to: 'readTurn' };
        const phase = state.request.phase.number;
        return { to: 'failed', update: { failure: { message: `Planner turn failed during phase ${phase}`, diagnostic: `Planner turn failed during phase ${phase}: ${turn.reason}` } } };
      },
    }),
    afterReadTurn: edge<PlannerState, PlannerState>({ from: 'readTurn', to: ['classify'], choose: () => ({ to: 'classify' }) }),
    afterClassify: edge<PlannerState, PlannerState>({
      from: 'classify',
      to: ['askHuman', 'exchanged', 'readTurn'],
      choose: (state) => {
        if (state.result === null) return { to: 'readTurn' };
        return { to: state.result === 'severe-flag' ? 'askHuman' : 'exchanged' };
      },
    }),
    afterAskHuman: edge<PlannerState, PlannerState>({
      from: 'askHuman',
      to: ['rereadTurn'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`The severe flag pause resumed with an unexpected ${event.kind} event.`);
        return { to: 'rereadTurn' };
      },
    }),
    afterRereadTurn: edge<PlannerState, PlannerState>({ from: 'rereadTurn', to: ['exchanged'], choose: () => ({ to: 'exchanged' }) }),
  },
  outcomes: {
    exchanged: outcome({
      kind: 'success',
      title: 'Planner turn classified',
      output: (state) => {
        const result = must(state.result, 'planner outcome');
        return { outcome: 'exchanged', plannerTurn: must(state.plannerTurn, 'planner turn'), result: result === 'severe-flag' ? 'severe-flag-resolved' : result };
      },
    }),
    failed: outcome({ kind: 'failure', title: 'Planner exchange failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// A missing turn fails the step with the old diagnostic, so Retry reads the conversation again.
async function readLatestTurn(ctx: OperationContext, agentSessionId: number, role: 'implementer' | 'planner', phaseNumber: number): Promise<string> {
  const text = latestAssistantTurnText(await ctx.getConversationHistory(agentSessionId));
  if (text) return text;
  const { phase, message } = renderWorkflowStatus({ kind: 'failed', message: `No ${role} response was found for phase ${phaseNumber}` });
  return failStep(ctx, { phase: phase ?? 'failed', message: message ?? '' }, `${role} session ${agentSessionId} has no complete assistant turn to inspect.`);
}
