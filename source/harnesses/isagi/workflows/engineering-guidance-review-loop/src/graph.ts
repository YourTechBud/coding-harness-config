import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentPane } from 'isagi-workflow-common-graphs';

import { must, type Failure } from './graphs/common.js';
import { FixRoundGraph, type FixRoundOutput, type FixRoundParameters } from './graphs/fix-round.js';
import { ReviewRoundGraph, type ReviewRoundOutput, type ReviewRoundParameters } from './graphs/review-round.js';

export type EngineeringGuidanceReviewParameters = {
  /** Review scope, goal, and context, sent verbatim to the reviewer. */
  readonly context: string;
  /** The fixer's session when the caller supplies one; null spawns a fixer owned by this workflow. */
  readonly fixerSessionId: number | null;
};

export type EngineeringGuidanceReviewOutput =
  | { readonly outcome: 'workflow-executed-successfully'; readonly reviewCount: number }
  | { readonly outcome: 'failed'; readonly reason: string };

type State = {
  readonly context: string;
  readonly reviewer: AgentPane | null;
  readonly fixer: AgentPane | null;
  readonly review: string | null;
  readonly verdict: 'complete' | 'fix' | null;
  readonly afterFixer: 'complete' | 'rereview' | null;
  readonly fixerResponse: string | null;
  readonly reviewRound: number;
  readonly failure: Failure | null;
};

// Business view: review, then fix and re-review until the reviewer closes the loop, then close the
// panes this workflow created. A caller-supplied fixer session is never closed.
export const EngineeringGuidanceReviewGraph = createGraph<State, {}, EngineeringGuidanceReviewParameters, EngineeringGuidanceReviewOutput>({
  key: 'EngineeringGuidanceReview',
  title: 'Engineering guidance review loop',
  init: (_destination, parameters) => ({
    context: parameters.context,
    reviewer: null,
    fixer: parameters.fixerSessionId === null ? null : { agentSessionId: parameters.fixerSessionId, paneId: null },
    review: null,
    verdict: null,
    afterFixer: null,
    fixerResponse: null,
    reviewRound: 1,
    failure: null,
  }),
  state: {
    context: reduce.replace<string>(),
    reviewer: reduce.replace<AgentPane | null>(),
    fixer: reduce.replace<AgentPane | null>(),
    review: reduce.replace<string | null>(),
    verdict: reduce.replace<'complete' | 'fix' | null>(),
    afterFixer: reduce.replace<'complete' | 'rereview' | null>(),
    fixerResponse: reduce.replace<string | null>(),
    reviewRound: reduce.replace<number>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'review',
  nodes: {
    review: subgraph<State, State, ReviewRoundParameters, ReviewRoundOutput>({
      graph: ReviewRoundGraph,
      title: 'Review',
      label: (state) => (state.reviewer === null ? 'Initial review' : `Re-review round ${state.reviewRound}`),
      parameters: (state) => ({ context: state.context, reviewer: state.reviewer, fixerResponse: state.fixerResponse, reviewRound: state.reviewRound }),
      onResult: (_state, { output }) => (output.outcome === 'failed'
        ? { failure: output.failure }
        : { reviewer: output.reviewer, review: output.review, verdict: output.verdict, afterFixer: output.afterFixer }),
    }),

    fix: subgraph<State, State, FixRoundParameters, FixRoundOutput>({
      graph: FixRoundGraph,
      title: 'Fix',
      label: (state) => `Fix round ${state.reviewRound}`,
      parameters: (state) => ({ fixer: state.fixer, review: must(state.review, 'review'), readResponse: state.afterFixer === 'rereview' }),
      onResult: (_state, { output }) => (output.outcome === 'failed'
        ? { failure: output.failure }
        : { fixer: output.fixer, fixerResponse: output.response }),
    }),

    finish: operation<State, State>(async (ctx, state) => {
      await ctx.setUiFeedback({ phase: 'Review loop complete' });
      if (state.fixer?.paneId != null) await ctx.closePane(state.fixer.paneId);
      const reviewerPane = must(state.reviewer, 'reviewer').paneId;
      if (reviewerPane !== null) await ctx.closePane(reviewerPane);
      await ctx.log('info', `Engineering guidance review loop completed after ${state.reviewRound} review rounds.`);
      return complete();
    }, { title: 'Close the workflow panes' }),

    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'error', phase: 'Review loop failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterReview: edge<State, State>({
      from: 'review',
      to: ['reportFailure', 'finish', 'fix'],
      choose: (state) => {
        if (state.failure) return { to: 'reportFailure' };
        return { to: state.verdict === 'complete' ? 'finish' : 'fix' };
      },
    }),
    afterFix: edge<State, State>({
      from: 'fix',
      to: ['reportFailure', 'finish', 'review'],
      choose: (state) => {
        if (state.failure) return { to: 'reportFailure' };
        if (state.afterFixer === 'complete') return { to: 'finish' };
        return { to: 'review', update: { reviewRound: state.reviewRound + 1 } };
      },
    }),
    afterFinish: edge<State, State>({ from: 'finish', to: ['succeeded'], choose: () => ({ to: 'succeeded' }) }),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    succeeded: outcome({ kind: 'success', title: 'Review loop complete', output: (state) => ({ outcome: 'workflow-executed-successfully', reviewCount: state.reviewRound }) }),
    failed: outcome({ kind: 'failure', title: 'Review loop failed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});
