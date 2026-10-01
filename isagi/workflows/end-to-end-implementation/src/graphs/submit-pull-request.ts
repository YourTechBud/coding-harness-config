import {
  complete,
  createGraph,
  edge,
  eventGuards,
  operation,
  outcome,
  reduce,
  suspend,
  wait,
  type EdgeDecision,
  type GraphUpdate,
  type NodeEvent,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { pullRequestAgent } from '../constants.js';
import { pullRequestPrompt, readPullRequestResult } from '../pull-request.js';
import { designPaths, entryPlanPath, errorText, must, type Failed, type Failure, type PullRequestResult } from './context.js';

export type PullRequestParameters = { readonly story: string };
export type PullRequestOutput = { readonly outcome: 'submitted'; readonly pullRequest: PullRequestResult } | Failed;

type State = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly operationId: string | null;
  readonly pullRequest: PullRequestResult | null;
  readonly failure: Failure | null;
};

// A headless agent writes the description and opens the pull request against main. Opening a pull
// request is outward-facing, so a submission that cannot be verified fails rather than repeating.
export const PullRequestGraph = createGraph<State, {}, PullRequestParameters, PullRequestOutput>({
  key: 'EndToEndImplementationPullRequest',
  title: 'Submit the pull request',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, operationId: null, pullRequest: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    story: reduce.replace<string>(),
    operationId: reduce.replace<string | null>(),
    pullRequest: reduce.replace<PullRequestResult | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'submit',
  nodes: {
    submit: operation<State, State>(async (ctx, state) => {
      await ctx.setUiFeedback({ phase: 'Submitting pull request', message: 'Preparing the description and targeting main.' });
      const handle = await ctx.runHeadlessAgent({ ...pullRequestAgent, prompt: pullRequestPrompt({ worktreePath: state.repositoryPath, story: state.story, ...designPaths, entryPlanPath }) });
      await ctx.log('info', `Started pull-request submission operation ${handle.operationId} with ${pullRequestAgent.model}.`);
      return suspend({ update: { operationId: handle.operationId }, wait: wait.headlessAgent(handle) });
    }, { title: 'Submit the pull request' }),

    record: operation<State, State>(async (ctx, state) => {
      const pullRequest = must(state.pullRequest, 'pull request');
      await ctx.log('info', `Pull request #${pullRequest.number} submitted from ${pullRequest.headBranch} to main: ${pullRequest.url}.`);
      return complete();
    }, { title: 'Record the pull request' }),
  },
  edges: {
    afterSubmit: edge<State, State>({ from: 'submit', to: ['record', 'failed'], choose: readSubmission }),
    afterRecord: edge<State, State>({ from: 'record', to: ['submitted'], choose: () => ({ to: 'submitted' }) }),
  },
  outcomes: {
    submitted: outcome({ kind: 'success', title: 'Pull request submitted', output: (state) => ({ outcome: 'submitted', pullRequest: must(state.pullRequest, 'pull request') }) }),
    failed: outcome({ kind: 'failure', title: 'Pull request not submitted', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function readSubmission(state: State, event: NodeEvent): EdgeDecision<GraphUpdate<State>> {
  const result = eventGuards.requireHeadless(event, must(state.operationId, 'pull-request operation'));
  try {
    return { to: 'record', update: { pullRequest: readPullRequestResult(result, state.story) } };
  } catch (error) {
    return { to: 'failed', update: { failure: { message: 'Pull-request submission failed', diagnostic: errorText(error) } } };
  }
}
