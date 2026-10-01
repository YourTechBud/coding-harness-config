import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  type GraphUpdate,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import {
  SolutionWalkthroughGraph,
  type SolutionWalkthroughOutput,
  type SolutionWalkthroughParameters,
} from 'isagi-workflow-solution-walkthrough-story/graph';

import {
  curriculumPath,
  deckPlanPath,
  designPaths,
  must,
  presentationPath,
  reviewDirectory,
  type DeliveryMechanism,
  type Failed,
  type Failure,
  type Familiarity,
  type TechnicalDepth,
  type WalkthroughResult,
} from './context.js';

export type WalkthroughParameters = {
  readonly story: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
};
export type WalkthroughOutput = { readonly outcome: 'walked-through'; readonly walkthrough: WalkthroughResult } | Failed;

type State = WalkthroughParameters & {
  readonly repositoryPath: string;
  readonly walkthrough: WalkthroughResult | null;
  readonly failure: Failure | null;
};

// An existing presentation is reused; otherwise the solution walkthrough builds the presentation or
// runs the Socratic walkthrough the user chose.
export const WalkthroughGraph = createGraph<State, {}, WalkthroughParameters, WalkthroughOutput>({
  key: 'EndToEndImplementationWalkthrough',
  title: 'Walk through the solution',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, walkthrough: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    story: reduce.replace<string>(),
    familiarity: reduce.replace<Familiarity>(),
    technicalDepth: reduce.replace<TechnicalDepth>(),
    deliveryMechanism: reduce.replace<DeliveryMechanism>(),
    walkthrough: reduce.replace<WalkthroughResult | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'checkPresentation',
  nodes: {
    checkPresentation: operation<State, State>(async (ctx, state) => {
      if (state.deliveryMechanism === 'presentation' && artifactFileExists(state.repositoryPath, presentationPath)) {
        await ctx.log('info', `Skipped solution-walkthrough-story because ${presentationPath} already exists.`);
        return complete({ update: { walkthrough: { outcome: 'presentation-reused', presentationPath } } });
      }
      await ctx.setUiFeedback({ phase: 'Starting solution walkthrough' });
      return complete();
    }, { title: 'Reuse an existing presentation' }),

    runWalkthrough: subgraph<State, State, SolutionWalkthroughParameters, SolutionWalkthroughOutput>({
      graph: SolutionWalkthroughGraph,
      title: 'Run the solution walkthrough',
      parameters: (state) => ({
        story: state.story,
        sources: designPaths,
        reviewDirectory,
        audienceProfile: { familiarity: state.familiarity, technicalDepth: state.technicalDepth },
        deliveryMechanism: state.deliveryMechanism,
      }),
      onResult: (state, { output }) => readWalkthroughResult(output, state.deliveryMechanism),
    }),
  },
  edges: {
    afterCheckPresentation: edge<State, State>({ from: 'checkPresentation', to: ['walkedThrough', 'runWalkthrough'], choose: (state) => ({ to: state.walkthrough ? 'walkedThrough' : 'runWalkthrough' }) }),
    afterRunWalkthrough: edge<State, State>({ from: 'runWalkthrough', to: ['failed', 'walkedThrough'], choose: (state) => ({ to: state.failure ? 'failed' : 'walkedThrough' }) }),
  },
  outcomes: {
    walkedThrough: outcome({ kind: 'success', title: 'Solution walked through', output: (state) => ({ outcome: 'walked-through', walkthrough: must(state.walkthrough, 'walkthrough') }) }),
    failed: outcome({ kind: 'failure', title: 'Walkthrough failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// The walkthrough must match the chosen delivery mode and this story's walkthrough paths.
function readWalkthroughResult(output: SolutionWalkthroughOutput, deliveryMechanism: DeliveryMechanism): GraphUpdate<State> {
  const failed = (diagnostic: string) => ({ failure: { message: 'Solution walkthrough failed', diagnostic } });
  if (output.outcome === 'failed') return failed(`solution-walkthrough-story failed: ${output.reason}`);
  if (output.curriculumPath !== curriculumPath) return failed('solution-walkthrough-story returned an unexpected curriculum path.');
  if (deliveryMechanism === 'socratic-walkthrough') {
    if (output.outcome !== 'socratic-walkthrough-completed') return failed('solution-walkthrough-story returned an outcome that does not match Socratic mode.');
    return { walkthrough: { outcome: 'socratic-walkthrough-completed', curriculumPath } };
  }
  if (output.outcome !== 'presentation-created') return failed('solution-walkthrough-story returned an outcome that does not match presentation mode.');
  if (output.deckPlanPath !== deckPlanPath || output.presentationPath !== presentationPath) return failed('solution-walkthrough-story returned unexpected presentation paths.');
  const counts = [output.neighborhoodCount, output.contentMomentCount, output.substantiveSlideCount, output.totalSlideCount, output.coverageItemCount];
  if (!counts.every((count) => Number.isInteger(count) && count > 0)) return failed('solution-walkthrough-story returned invalid presentation counts.');
  return { walkthrough: output };
}

function artifactFileExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}
