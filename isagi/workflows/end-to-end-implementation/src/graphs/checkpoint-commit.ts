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
  type HeadlessOperationResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { failStep } from 'isagi-workflow-common-graphs';

import { checkpointPrompt, isWorktreeClean, verifyCheckpoint } from '../checkpoint.js';
import { commitAgent } from '../constants.js';
import { errorText, must } from './context.js';

export type CheckpointParameters = {
  /** Draft checkpoints use a "draft: " subject. */
  readonly draft: boolean;
  /** Feedback phase while committing, for example "Committing UI session changes". */
  readonly phase: string;
  /** Shown when the checkpoint cannot be verified, for example "UI commit checkpoint failed". */
  readonly failureMessage: string;
};
export type CheckpointOutput = { readonly outcome: 'committed' };

type State = {
  readonly repositoryPath: string;
  readonly request: CheckpointParameters;
  readonly clean: boolean;
  readonly operationId: string | null;
  readonly result: HeadlessOperationResult | null;
};

// Commits every outstanding change of an agent session, verified against Git. A clean worktree needs
// no commit. A commit that cannot be verified fails the step; Retry verifies the same result against
// Git again, so an unverified commit is never accepted.
export const CheckpointGraph = createGraph<State, {}, CheckpointParameters, CheckpointOutput>({
  key: 'EndToEndImplementationCheckpoint',
  title: 'Commit the session',
  label: (parameters) => parameters.phase,
  init: (destination, request) => ({ repositoryPath: destination.worktreePath, request, clean: false, operationId: null, result: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    request: reduce.replace<CheckpointParameters>(),
    clean: reduce.replace<boolean>(),
    operationId: reduce.replace<string | null>(),
    result: reduce.replace<HeadlessOperationResult | null>(),
  },
  entry: 'commit',
  nodes: {
    commit: operation<State, State>(async (ctx, { repositoryPath, request }) => {
      await ctx.setUiFeedback({ phase: request.phase });
      if (isWorktreeClean(repositoryPath)) return complete({ update: { clean: true } });
      const handle = await ctx.runHeadlessAgent({ ...commitAgent, prompt: checkpointPrompt(repositoryPath, request.draft) });
      return suspend({ update: { operationId: handle.operationId }, wait: wait.headlessAgent(handle) });
    }, { title: 'Commit outstanding changes' }),

    verify: operation<State, State>(async (ctx, state) => {
      let verified: string;
      try {
        verified = verifyCheckpoint(must(state.result, 'commit result'), state.repositoryPath, state.request.draft);
      } catch (error) {
        return failStep(ctx, { phase: 'End-to-end implementation failed', message: state.request.failureMessage }, errorText(error));
      }
      await ctx.log('info', verified);
      return complete();
    }, { title: 'Verify the commit against Git' }),
  },
  edges: {
    afterCommit: edge<State, State>({
      from: 'commit',
      to: ['committed', 'verify'],
      choose: (state, event) => {
        if (state.clean) return { to: 'committed' };
        return { to: 'verify', update: { result: eventGuards.requireHeadless(event, must(state.operationId, 'commit operation')) } };
      },
    }),
    afterVerify: edge<State, State>({ from: 'verify', to: ['committed'], choose: () => ({ to: 'committed' }) }),
  },
  outcomes: {
    committed: outcome({ kind: 'success', title: 'Session committed', output: () => ({ outcome: 'committed' }) }),
  },
});
