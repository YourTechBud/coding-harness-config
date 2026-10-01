import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { setWorkflowStatus } from './feedback.js';
import type { PlanPhase } from './judgments.js';
import { must, type Failure, type Options, type Plan } from './graphs/context.js';
import { DiscoveryGraph, type DiscoveryOutput, type DiscoveryParameters } from './graphs/discovery.js';
import { PhaseGraph, type PhaseOutput, type PhaseParameters } from './graphs/phase.js';

export type { Options as ImplementPhaseWisePlanOptions } from './graphs/context.js';

export type ImplementPhaseWisePlanParameters = {
  readonly options: Options;
  /** The planner session the plan was written in. It answers the implementers and is never closed. */
  readonly plannerSessionId: number;
};

export type ImplementPhaseWisePlanOutput =
  | {
      readonly outcome: 'plan-implemented';
      readonly entryPlanPath: string;
      readonly decisionLogPath: string;
      readonly phases: readonly PlanPhase[];
      readonly completedPhaseCount: number;
    }
  | { readonly outcome: 'failed'; readonly reason: string };

type State = {
  readonly options: Options;
  readonly plannerSessionId: number;
  readonly plan: Plan | null;
  readonly phaseIndex: number;
  readonly failure: Failure | null;
};

// Business view: discover the plan the planner wrote, then implement each remaining phase in order.
export const ImplementPhaseWisePlanGraph = createGraph<State, {}, ImplementPhaseWisePlanParameters, ImplementPhaseWisePlanOutput>({
  key: 'ImplementPhaseWisePlan',
  title: 'Implement phase-wise plan',
  init: (_destination, parameters) => ({ ...parameters, plan: null, phaseIndex: 0, failure: null }),
  state: {
    options: reduce.replace<Options>(),
    plannerSessionId: reduce.replace<number>(),
    plan: reduce.replace<Plan | null>(),
    phaseIndex: reduce.replace<number>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'discoverPlan',
  nodes: {
    discoverPlan: subgraph<State, State, DiscoveryParameters, DiscoveryOutput>({
      graph: DiscoveryGraph,
      title: 'Discover the plan',
      parameters: (state) => ({ plannerSessionId: state.plannerSessionId }),
      onResult: (_state, { output }) => ({ plan: output.plan, phaseIndex: output.plan.currentPhaseIndex }),
    }),
    implementPhase: subgraph<State, State, PhaseParameters, PhaseOutput>({
      graph: PhaseGraph,
      title: 'Implement the phase',
      label: (state) => `Phase ${must(state.plan, 'plan').phases[state.phaseIndex]?.number ?? state.phaseIndex + 1}`,
      parameters: (state) => {
        const plan = must(state.plan, 'plan');
        return { plannerSessionId: state.plannerSessionId, options: state.options, entryPlanPath: plan.entryPlanPath, phases: plan.phases, phaseIndex: state.phaseIndex };
      },
      onResult: (state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { phaseIndex: state.phaseIndex + 1 }),
    }),
    finish: operation<State, State>(async (ctx, state) => {
      const plan = must(state.plan, 'plan');
      await setWorkflowStatus(ctx, { kind: 'complete' });
      await ctx.log('info', `The decision log contains all ${plan.phases.length} phase decisions; plan implementation is complete.`);
      return complete();
    }, { title: 'Finish the plan' }),
    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await setWorkflowStatus(ctx, { kind: 'failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterDiscoverPlan: edge<State, State>({ from: 'discoverPlan', to: ['implementPhase', 'finish'], choose: nextPhase }),
    afterImplementPhase: edge<State, State>({
      from: 'implementPhase',
      to: ['reportFailure', 'implementPhase', 'finish'],
      choose: (state) => (state.failure ? { to: 'reportFailure' } : nextPhase(state)),
    }),
    afterFinish: edge<State, State>({ from: 'finish', to: ['implemented'], choose: () => ({ to: 'implemented' }) }),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    implemented: outcome({
      kind: 'success',
      title: 'Plan implemented',
      output: (state) => {
        const plan = must(state.plan, 'plan');
        return { outcome: 'plan-implemented', entryPlanPath: plan.entryPlanPath, decisionLogPath: plan.decisionLogPath, phases: plan.phases, completedPhaseCount: plan.phases.length };
      },
    }),
    failed: outcome({ kind: 'failure', title: 'Plan implementation failed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});

function nextPhase(state: State) {
  return { to: state.phaseIndex < must(state.plan, 'plan').phases.length ? 'implementPhase' : 'finish' };
}
