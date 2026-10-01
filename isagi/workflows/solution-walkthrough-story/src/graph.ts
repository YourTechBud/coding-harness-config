import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import type { ArchitectedDeckPlan } from './curriculum-v3.js';
import { must, type Failure, type PresentationCreated, type SocraticCompleted, type WalkthroughContext } from './graphs/context.js';
import { WalkthroughCurriculumGraph, type CurriculumOutput, type CurriculumParameters } from './graphs/curriculum.js';
import { WalkthroughDeckBuildGraph, type DeckBuildOutput, type DeckBuildParameters } from './graphs/deck-build.js';
import { WalkthroughDeckPlanGraph, type DeckPlanOutput } from './graphs/deck-plan.js';
import { WalkthroughSocraticGraph, type SocraticOutput } from './graphs/socratic.js';
import { walkthroughPaths } from './paths.js';
import type { ArtifactPaths, AudienceProfile, DeliveryMechanism } from './types.js';

export type SolutionWalkthroughParameters = {
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly reviewDirectory: string;
  readonly audienceProfile: AudienceProfile;
  readonly deliveryMechanism: DeliveryMechanism;
};

type Delivered = PresentationCreated | SocraticCompleted;

export type SolutionWalkthroughOutput = Delivered | { readonly outcome: 'failed'; readonly reason: string };

type State = {
  readonly context: WalkthroughContext;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly plan: ArchitectedDeckPlan | null;
  readonly delivered: Delivered | null;
  readonly failure: Failure | null;
};

// Business view: prepare the curriculum, then either plan and build the presentation or run the
// Socratic walkthrough. Each phase is its own graph; any phase failure is reported here once.
export const SolutionWalkthroughGraph = createGraph<State, {}, SolutionWalkthroughParameters, SolutionWalkthroughOutput>({
  key: 'SolutionWalkthroughStory',
  title: 'Solution walkthrough',
  init: (_destination, parameters) => ({
    context: {
      story: parameters.story,
      sources: parameters.sources,
      paths: walkthroughPaths(parameters.reviewDirectory),
      audienceProfile: parameters.audienceProfile,
    },
    deliveryMechanism: parameters.deliveryMechanism,
    plan: null,
    delivered: null,
    failure: null,
  }),
  state: {
    context: reduce.replace<WalkthroughContext>(),
    deliveryMechanism: reduce.replace<DeliveryMechanism>(),
    plan: reduce.replace<ArchitectedDeckPlan | null>(),
    delivered: reduce.replace<Delivered | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'prepareCurriculum',
  nodes: {
    prepareCurriculum: subgraph<State, State, CurriculumParameters, CurriculumOutput>({
      graph: WalkthroughCurriculumGraph,
      title: 'Prepare the curriculum',
      parameters: (state) => ({ context: state.context, deliveryMechanism: state.deliveryMechanism }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : {}),
    }),

    planDeck: subgraph<State, State, WalkthroughContext, DeckPlanOutput>({
      graph: WalkthroughDeckPlanGraph,
      title: 'Plan the presentation',
      parameters: (state) => state.context,
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { plan: output.plan }),
    }),

    buildDeck: subgraph<State, State, DeckBuildParameters, DeckBuildOutput>({
      graph: WalkthroughDeckBuildGraph,
      title: 'Build the presentation',
      parameters: (state) => ({ context: state.context, plan: must(state.plan, 'deck plan') }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { delivered: output }),
    }),

    runSocratic: subgraph<State, State, WalkthroughContext, SocraticOutput>({
      graph: WalkthroughSocraticGraph,
      title: 'Run the Socratic walkthrough',
      parameters: (state) => state.context,
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { delivered: output }),
    }),

    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'error', phase: 'Solution walkthrough failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterPrepareCurriculum: edge<State, State>({
      from: 'prepareCurriculum',
      to: ['reportFailure', 'planDeck', 'runSocratic'],
      choose: (state) => {
        if (state.failure) return { to: 'reportFailure' };
        return { to: state.deliveryMechanism === 'presentation' ? 'planDeck' : 'runSocratic' };
      },
    }),
    afterPlanDeck: afterPhase('planDeck', 'buildDeck'),
    afterBuildDeck: afterPhase('buildDeck', 'presentationCreated'),
    afterRunSocratic: afterPhase('runSocratic', 'socraticCompleted'),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    presentationCreated: outcome({ kind: 'success', title: 'Presentation created', output: (state) => must(state.delivered, 'delivered walkthrough') }),
    socraticCompleted: outcome({ kind: 'success', title: 'Socratic walkthrough completed', output: (state) => must(state.delivered, 'delivered walkthrough') }),
    failed: outcome({ kind: 'failure', title: 'Solution walkthrough failed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});

function afterPhase(from: string, next: string) {
  return edge<State, State>({ from, to: [next, 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : next }) });
}
