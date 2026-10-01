import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentPane } from 'isagi-workflow-common-graphs';
import {
  ImplementPhaseWisePlanGraph,
  type ImplementPhaseWisePlanOutput,
  type ImplementPhaseWisePlanParameters,
} from 'isagi-workflow-implement-phase-wise-plan/graph';

import type { ArtifactPaths, ImplementationOptions, ImplementedPlan, ImplementStoryParameters, PlanPaths } from './inputs.js';
import { must, PlanningGraph, type Failure, type PlanningOutput, type PlanningParameters } from './planning.js';

export { parseVariables as implementStoryParameters, type ImplementStoryParameters, type Variables as ImplementStoryVariables } from './inputs.js';

export type ImplementStoryOutput =
  | {
      readonly outcome: 'story-implemented';
      readonly story: string;
      readonly artifacts: ArtifactPaths;
      readonly plan: PlanPaths;
      readonly plannerAgentSessionId: number;
      readonly plannerPaneId: number;
      readonly implementation: ImplementedPlan;
    }
  | { readonly outcome: 'failed'; readonly reason: string };

type State = {
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly options: ImplementationOptions;
  readonly planner: AgentPane | null;
  readonly implementation: ImplementedPlan | null;
  readonly failure: Failure | null;
};

// Business view: a planner writes the implementation plan from the designed story, then the plan is
// implemented phase by phase with that planner answering the implementers. The planner stays open.
export const ImplementStoryGraph = createGraph<State, {}, ImplementStoryParameters, ImplementStoryOutput>({
  key: 'ImplementStory',
  title: 'Implement story',
  init: (_destination, parameters) => ({ ...parameters, planner: null, implementation: null, failure: null }),
  state: {
    story: reduce.replace<string>(),
    artifacts: reduce.replace<ArtifactPaths>(),
    plan: reduce.replace<PlanPaths>(),
    options: reduce.replace<ImplementationOptions>(),
    planner: reduce.replace<AgentPane | null>(),
    implementation: reduce.replace<ImplementedPlan | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'createPlan',
  nodes: {
    createPlan: subgraph<State, State, PlanningParameters, PlanningOutput>({
      graph: PlanningGraph,
      title: 'Create the implementation plan',
      parameters: (state) => ({ story: state.story, artifacts: state.artifacts, plan: state.plan }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { planner: output.planner }),
    }),

    implementPlan: subgraph<State, State, ImplementPhaseWisePlanParameters, ImplementPhaseWisePlanOutput>({
      graph: ImplementPhaseWisePlanGraph,
      title: 'Implement the plan phase by phase',
      parameters: (state) => ({
        options: {
          humanInTheLoop: state.options.humanInTheLoop === 'yes',
          autoReview: state.options.autoReview === 'yes',
          autoCommit: state.options.autoCommit === 'yes',
        },
        plannerSessionId: must(state.planner, 'planner').agentSessionId,
      }),
      onResult: (state, { output }) => readImplementedPlan(output, state.plan.entryPlanPath),
    }),

    finish: operation<State, State>(async (ctx, state) => {
      const implementation = must(state.implementation, 'implementation');
      const plannerPane = must(state.planner, 'planner').paneId;
      await ctx.setUiFeedback({ phase: 'Story implemented', message: `Completed ${implementation.completedPhaseCount} phases from ${implementation.entryPlanPath}. Planner remains open in pane ${plannerPane}.` });
      await ctx.log('info', `Story implementation completed from ${implementation.entryPlanPath} with ${implementation.completedPhaseCount}/${implementation.phaseCount} phases; preserving planner pane ${plannerPane}.`);
      return complete();
    }, { title: 'Return the planner to the user' }),

    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'error', phase: 'Implement story failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterCreatePlan: edge<State, State>({ from: 'createPlan', to: ['implementPlan', 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : 'implementPlan' }) }),
    afterImplementPlan: edge<State, State>({ from: 'implementPlan', to: ['finish', 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : 'finish' }) }),
    afterFinish: edge<State, State>({ from: 'finish', to: ['implemented'], choose: () => ({ to: 'implemented' }) }),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    implemented: outcome({
      kind: 'success',
      title: 'Story implemented',
      output: (state) => {
        const plannerSession = must(state.planner, 'planner');
        return {
          outcome: 'story-implemented',
          story: state.story,
          artifacts: state.artifacts,
          plan: state.plan,
          plannerAgentSessionId: plannerSession.agentSessionId,
          plannerPaneId: must(plannerSession.paneId, 'planner pane'),
          implementation: must(state.implementation, 'implementation'),
        };
      },
    }),
    failed: outcome({ kind: 'failure', title: 'Story not implemented', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});

// The phase-wise result must describe this story's plan with every phase completed.
function readImplementedPlan(output: ImplementPhaseWisePlanOutput, expectedEntryPlanPath: string): { readonly implementation: ImplementedPlan } | { readonly failure: Failure } {
  const failed = (diagnostic: string) => ({ failure: { message: 'Story implementation failed', diagnostic } });
  if (output.outcome === 'failed') return failed(`implement-phase-wise-plan failed: ${output.reason}`);
  if (output.entryPlanPath !== expectedEntryPlanPath) return failed(`implement-phase-wise-plan returned entry plan path ${output.entryPlanPath} instead of ${expectedEntryPlanPath}.`);
  if (output.phases.length < 1) return failed('implement-phase-wise-plan returned no implemented phases.');
  if (output.completedPhaseCount !== output.phases.length) return failed(`implement-phase-wise-plan completed ${output.completedPhaseCount} of ${output.phases.length} phases.`);
  return {
    implementation: { entryPlanPath: output.entryPlanPath, decisionLogPath: output.decisionLogPath, phaseCount: output.phases.length, completedPhaseCount: output.completedPhaseCount },
  };
}
