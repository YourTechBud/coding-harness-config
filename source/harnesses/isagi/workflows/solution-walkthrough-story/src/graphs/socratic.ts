import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  suspend,
  wait,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, ownedPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { guide } from '../constants.js';
import { genericSocraticPrompt } from '../prompts.js';
import { SHOW_ME_MODIFIER, must, promptInput, type Failed, type Failure, type SocraticCompleted, type WalkthroughContext } from './context.js';

export type SocraticOutput = SocraticCompleted | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly turn: AgentTurnOutput | null;
  readonly failure: Failure | null;
};

// A guide explores the approved curriculum with the user until they press Continue.
export const WalkthroughSocraticGraph = createGraph<State, {}, WalkthroughContext, SocraticOutput>({
  key: 'WalkthroughSocratic',
  title: 'Socratic walkthrough',
  init: (destination, context) => ({ repositoryPath: destination.worktreePath, context, turn: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'startGuide',
  nodes: {
    startGuide: agentTurn<State, State>({
      title: 'Start the guide',
      parameters: (state) => ({
        label: 'Socratic walkthrough',
        session: { kind: 'spawn', ...guide },
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericSocraticPrompt(promptInput(state)),
        feedback: { phase: 'Starting the Socratic walkthrough', message: 'The guide will use the approved curriculum and grounded coverage analysis.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    awaitDiscussion: operation<State, State>(async (ctx) => {
      await ctx.setUiFeedback({ phase: 'Socratic walkthrough in progress', message: 'Continue the discussion in the guide pane. Press workflow Continue when you are finished.' });
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Wait for the discussion to finish' }),

    closeGuide: operation<State, State>(async (ctx, state) => {
      await ctx.closePane(ownedPane(must(state.turn, 'guide turn').agent));
      return complete();
    }, { title: 'Close the guide' }),
  },
  edges: {
    afterStartGuide: edge<State, State>({
      from: 'startGuide',
      to: ['awaitDiscussion', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'guide turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'The Socratic guide failed.', diagnostic: turn.reason } } };
        return { to: 'awaitDiscussion' };
      },
    }),
    afterAwaitDiscussion: edge<State, State>({
      from: 'awaitDiscussion',
      to: ['closeGuide'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`The Socratic walkthrough resumed with an unexpected ${event.kind} event.`);
        return { to: 'closeGuide' };
      },
    }),
    afterCloseGuide: edge<State, State>({ from: 'closeGuide', to: ['completed'], choose: () => ({ to: 'completed' }) }),
  },
  outcomes: {
    completed: outcome({ kind: 'success', title: 'Socratic walkthrough completed', output: (state) => ({ outcome: 'socratic-walkthrough-completed', curriculumPath: state.context.paths.curriculumPath }) }),
    failed: outcome({ kind: 'failure', title: 'Socratic walkthrough failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});
