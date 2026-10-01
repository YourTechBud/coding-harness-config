import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, ownedPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { deckBuilder } from '../constants.js';
import { assertExpectedFile, validatePresentation } from '../contracts.js';
import type { ArchitectedDeckPlan } from '../curriculum-v3.js';
import { genericDeckAssemblyPrompt, genericDeckShellPrompt } from '../prompts.js';
import {
  SHOW_ME_MODIFIER,
  errorText,
  must,
  promptInput,
  type Failed,
  type Failure,
  type PresentationCreated,
  type WalkthroughContext,
} from './context.js';
import { WalkthroughDeckNeighborhoodsGraph, type DeckNeighborhoodsOutput, type DeckNeighborhoodsParameters } from './deck-neighborhoods.js';

export type DeckBuildParameters = { readonly context: WalkthroughContext; readonly plan: ArchitectedDeckPlan };
export type DeckBuildOutput = PresentationCreated | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly plan: ArchitectedDeckPlan;
  readonly turn: AgentTurnOutput | null;
  readonly created: PresentationCreated | null;
  readonly failure: Failure | null;
};

// Rebuilds the standalone HTML deck from the plan: the shared shell, every neighborhood, then a
// final assembly pass that is validated against the plan.
export const WalkthroughDeckBuildGraph = createGraph<State, {}, DeckBuildParameters, DeckBuildOutput>({
  key: 'WalkthroughDeckBuild',
  title: 'Build the presentation',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, created: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    plan: reduce.replace<ArchitectedDeckPlan>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    created: reduce.replace<PresentationCreated | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'buildShell',
  nodes: {
    buildShell: agentTurn<State, State>({
      title: 'Build the deck shell',
      parameters: (state) => ({
        label: 'Deck shell creation',
        session: { kind: 'spawn', ...deckBuilder },
        prompt: genericDeckShellPrompt(promptInput(state)),
        feedback: { phase: 'Establishing the presentation design', message: 'Creating the shared presentation environment and opening slide.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    checkShell: operation<State, State>(async (ctx, state) => {
      try {
        assertExpectedFile(state.repositoryPath, state.context.paths.htmlPath, 'walkthrough deck shell');
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The deck shell is missing. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, 'builder turn').agent));
      return complete();
    }, { title: 'Check the deck shell and close the builder' }),

    buildNeighborhoods: subgraph<State, State, DeckNeighborhoodsParameters, DeckNeighborhoodsOutput>({
      graph: WalkthroughDeckNeighborhoodsGraph,
      title: 'Build the neighborhoods',
      parameters: (state) => ({ context: state.context, plan: state.plan }),
      onResult: (_state, result) => (result.output.outcome === 'failed' ? { failure: result.output.failure } : {}),
    }),

    assemble: agentTurn<State, State>({
      title: 'Assemble the presentation',
      parameters: (state) => ({
        label: 'Final deck assembly',
        session: { kind: 'spawn', ...deckBuilder },
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericDeckAssemblyPrompt(promptInput(state)),
        feedback: { phase: 'Assembling the walkthrough presentation', message: 'Making the neighborhood work feel like one polished presentation.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    finishPresentation: operation<State, State>(async (ctx, state) => {
      const { paths } = state.context;
      let metrics;
      try {
        metrics = validatePresentation(state.repositoryPath, paths.htmlPath, state.plan);
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The assembled walkthrough deck does not satisfy the presentation contract. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, 'builder turn').agent));
      await ctx.setUiFeedback({ phase: 'Walkthrough presentation created', message: `Open ${paths.htmlPath}.` });
      return complete({
        update: {
          created: {
            outcome: 'presentation-created',
            curriculumPath: paths.curriculumPath,
            deckPlanPath: paths.deckPlanPath,
            presentationPath: paths.htmlPath,
            ...metrics,
          },
        },
      });
    }, { title: 'Validate the presentation and close the builder' }),
  },
  edges: {
    afterBuildShell: afterAgentTurn('buildShell', 'checkShell', 'Deck shell creation failed because its agent session ended.'),
    afterCheckShell: edge<State, State>({ from: 'checkShell', to: ['buildNeighborhoods'], choose: () => ({ to: 'buildNeighborhoods' }) }),
    afterBuildNeighborhoods: afterCheck('buildNeighborhoods', 'assemble'),
    afterAssemble: afterAgentTurn('assemble', 'finishPresentation', 'Final deck assembly failed because its agent session ended.'),
    afterFinishPresentation: edge<State, State>({ from: 'finishPresentation', to: ['created'], choose: () => ({ to: 'created' }) }),
  },
  outcomes: {
    created: outcome({ kind: 'success', title: 'Presentation created', output: (state) => must(state.created, 'created presentation') }),
    failed: outcome({ kind: 'failure', title: 'Presentation not created', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function afterAgentTurn(from: string, next: string, message: string) {
  return edge<State, State>({
    from,
    to: [next, 'failed'],
    choose: (state) => {
      const turn = must(state.turn, 'builder turn');
      if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message, diagnostic: turn.reason } } };
      return { to: next };
    },
  });
}

function afterCheck(from: string, next: string) {
  return edge<State, State>({ from, to: [next, 'failed'], choose: (state) => ({ to: state.failure ? 'failed' : next }) });
}
