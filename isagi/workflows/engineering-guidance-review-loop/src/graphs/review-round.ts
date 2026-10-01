import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  suspend,
  wait,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, type AgentPane, type AgentTurnOutput, type JudgmentOutput, type JudgmentParameters } from 'isagi-workflow-common-graphs';

import { reviewer, routingJudgment } from '../constants.js';
import { reviewRoutingPrompt, type ReviewRoute } from '../judgments.js';
import { fixerToReviewerPrompt } from '../prompts.js';
import { ReviewRoutingGraph, must, readLatestTurn, type Failed, type Failure } from './common.js';

export type ReviewRoundParameters = {
  readonly context: string;
  /** Null for the initial review, which spawns the reviewer. */
  readonly reviewer: AgentPane | null;
  /** The fixer's latest response, sent for a re-review. */
  readonly fixerResponse: string | null;
  readonly reviewRound: number;
};

export type ReviewRoundOutput =
  | {
      readonly outcome: 'reviewed';
      readonly reviewer: AgentPane;
      readonly review: string;
      /** `fix` sends the review to the fixer; `complete` closes the loop. */
      readonly verdict: 'complete' | 'fix';
      /** What follows the fixer turn: `complete` for a final fixer turn, `rereview` otherwise. */
      readonly afterFixer: 'complete' | 'rereview';
    }
  | Failed;

type State = ReviewRoundParameters & {
  readonly turn: AgentTurnOutput | null;
  readonly review: string | null;
  readonly route: ReviewRoute | null;
  readonly failure: Failure | null;
};

// One review turn: the reviewer reviews (or re-reviews the fixer's response), and the routing
// judgment decides whether the loop closes, the fixer works, or the user resolves an escalation. After
// an escalation the reviewer's latest turn goes to the fixer without another judgment.
export const ReviewRoundGraph = createGraph<State, {}, ReviewRoundParameters, ReviewRoundOutput>({
  key: 'EngineeringGuidanceReviewRound',
  title: 'Review round',
  label: (parameters) => (parameters.reviewer === null ? 'Initial review' : `Re-review round ${parameters.reviewRound}`),
  init: (_destination, parameters) => ({ ...parameters, turn: null, review: null, route: null, failure: null }),
  state: {
    context: reduce.replace<string>(),
    reviewer: reduce.replace<AgentPane | null>(),
    fixerResponse: reduce.replace<string | null>(),
    reviewRound: reduce.replace<number>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    review: reduce.replace<string | null>(),
    route: reduce.replace<ReviewRoute | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'askReviewer',
  nodes: {
    askReviewer: agentTurn<State, State>({
      title: 'Review the changes',
      parameters: (state) => (state.reviewer === null
        ? {
            label: 'Reviewer',
            session: { kind: 'spawn', ...reviewer },
            modifiers: [{ kind: 'command', name: 'perform-engineering-guidance-review' }],
            prompt: state.context,
            feedback: { phase: 'Starting reviewer' },
          }
        : {
            label: 'Reviewer',
            session: { kind: 'existing', ...state.reviewer },
            prompt: fixerToReviewerPrompt(must(state.fixerResponse, 'fixer response')),
            feedback: { phase: 'Re-reviewing fixes' },
          }),
      onResult: (_state, turn) => ({ turn, reviewer: turn.agent }),
    }),

    readReview: operation<State, State>(async (ctx, state) => {
      return complete({ update: { review: await readLatestTurn(ctx, must(state.reviewer, 'reviewer').agentSessionId, 'reviewer') } });
    }, { title: 'Read the review' }),

    routeReview: subgraph<State, State, JudgmentParameters, JudgmentOutput<ReviewRoute>>({
      graph: ReviewRoutingGraph,
      title: 'Route the review',
      parameters: (state) => ({
        label: 'reviewer',
        profile: routingJudgment,
        prompt: reviewRoutingPrompt({ review: must(state.review, 'review') }),
        feedback: { phase: 'Routing reviewer feedback' },
      }),
      // A rejudge reads the reviewer's latest turn again before routing it.
      onResult: (_state, { output }) => ({ route: output.outcome === 'judged' ? output.route : null }),
    }),

    awaitHumanDecision: operation<State, State>(async (ctx, state) => {
      await ctx.setUiFeedback({ kind: 'warning', phase: 'Waiting for your decision', message: 'The reviewer raised a human escalation. Resolve it, then continue the workflow.' });
      await ctx.log('warning', state.fixerResponse === null
        ? 'Reviewer raised a human escalation before the first fixer turn; waiting for user resolution.'
        : `Reviewer raised a human escalation in review round ${state.reviewRound}; waiting for user resolution.`);
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Wait for the human decision' }),

    readResolvedReview: operation<State, State>(async (ctx, state) => {
      const review = await readLatestTurn(ctx, must(state.reviewer, 'reviewer').agentSessionId, 'reviewer');
      await ctx.log('info', state.fixerResponse === null
        ? "User continued after the initial disagreement; sending the reviewer session's latest complete turn to the fixer."
        : `User continued review round ${state.reviewRound}; sending the reviewer session's latest complete turn to the fixer.`);
      return complete({ update: { review, route: 'continue' } });
    }, { title: "Read the reviewer's latest turn" }),
  },
  edges: {
    afterAskReviewer: edge<State, State>({
      from: 'askReviewer',
      to: ['readReview', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'reviewer turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'Reviewer turn failed', diagnostic: `Reviewer turn failed: ${turn.reason}` } } };
        return { to: 'readReview' };
      },
    }),
    afterReadReview: edge<State, State>({ from: 'readReview', to: ['routeReview'], choose: () => ({ to: 'routeReview' }) }),
    afterRouteReview: edge<State, State>({
      from: 'routeReview',
      to: ['reviewed', 'awaitHumanDecision', 'readReview'],
      choose: (state) => {
        if (state.route === null) return { to: 'readReview' };
        return { to: state.route === 'human-decision' ? 'awaitHumanDecision' : 'reviewed' };
      },
    }),
    afterAwaitHumanDecision: edge<State, State>({
      from: 'awaitHumanDecision',
      to: ['readResolvedReview'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`The human-decision pause resumed with an unexpected ${event.kind} event.`);
        return { to: 'readResolvedReview' };
      },
    }),
    afterReadResolvedReview: edge<State, State>({ from: 'readResolvedReview', to: ['reviewed'], choose: () => ({ to: 'reviewed' }) }),
  },
  outcomes: {
    reviewed: outcome({
      kind: 'success',
      title: 'Reviewed',
      output: (state) => {
        const route = must(state.route, 'route');
        return {
          outcome: 'reviewed',
          reviewer: must(state.reviewer, 'reviewer'),
          review: must(state.review, 'review'),
          verdict: route === 'complete' ? 'complete' : 'fix',
          afterFixer: route === 'final-fixer' ? 'complete' : 'rereview',
        };
      },
    }),
    failed: outcome({ kind: 'failure', title: 'Review failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});
