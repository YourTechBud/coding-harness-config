import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperationContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { createReviewedArtifactGraph, type AgentTurnParameters, type JudgmentParameters, type ReviewerRoute, type WriterRoute } from '../src/index.js';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, destination, judged, rejudged, subgraphOf, subgraphParameters, visit, visitSubgraph } from '../src/testing.js';

type Context = { readonly story: string; readonly artifactPath: string; readonly currentStatePath: string };

const profile = (model: string) => ({ harness: 'claude' as const, model, effort: 'medium' });
const graph = createReviewedArtifactGraph<Context>({
  key: 'DesignThing',
  title: 'Design thing',
  skill: 'design-thing',
  roles: { writer: 'Thing writer', reviewer: 'Thing reviewer' },
  roundLabel: 'thing review round',
  profiles: { writer: profile('writer'), reviewer: profile('reviewer'), writerJudgment: profile('writer-judge'), reviewerJudgment: profile('reviewer-judge') },
  resubmitOnHarnessError: 1,
  phases: {
    writing: 'Designing thing',
    checkingWriter: 'Checking thing writer progress',
    reviewing: 'Reviewing thing',
    routingReview: 'Routing thing review',
    revising: 'Revising thing',
    rereviewing: 'Re-reviewing thing',
    recoveringWriter: 'Recovering thing writer',
    complete: 'Thing complete',
    failed: 'Design thing failed',
  },
  prompts: {
    initialWriter: (input) => `write ${input.story} at ${input.artifactPath} from ${input.currentStatePath} in ${input.repositoryPath}`,
    reviewToWriter: (review) => `apply ${review}`,
    retryWriter: () => 'continue',
    initialReviewer: (input) => `review ${input.artifactPath}`,
    writerToReviewer: (response) => `rereview ${response}`,
    writerRouting: (input) => `route writer ${input.writerResponse} for ${input.artifactPath}`,
    reviewerRouting: (input) => `route reviewer ${input.review}`,
  },
  parse: { writerRoute: (output) => output as WriterRoute, reviewerRoute: (output) => output as ReviewerRoute },
  latestAssistantTurnText: (history) => history.at(-1)?.parts[0]?.text ?? null,
});

const context: Context = { story: 'Story 7', artifactPath: 'docs/thing.md', currentStatePath: 'docs/current.md' };
const writerPane = { agentSessionId: 1, paneId: 11 };
const reviewerPane = { agentSessionId: 2, paneId: 12 };
const writerGraph = subgraphOf(graph, 'write');
const reviewGraph = subgraphOf(graph, 'review');

test('the business graph is write, review, revise, finish, and a failure report', () => {
  assert.deepEqual(Object.keys(graph.nodes), ['write', 'review', 'revise', 'finish', 'reportFailure']);
  assert.deepEqual([graph.key, writerGraph.key, reviewGraph.key], ['DesignThing', 'DesignThingWriter', 'DesignThingReview']);
  for (const each of [graph, writerGraph, reviewGraph]) assertDestinationsDeclared(each);
});

test('the writer is spawned with its profile, skill, and prompt, and its reply is judged', async () => {
  const harness = workflowHarness({ 1: ['draft done'] });
  const start = writerGraph.init(destination, { context, writer: null, review: null });
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'prompt', start);
  assert.deepEqual(turn, {
    label: 'Thing writer',
    session: { kind: 'spawn', ...profile('writer') },
    modifiers: [{ kind: 'skill', name: 'design-thing' }],
    prompt: 'write Story 7 at docs/thing.md from docs/current.md in /workspace',
    feedback: { phase: 'Designing thing' },
    resubmitOnHarnessError: 1,
  });
  const written = visitSubgraph(writerGraph, 'prompt', start, agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(read.to, 'judge');
  assert.deepEqual(subgraphParameters<JudgmentParameters>(writerGraph, 'judge', read.state), {
    label: 'writer',
    profile: profile('writer-judge'),
    prompt: 'route writer draft done for docs/thing.md',
    feedback: { phase: 'Checking thing writer progress' },
  });
  const ready = visitSubgraph(writerGraph, 'judge', read.state, judged('ready'));
  assert.equal(ready.to, 'ready');
  assert.deepEqual(writerGraph.outcomes.ready!.output(ready.state), { outcome: 'ready', writer: writerPane, response: 'draft done' });
});

test('an incomplete writer pauses; Continue re-judges a newer reply, and a second miss gets one nudge', async () => {
  const history: Record<number, string[]> = { 1: ['still working'] };
  const harness = workflowHarness(history);
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  const incomplete = visitSubgraph(writerGraph, 'judge', read.state, judged('failed'));
  assert.equal(incomplete.to, 'askUser');

  const asked = await visit(writerGraph, 'askUser', harness.ctx, incomplete.state, { kind: 'user_continue' });
  assert.match(harness.logs.at(-1) ?? '', /Writer session 1 did not complete its artifact turn\. Latest response:\nstill working/);
  history[1] = ['still working', 'now finished'];
  const recovered = await visit(writerGraph, 'recover', harness.ctx, asked.state);
  assert.equal(recovered.to, 'judge');
  assert.equal(recovered.state.response, 'now finished');

  const stillIncomplete = visitSubgraph(writerGraph, 'judge', recovered.state, judged('failed'));
  assert.equal(stillIncomplete.to, 'nudge');
  assert.deepEqual(subgraphParameters<AgentTurnParameters>(writerGraph, 'nudge', stillIncomplete.state), {
    label: 'Thing writer',
    session: { kind: 'existing', ...writerPane },
    prompt: 'continue',
    feedback: { phase: 'Recovering thing writer' },
    resubmitOnHarnessError: 1,
  });
  const nudged = visitSubgraph(writerGraph, 'nudge', stillIncomplete.state, agentTurnEnded(writerPane));
  assert.equal(nudged.to, 'readResponse');
  const reread = await visit(writerGraph, 'readResponse', harness.ctx, nudged.state);
  assert.equal(visitSubgraph(writerGraph, 'judge', reread.state, judged('failed')).to, 'askUser');
});

test('Continue without a newer reply nudges the writer once', async () => {
  const harness = workflowHarness({ 1: ['still working'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  const asked = await visit(writerGraph, 'askUser', harness.ctx, visitSubgraph(writerGraph, 'judge', read.state, judged('failed')).state, { kind: 'user_continue' });
  assert.equal((await visit(writerGraph, 'recover', harness.ctx, asked.state)).to, 'nudge');
});

test('a missing reply fails the step so Retry reads the conversation again', async () => {
  const harness = workflowHarness({});
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  await assert.rejects(visit(writerGraph, 'readResponse', harness.ctx, written.state), /writer session 1 has no complete assistant turn/);
  assert.deepEqual(harness.feedback.at(-1), { kind: 'error', phase: 'Design thing failed', message: 'No writer response was found' });
  const reviewed = visitSubgraph(reviewGraph, 'prompt', reviewGraph.init(destination, { context, reviewer: null, writerResponse: null, round: 1 }), agentTurnEnded(reviewerPane));
  await assert.rejects(visit(reviewGraph, 'readReview', harness.ctx, reviewed.state), /reviewer session 2 has no complete assistant turn/);
});

test('after a judgment the user looked at, the writer recovers and the reviewer is read again', async () => {
  const harness = workflowHarness({ 1: ['draft done'], 2: ['No re-review needed.'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(visitSubgraph(writerGraph, 'judge', read.state, rejudged()).to, 'recover');
  const reviewed = visitSubgraph(reviewGraph, 'prompt', reviewGraph.init(destination, { context, reviewer: null, writerResponse: null, round: 1 }), agentTurnEnded(reviewerPane));
  const reviewRead = await visit(reviewGraph, 'readReview', harness.ctx, reviewed.state);
  assert.equal(visitSubgraph(reviewGraph, 'judge', reviewRead.state, rejudged()).to, 'readReview');
});

test('a revision sends the review to the same writer', () => {
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: writerPane, review: 'fix the diagram' }));
  assert.deepEqual(turn.session, { kind: 'existing', ...writerPane });
  assert.equal(turn.prompt, 'apply fix the diagram');
  assert.equal(turn.feedback?.phase, 'Revising thing');
  assert.equal(writerGraph.label?.({ context, writer: writerPane, review: 'x' }), 'Revise the artifact');
});

test('a human escalation waits, then re-judges the reviewer’s latest reply', async () => {
  const harness = workflowHarness({ 2: ['Escalation required: pick a store'] });
  const start = reviewGraph.init(destination, { context, reviewer: null, writerResponse: null, round: 1 });
  assert.deepEqual(subgraphParameters<AgentTurnParameters>(reviewGraph, 'prompt', start).modifiers, [{ kind: 'skill', name: 'design-thing' }]);
  const reviewed = visitSubgraph(reviewGraph, 'prompt', start, agentTurnEnded(reviewerPane));
  const read = await visit(reviewGraph, 'readReview', harness.ctx, reviewed.state);
  const escalated = visitSubgraph(reviewGraph, 'judge', read.state, judged('human-decision'));
  assert.equal(escalated.to, 'askHuman');
  const decided = await visit(reviewGraph, 'askHuman', harness.ctx, escalated.state, { kind: 'user_continue' });
  assert.equal(decided.to, 'readReview');
  assert.equal(harness.logs.at(-1), 'Reviewer raised a human escalation in thing review round 1.');
  const complete = visitSubgraph(reviewGraph, 'judge', decided.state, judged('complete'));
  assert.deepEqual(reviewGraph.outcomes.reviewed!.output(complete.state), {
    outcome: 'reviewed',
    verdict: 'complete',
    reviewer: reviewerPane,
    review: 'Escalation required: pick a store',
    round: 1,
  });
});

test('the loop revises until the reviewer completes, then closes both panes and counts rounds', async () => {
  const harness = workflowHarness({});
  let state = graph.init(destination, context);
  let step = visitSubgraph(graph, 'write', state, { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready', writer: writerPane, response: 'draft' } });
  assert.equal(step.to, 'review');
  assert.deepEqual(subgraphParameters(graph, 'review', step.state), { context, reviewer: null, writerResponse: 'draft', round: 1 });

  step = visitSubgraph(graph, 'review', step.state, reviewResult('revise', 1));
  assert.equal(step.to, 'revise');
  assert.deepEqual(subgraphParameters(graph, 'revise', step.state), { context, writer: writerPane, review: 'review 1' });
  step = visitSubgraph(graph, 'revise', step.state, { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready', writer: writerPane, response: 'revised' } });
  assert.equal(step.to, 'review');
  assert.deepEqual(subgraphParameters(graph, 'review', step.state), { context, reviewer: reviewerPane, writerResponse: 'revised', round: 2 });

  step = visitSubgraph(graph, 'review', step.state, reviewResult('complete', 2));
  assert.equal(step.to, 'finish');
  state = step.state;
  const finished = await visit(graph, 'finish', harness.ctx, state);
  assert.equal(finished.to, 'reviewed');
  assert.deepEqual(harness.closedPanes, [11, 12]);
  assert.deepEqual(graph.outcomes.reviewed!.output(finished.state), { outcome: 'artifact-reviewed', artifactPath: 'docs/thing.md', reviewCount: 2 });
});

test('a dead writer session is reported once and fails the loop', async () => {
  const harness = workflowHarness({});
  const died = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnInterrupted(writerPane, 'Thing writer was interrupted in pane 11: session_died'));
  assert.equal(died.to, 'failed');
  const failure = writerGraph.outcomes.failed!.output(died.state);
  const failed = visitSubgraph(graph, 'write', graph.init(destination, context), { outcomeId: 'failed', outcomeKind: 'failure', output: failure });
  assert.equal(failed.to, 'reportFailure');
  const reported = await visit(graph, 'reportFailure', harness.ctx, failed.state);
  assert.deepEqual(harness.feedback.at(-1), { kind: 'error', phase: 'Design thing failed', message: 'Thing writer failed because its agent session ended.' });
  assert.deepEqual(graph.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: 'Thing writer was interrupted in pane 11: session_died' });
});

function reviewResult(verdict: 'complete' | 'revise', round: number) {
  return { outcomeId: 'reviewed', outcomeKind: 'success' as const, output: { outcome: 'reviewed', verdict, reviewer: reviewerPane, review: `review ${round}`, round } };
}

// the phase graphs are private to the factory, so tests reach them through the root.
function workflowHarness(history: Record<number, string[]>) {
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: string[] = [];
  const ctx: OperationContext = {
    destination,
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    sendAgentPrompt: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async (agentSessionId): Promise<readonly WorkflowConversationMessage[]> =>
      (history[agentSessionId] ?? []).map((text) => ({ role: 'assistant', parts: [{ type: 'text', text }] })),
    runHeadlessAgent: async () => { throw new Error('Judgments run in their own graph.'); },
    log: async (_level, message) => { logs.push(message); },
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, closedPanes, feedback, logs };
}
