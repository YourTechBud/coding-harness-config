import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { failStep } from 'isagi-workflow-common-graphs';
import {
  DesignCurriculumGraph,
  designCurriculumParameters,
  type DesignCurriculumOutput,
  type DesignCurriculumParameters,
} from 'isagi-workflow-design-curriculum/graph';

import { inspectPlanningArtifacts, readGenericCurriculumBundle, removePlanningArtifacts } from '../curriculum-v3.js';
import type { AudienceProfile, DeliveryMechanism } from '../types.js';
import { errorText, must, type Failed, type Failure, type WalkthroughContext } from './context.js';

export type CurriculumParameters = { readonly context: WalkthroughContext; readonly deliveryMechanism: DeliveryMechanism };
export type CurriculumOutput = { readonly outcome: 'ready' } | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly curriculumReusable: boolean;
  readonly curriculumParameters: DesignCurriculumParameters | null;
  readonly curriculum: DesignCurriculumOutput | null;
  readonly failure: Failure | null;
};

// Reuses the approved curriculum when it is valid; otherwise resets the planning artifacts and
// designs a new one.
export const WalkthroughCurriculumGraph = createGraph<State, {}, CurriculumParameters, CurriculumOutput>({
  key: 'WalkthroughCurriculum',
  title: 'Prepare the walkthrough curriculum',
  init: (destination, parameters) => ({
    repositoryPath: destination.worktreePath,
    ...parameters,
    curriculumReusable: false,
    curriculumParameters: null,
    curriculum: null,
    failure: null,
  }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    deliveryMechanism: reduce.replace<DeliveryMechanism>(),
    curriculumReusable: reduce.replace<boolean>(),
    curriculumParameters: reduce.replace<DesignCurriculumParameters | null>(),
    curriculum: reduce.replace<DesignCurriculumOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'inspectPlanning',
  nodes: {
    // Preparing the curriculum parameters here keeps their file checks out of the pure mapping.
    inspectPlanning: operation<State, State>(async (ctx, state) => {
      const { paths } = state.context;
      let reusableArtifacts;
      try {
        reusableArtifacts = inspectPlanningArtifacts(state.repositoryPath, paths);
      } catch (error) {
        try {
          const removed = removePlanningArtifacts(state.repositoryPath, paths);
          await ctx.log('warning', `Reset walkthrough planning artifacts after deterministic validation failed: ${errorText(error)} Removed: ${removed.join(', ') || 'none'}.`);
          reusableArtifacts = { curriculum: false, deckPlan: false };
        } catch (removalError) {
          return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'Invalid walkthrough planning artifacts could not be reset.' }, errorText(removalError));
        }
      }

      if (reusableArtifacts.curriculum) {
        const deckMessage = state.deliveryMechanism === 'presentation'
          ? reusableArtifacts.deckPlan ? 'The approved deck plan will also be reused.' : 'A new deck plan will be created.'
          : 'Continuing directly to Socratic learning.';
        await ctx.log('info', `Reusing existing curriculum ${paths.curriculumPath}; curriculum design is skipped.`);
        await ctx.setUiFeedback({ phase: 'Reusing the approved curriculum', message: deckMessage });
        return complete({ update: { curriculumReusable: true } });
      }

      await ctx.setUiFeedback({ phase: 'Designing the walkthrough curriculum', message: 'Creating the analysis and curriculum before continuing to the selected delivery mode.' });
      const { sources, audienceProfile } = state.context;
      const curriculumParameters = designCurriculumParameters(state.repositoryPath, {
        sources: [
          { id: 'current-state', path: sources.currentStatePath, description: 'The current-state map and evidence the proposal changes.' },
          { id: 'architecture', path: sources.architecturePath, description: 'The proposed architecture and its consequential decisions.' },
          { id: 'program-design', path: sources.programDesignPath, description: 'The proposed program design and exact changed contracts.' },
        ],
        learningGoal: 'Understand the current-state map, proposed architecture, and program design well enough to approve or reject the proposed solution.',
        audienceFamiliarity: curriculumFamiliarity(audienceProfile),
        audienceDepth: curriculumDepth(audienceProfile),
        teachingBrief: 'Establish enough of the current-state map to evaluate the proposal. Connect architecture and program realization wherever teaching them together preserves context. Keep exact changed contracts available as reference material needed for approval. Choose the final storyline from the actual sources when a different grouping is clearer.',
        outputDirectory: paths.walkthroughDirectory,
      });
      return complete({ update: { curriculumParameters } });
    }, { title: 'Reuse or reset the planning artifacts' }),

    designCurriculum: subgraph<State, State, DesignCurriculumParameters, DesignCurriculumOutput>({
      graph: DesignCurriculumGraph,
      title: 'Design the curriculum',
      parameters: (state) => must(state.curriculumParameters, 'curriculum parameters'),
      onResult: (_state, result) => ({ curriculum: result.output }),
    }),

    confirmCurriculum: operation<State, State>(async (ctx, state) => {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.context.paths);
        return complete();
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The curriculum workflow did not complete successfully.' }, errorText(error));
      }
    }, { title: 'Confirm the designed curriculum' }),
  },
  edges: {
    afterInspectPlanning: edge<State, State>({
      from: 'inspectPlanning',
      to: ['ready', 'designCurriculum'],
      choose: (state) => ({ to: state.curriculumReusable ? 'ready' : 'designCurriculum' }),
    }),
    afterDesignCurriculum: edge<State, State>({
      from: 'designCurriculum',
      to: ['confirmCurriculum', 'failed'],
      choose: (state) => {
        const curriculum = must(state.curriculum, 'curriculum result');
        const { paths } = state.context;
        if (curriculum.outcome === 'failed') {
          return { to: 'failed', update: { failure: { message: 'The curriculum workflow did not complete successfully.', diagnostic: `Curriculum design failed: ${curriculum.reason}` } } };
        }
        if (curriculum.analysisPath !== paths.curriculumAnalysisPath || curriculum.curriculumPath !== paths.curriculumPath) {
          return { to: 'failed', update: { failure: { message: 'The curriculum workflow did not complete successfully.', diagnostic: `Curriculum design returned ${curriculum.analysisPath} and ${curriculum.curriculumPath} instead of ${paths.curriculumAnalysisPath} and ${paths.curriculumPath}.` } } };
        }
        return { to: 'confirmCurriculum' };
      },
    }),
    afterConfirmCurriculum: edge<State, State>({
      from: 'confirmCurriculum',
      to: ['ready'],
      choose: () => ({ to: 'ready' }),
    }),
  },
  outcomes: {
    ready: outcome({ kind: 'success', title: 'Curriculum ready', output: () => ({ outcome: 'ready' }) }),
    failed: outcome({ kind: 'failure', title: 'Curriculum not ready', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function curriculumFamiliarity(profile: AudienceProfile): string {
  return profile.familiarity === 'new'
    ? 'The audience is new to this codebase and needs the essential context required to evaluate the proposal.'
    : 'The audience is familiar with this codebase; emphasize consequential changes and include context only when it changes evaluation of the proposal.';
}

function curriculumDepth(profile: AudienceProfile): string {
  switch (profile.technicalDepth) {
    case 'product':
      return 'Explain behavior, user and operational consequences, and tradeoffs while keeping exact technical evidence available for inspection.';
    case 'system-design':
      return 'Explain system boundaries, ownership, flows, state changes, tradeoffs, and the consequential contracts needed to evaluate the design.';
    case 'implementation':
      return 'Explain system intent together with implementation mechanics, exact changed contracts, failure behavior, and migration consequences.';
  }
}
