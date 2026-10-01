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
  type HeadlessOperationResult,
  type NodeEvent,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { commitPrompt, commitRecoveryPrompt, parseCommitResult, type CommitResult } from '../commit.js';
import { commitAgent } from '../constants.js';
import { setWorkflowStatus } from '../feedback.js';
import type { PlanPhase } from '../judgments.js';
import { errorText, must, type Failed, type Failure } from './context.js';

export type CommitParameters = { readonly phase: PlanPhase; readonly phaseCount: number; readonly entryPlanPath: string };
export type CommitOutput = { readonly outcome: 'committed' } | Failed;

type State = {
  readonly repositoryPath: string;
  readonly request: CommitParameters;
  readonly operationId: string | null;
  readonly recovering: boolean;
  readonly previousResult: HeadlessOperationResult | null;
  readonly commit: CommitResult | null;
  readonly error: string | null;
  readonly failure: Failure | null;
};

// A headless agent commits the phase. A commit result that cannot be verified pauses; Continue runs
// one recovery agent that inspects Git first, which is what an explicit Retry did before. A failed
// recovery fails the phase.
export const CommitGraph = createGraph<State, {}, CommitParameters, CommitOutput>({
  key: 'ImplementPhaseWisePlanCommit',
  title: 'Commit the phase',
  init: (destination, request) => ({ repositoryPath: destination.worktreePath, request, operationId: null, recovering: false, previousResult: null, commit: null, error: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    request: reduce.replace<CommitParameters>(),
    operationId: reduce.replace<string | null>(),
    recovering: reduce.replace<boolean>(),
    previousResult: reduce.replace<HeadlessOperationResult | null>(),
    commit: reduce.replace<CommitResult | null>(),
    error: reduce.replace<string | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'commit',
  nodes: {
    commit: operation<State, State>(async (ctx, { repositoryPath, request }) => {
      await setWorkflowStatus(ctx, { kind: 'commit', phase: request.phase.number, phaseCount: request.phaseCount });
      const handle = await ctx.runHeadlessAgent({ ...commitAgent, prompt: commitPrompt({ worktreePath: repositoryPath, phase: request.phase, phaseCount: request.phaseCount, entryPlanPath: request.entryPlanPath }) });
      await ctx.log('info', `Started commit op ${handle.operationId} for phase ${request.phase.number}.`);
      return suspend({ update: { operationId: handle.operationId }, wait: wait.headlessAgent(handle) });
    }, { title: 'Commit the phase' }),

    askUser: operation<State, State>(async (ctx, state) => {
      const phase = state.request.phase.number;
      const error = must(state.error, 'commit error');
      await ctx.setUiFeedback({ kind: 'warning', phase: 'commit', message: `Commit failed for phase ${phase}: ${error}. Select Continue to inspect Git and recover the commit.` });
      await ctx.log('error', `Commit result validation failed for phase ${phase}: ${error}. Raw result: ${JSON.stringify(state.previousResult)}`);
      return suspend({ wait: wait.userContinue(`Commit failed for phase ${phase}. Continue to inspect Git and recover the commit.`) });
    }, { title: 'Ask the user before recovering the commit' }),

    recover: operation<State, State>(async (ctx, { repositoryPath, request, previousResult }) => {
      await ctx.setUiFeedback({ kind: 'info', phase: 'commit-recovery', message: `Checking Git before retrying the commit for phase ${request.phase.number}.` });
      const handle = await ctx.runHeadlessAgent({
        ...commitAgent,
        prompt: commitRecoveryPrompt({ worktreePath: repositoryPath, phase: request.phase, phaseCount: request.phaseCount, entryPlanPath: request.entryPlanPath, previousResult }),
      });
      await ctx.log('info', `Started commit recovery op ${handle.operationId} for phase ${request.phase.number}.`);
      return suspend({ update: { operationId: handle.operationId, recovering: true }, wait: wait.headlessAgent(handle) });
    }, { title: 'Recover the commit after checking Git' }),

    recordCommit: operation<State, State>(async (ctx, state) => {
      const commit = must(state.commit, 'commit');
      await ctx.log('info', `Verified ${commit.outcome} ${commit.commit} for phase ${state.request.phase.number}: ${commit.subject}.`);
      return complete();
    }, { title: 'Record the verified commit' }),
  },
  edges: {
    afterCommit: edge<State, State>({ from: 'commit', to: ['recordCommit', 'askUser', 'failed'], choose: verifyCommit }),
    afterAskUser: edge<State, State>({
      from: 'askUser',
      to: ['recover'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Commit recovery resumed with an unexpected ${event.kind} event.`);
        return { to: 'recover' };
      },
    }),
    afterRecover: edge<State, State>({ from: 'recover', to: ['recordCommit', 'askUser', 'failed'], choose: verifyCommit }),
    afterRecordCommit: edge<State, State>({ from: 'recordCommit', to: ['committed'], choose: () => ({ to: 'committed' }) }),
  },
  outcomes: {
    committed: outcome({ kind: 'success', title: 'Phase committed', output: () => ({ outcome: 'committed' }) }),
    failed: outcome({ kind: 'failure', title: 'Commit failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function verifyCommit(state: State, event: NodeEvent): EdgeDecision<GraphUpdate<State>> {
  const result = eventGuards.requireHeadless(event, must(state.operationId, 'commit operation'));
  const phase = state.request.phase;
  let error: string;
  try {
    if (result.status !== 'completed') throw new Error(`Commit agent did not complete${result.error ? `: ${result.error}` : ''}.`);
    return { to: 'recordCommit', update: { commit: parseCommitResult(result.output ?? '', phase, state.recovering), error: null } };
  } catch (caught) {
    error = errorText(caught);
  }
  if (!state.recovering) return { to: 'askUser', update: { error, previousResult: result } };
  return {
    to: 'failed',
    update: { error, failure: { message: `Commit failed for phase ${phase.number}`, diagnostic: `Commit failed for phase ${phase.number}: ${error} Recovery attempt exhausted; inspect Git and the recovery output before repairing the workflow.` } },
  };
}
