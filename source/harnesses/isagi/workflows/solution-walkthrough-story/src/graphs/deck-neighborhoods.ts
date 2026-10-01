import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, ownedPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { deckBuilder } from '../constants.js';
import { assertExpectedFile } from '../contracts.js';
import type { ArchitectedDeckPlan } from '../curriculum-v3.js';
import { genericDeckNeighborhoodPrompt } from '../prompts.js';
import { SHOW_ME_MODIFIER, errorText, must, promptInput, type Failed, type Failure, type WalkthroughContext } from './context.js';

export type DeckNeighborhoodsParameters = { readonly context: WalkthroughContext; readonly plan: ArchitectedDeckPlan };
export type DeckNeighborhoodsOutput = { readonly outcome: 'built' } | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly plan: ArchitectedDeckPlan;
  readonly neighborhoodIndex: number;
  readonly turn: AgentTurnOutput | null;
  readonly failure: Failure | null;
};

// Builds each planned neighborhood in its own fresh Show Me session, in plan order.
export const WalkthroughDeckNeighborhoodsGraph = createGraph<State, {}, DeckNeighborhoodsParameters, DeckNeighborhoodsOutput>({
  key: 'WalkthroughDeckNeighborhoods',
  title: 'Build the deck neighborhoods',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, neighborhoodIndex: 0, turn: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    plan: reduce.replace<ArchitectedDeckPlan>(),
    neighborhoodIndex: reduce.replace<number>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'buildNeighborhood',
  nodes: {
    buildNeighborhood: agentTurn<State, State>({
      title: 'Build a neighborhood',
      label: (state) => `Build ${neighborhoodAt(state).title}`,
      parameters: (state) => {
        const neighborhood = neighborhoodAt(state);
        return {
          label: 'Neighborhood construction',
          session: { kind: 'spawn', ...deckBuilder },
          modifiers: SHOW_ME_MODIFIER,
          prompt: genericDeckNeighborhoodPrompt(promptInput(state), state.plan, neighborhood, state.neighborhoodIndex),
          feedback: { phase: `Creating ${neighborhood.title}`, message: `Neighborhood ${state.neighborhoodIndex + 1} of ${state.plan.neighborhoods.length} in a fresh Show Me session.` },
        };
      },
      onResult: (_state, turn) => ({ turn }),
    }),

    checkNeighborhood: operation<State, State>(async (ctx, state) => {
      try {
        assertExpectedFile(state.repositoryPath, state.context.paths.htmlPath, 'walkthrough deck');
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The walkthrough deck is missing after neighborhood construction. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, 'builder turn').agent));
      return complete({ update: { neighborhoodIndex: state.neighborhoodIndex + 1 } });
    }, { title: 'Check the neighborhood and close the builder' }),
  },
  edges: {
    afterBuildNeighborhood: edge<State, State>({
      from: 'buildNeighborhood',
      to: ['checkNeighborhood', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'builder turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'Neighborhood construction failed because its agent session ended.', diagnostic: turn.reason } } };
        return { to: 'checkNeighborhood' };
      },
    }),
    afterCheckNeighborhood: edge<State, State>({
      from: 'checkNeighborhood',
      to: ['buildNeighborhood', 'built'],
      choose: (state) => ({ to: state.neighborhoodIndex < state.plan.neighborhoods.length ? 'buildNeighborhood' : 'built' }),
    }),
  },
  outcomes: {
    built: outcome({ kind: 'success', title: 'Neighborhoods built', output: () => ({ outcome: 'built' }) }),
    failed: outcome({ kind: 'failure', title: 'Neighborhoods not built', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function neighborhoodAt(state: State): ArchitectedDeckPlan['neighborhoods'][number] {
  const neighborhood = state.plan.neighborhoods[state.neighborhoodIndex];
  if (!neighborhood) throw new Error(`No deck neighborhood exists at index ${state.neighborhoodIndex}.`);
  return neighborhood;
}
