import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, type AgentPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { fixer } from '../constants.js';
import { reviewToFixerPrompt } from '../prompts.js';
import { must, readLatestTurn, type Failed, type Failure } from './common.js';

export type FixRoundParameters = {
  /** Null spawns the workflow's own fixer; otherwise the review goes to this session. */
  readonly fixer: AgentPane | null;
  readonly review: string;
  /** Whether a re-review follows, which needs the fixer's response. */
  readonly readResponse: boolean;
};

export type FixRoundOutput = { readonly outcome: 'fixed'; readonly fixer: AgentPane; readonly response: string | null } | Failed;

type State = FixRoundParameters & {
  readonly turn: AgentTurnOutput | null;
  readonly response: string | null;
  readonly failure: Failure | null;
};

// The fixer works through one review. A final fixer turn needs no response; otherwise its latest
// turn is read for the re-review.
export const FixRoundGraph = createGraph<State, {}, FixRoundParameters, FixRoundOutput>({
  key: 'EngineeringGuidanceReviewFix',
  title: 'Fix round',
  init: (_destination, parameters) => ({ ...parameters, turn: null, response: null, failure: null }),
  state: {
    fixer: reduce.replace<AgentPane | null>(),
    review: reduce.replace<string>(),
    readResponse: reduce.replace<boolean>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    response: reduce.replace<string | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'askFixer',
  nodes: {
    askFixer: agentTurn<State, State>({
      title: 'Fix the review findings',
      parameters: (state) => ({
        label: 'Fixer',
        session: state.fixer === null ? { kind: 'spawn', ...fixer } : { kind: 'existing', ...state.fixer },
        prompt: reviewToFixerPrompt(state.review),
        feedback: { phase: 'Fixing review findings' },
      }),
      onResult: (_state, turn) => ({ turn, fixer: turn.agent }),
    }),

    readResponse: operation<State, State>(async (ctx, state) => {
      return complete({ update: { response: await readLatestTurn(ctx, must(state.fixer, 'fixer').agentSessionId, 'fixer') } });
    }, { title: "Read the fixer's response" }),
  },
  edges: {
    afterAskFixer: edge<State, State>({
      from: 'askFixer',
      to: ['readResponse', 'fixed', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'fixer turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'Fixer turn failed', diagnostic: `Fixer turn failed: ${turn.reason}` } } };
        return { to: state.readResponse ? 'readResponse' : 'fixed' };
      },
    }),
    afterReadResponse: edge<State, State>({ from: 'readResponse', to: ['fixed'], choose: () => ({ to: 'fixed' }) }),
  },
  outcomes: {
    fixed: outcome({ kind: 'success', title: 'Fixed', output: (state) => ({ outcome: 'fixed', fixer: must(state.fixer, 'fixer'), response: state.response }) }),
    failed: outcome({ kind: 'failure', title: 'Fix failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});
