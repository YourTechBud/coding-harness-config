import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, ownedPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { deckArchitect } from '../constants.js';
import { deckPlanExists, readArchitectedDeckPlan, readGenericCurriculumBundle, type ArchitectedDeckPlan } from '../curriculum-v3.js';
import { genericDeckArchitecturePrompt } from '../prompts.js';
import { errorText, must, promptInput, type Failed, type Failure, type WalkthroughContext } from './context.js';

export type DeckPlanOutput = { readonly outcome: 'planned'; readonly plan: ArchitectedDeckPlan } | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly plan: ArchitectedDeckPlan | null;
  readonly turn: AgentTurnOutput | null;
  readonly failure: Failure | null;
};

// Reuses the approved deck plan when it is valid; otherwise an architect plans the narrative and
// coverage before any visual construction.
export const WalkthroughDeckPlanGraph = createGraph<State, {}, WalkthroughContext, DeckPlanOutput>({
  key: 'WalkthroughDeckPlan',
  title: 'Plan the presentation',
  init: (destination, context) => ({ repositoryPath: destination.worktreePath, context, plan: null, turn: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    plan: reduce.replace<ArchitectedDeckPlan | null>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'inspectDeckPlan',
  nodes: {
    inspectDeckPlan: operation<State, State>(async (ctx, state) => {
      const { paths } = state.context;
      let bundle;
      try {
        bundle = readGenericCurriculumBundle(state.repositoryPath, paths);
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'Presentation creation cannot start because the curriculum is invalid.' }, errorText(error));
      }

      if (!deckPlanExists(state.repositoryPath, paths)) return complete();

      try {
        const plan = readArchitectedDeckPlan(state.repositoryPath, paths, bundle);
        await ctx.log('info', `Reusing existing deck plan ${paths.deckPlanPath}; deck architecture is skipped.`);
        await ctx.setUiFeedback({ phase: 'Reusing the approved deck plan', message: `Rebuilding ${paths.htmlPath} neighborhood by neighborhood.` });
        return complete({ update: { plan } });
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The existing deck plan cannot be reused.' }, errorText(error));
      }
    }, { title: 'Reuse the approved deck plan' }),

    architectDeck: agentTurn<State, State>({
      title: 'Architect the presentation',
      parameters: (state) => ({
        label: 'Deck architecture',
        session: { kind: 'spawn', ...deckArchitect },
        prompt: genericDeckArchitecturePrompt(promptInput(state)),
        feedback: { phase: 'Architecting the presentation', message: 'Planning the narrative, audience conclusions, and complete coverage before visual construction.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    readDeckPlan: operation<State, State>(async (ctx, state) => {
      let plan;
      try {
        const bundle = readGenericCurriculumBundle(state.repositoryPath, state.context.paths);
        plan = readArchitectedDeckPlan(state.repositoryPath, state.context.paths, bundle);
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The deck architecture plan is invalid. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, 'architect turn').agent));
      return complete({ update: { plan } });
    }, { title: 'Read the deck plan and close the architect' }),
  },
  edges: {
    afterInspectDeckPlan: edge<State, State>({
      from: 'inspectDeckPlan',
      to: ['planned', 'architectDeck'],
      choose: (state) => ({ to: state.plan ? 'planned' : 'architectDeck' }),
    }),
    afterArchitectDeck: edge<State, State>({
      from: 'architectDeck',
      to: ['readDeckPlan', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'architect turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'Deck architecture failed because its agent session ended.', diagnostic: turn.reason } } };
        return { to: 'readDeckPlan' };
      },
    }),
    afterReadDeckPlan: edge<State, State>({
      from: 'readDeckPlan',
      to: ['planned'],
      choose: () => ({ to: 'planned' }),
    }),
  },
  outcomes: {
    planned: outcome({ kind: 'success', title: 'Deck planned', output: (state) => ({ outcome: 'planned', plan: must(state.plan, 'deck plan') }) }),
    failed: outcome({ kind: 'failure', title: 'Deck not planned', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});
