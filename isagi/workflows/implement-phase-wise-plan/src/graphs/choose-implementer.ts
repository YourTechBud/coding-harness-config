import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import type { JudgmentOutput, JudgmentParameters } from 'isagi-workflow-common-graphs';

import {
  headlessJudgment,
  implementerGeneric,
  implementerProseHeavy,
  implementerUiHeavy,
  type ImplementerKind,
  type ImplementerProfile,
} from '../constants.js';
import { setWorkflowStatus } from '../feedback.js';
import { classifyPhaseImplementationKindPrompt, type PlanPhase } from '../judgments.js';
import { ImplementerKindJudgment, must } from './context.js';

export type ChooseImplementerParameters = { readonly phase: PlanPhase; readonly phaseCount: number; readonly entryPlanPath: string };
export type ChooseImplementerOutput = { readonly outcome: 'chosen'; readonly profile: ImplementerProfile };

type State = {
  readonly repositoryPath: string;
  readonly request: ChooseImplementerParameters;
  readonly profile: ImplementerProfile | null;
};

// Mock-UI phases always use the UI-heavy implementer; every other phase is classified.
export const ChooseImplementerGraph = createGraph<State, {}, ChooseImplementerParameters, ChooseImplementerOutput>({
  key: 'ImplementPhaseWisePlanChooseImplementer',
  title: 'Choose the implementer',
  init: (destination, request) => ({ repositoryPath: destination.worktreePath, request, profile: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    request: reduce.replace<ChooseImplementerParameters>(),
    profile: reduce.replace<ImplementerProfile | null>(),
  },
  entry: 'prepare',
  nodes: {
    prepare: operation<State, State>(async (ctx, { request }) => {
      await setWorkflowStatus(ctx, { kind: 'preparing-phase', phase: request.phase.number, phaseCount: request.phaseCount });
      if (request.phase.type !== 'mock-ui') return complete();
      await ctx.log('info', `Selected the ui-heavy implementer profile for mock phase ${request.phase.number}.`);
      return complete({ update: { profile: implementerUiHeavy } });
    }, { title: 'Prepare the phase' }),
    classify: subgraph<State, State, JudgmentParameters, JudgmentOutput<ImplementerKind>>({
      graph: ImplementerKindJudgment,
      title: 'Classify the implementation kind',
      parameters: ({ repositoryPath, request }) => ({
        label: 'implementation kind',
        profile: headlessJudgment,
        prompt: classifyPhaseImplementationKindPrompt({ worktreePath: repositoryPath, phaseNumber: request.phase.number, phaseCount: request.phaseCount, entryPlanPath: request.entryPlanPath }),
      }),
      // The classification reads no agent reply, so a rejudge simply classifies again.
      onResult: (_state, { output }) => (output.outcome === 'judged' ? { profile: selectImplementerProfile(output.route) } : {}),
    }),
  },
  edges: {
    afterPrepare: edge<State, State>({ from: 'prepare', to: ['chosen', 'classify'], choose: (state) => ({ to: state.profile ? 'chosen' : 'classify' }) }),
    afterClassify: edge<State, State>({ from: 'classify', to: ['chosen', 'classify'], choose: (state) => ({ to: state.profile ? 'chosen' : 'classify' }) }),
  },
  outcomes: {
    chosen: outcome({ kind: 'success', title: 'Implementer chosen', output: (state) => ({ outcome: 'chosen', profile: must(state.profile, 'implementer profile') }) }),
  },
});

function selectImplementerProfile(kind: ImplementerKind): ImplementerProfile {
  switch (kind) {
    case 'ui-heavy':
      return implementerUiHeavy;
    case 'prose-heavy':
      return implementerProseHeavy;
    case 'generic':
      return implementerGeneric;
  }
}
