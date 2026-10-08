import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OperationContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { createReviewedArtifactGraph, type AgentTurnParameters, type JudgmentParameters, type ReviewerRoute, type WriterRoute } from '../src/index.js';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, destination as baseDestination, judged, rejudged, subgraphOf, subgraphParameters, visit, visitSubgraph } from '../src/testing.js';

const directory = await mkdtemp(join(tmpdir(), 'isagi-reviewed-artifact-'));
const destination = { ...baseDestination, worktreePath: directory };
await mkdir(join(directory, 'docs'));
await writeFile(join(directory, 'docs/thing.md'), '# Complete artifact');
await writeFile(join(directory, 'docs/empty.md'), '');
after(() => rm(directory, { recursive: true, force: true }));

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
    retryWriter: () => 'finish the writing',
    continueWriter: (review) => `incorporate our discussion and provide a fresh response for the reviewer${review ? `\n\nReview to address:\n${review}` : ''}`,
    initialReviewer: (input) => `review ${input.artifactPath}`,
    writerToReviewer: (response) => `rereview ${response}`,
    writerRouting: (input) => `route writer ${input.writerResponse} for ${input.artifactPath}; exists=${input.artifactExists}`,
    reviewerRouting: (input) => `route reviewer ${input.review}`,
  },
  parse: { writerRoute: (output) => JSON.parse(output), reviewerRoute: (output) => JSON.parse(output) },
  latestAssistantTurnText: (history) => history.at(-1)?.parts[0]?.text ?? null,
});

const context: Context = { story: 'Story 7', artifactPath: 'docs/thing.md', currentStatePath: 'docs/current.md' };
const writerPane = { agentSessionId: 1, paneId: 11 };
const reviewerPane = { agentSessionId: 2, paneId: 12 };
const writerGraph = subgraphOf(graph, 'write');
const reviewGraph = subgraphOf(graph, 'review');

test('the business graph is write, review, revise, finish, and a failure report', () => {
  assert.deepEqual(Object.keys(graph.nodes), ['write', 'review', 'revise', 'askHuman', 'replay', 'finish', 'reportFailure']);
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
    prompt: `write Story 7 at docs/thing.md from docs/current.md in ${directory}`,
    feedback: { phase: 'Designing thing' },
    resubmitOnHarnessError: 1,
  });
  const written = visitSubgraph(writerGraph, 'prompt', start, agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(read.to, 'judge');
  assert.deepEqual(subgraphParameters<JudgmentParameters>(writerGraph, 'judge', read.state), {
    label: 'writer',
    profile: profile('writer-judge'),
    prompt: 'route writer draft done for docs/thing.md; exists=true',
    feedback: { phase: 'Checking thing writer progress' },
  });
  const ready = visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('ready'));
  assert.equal(ready.to, 'ready');
  assert.deepEqual(writerGraph.outcomes.ready!.output(ready.state), { outcome: 'ready', writer: writerPane, response: 'draft done' });
});

test('unfinished writing automatically recovers once, then waits with the actual reason', async () => {
  const harness = workflowHarness({ 1: ['still working'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  const incomplete = visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('incomplete', 'The ownership section remains unfinished.'));
  assert.equal(incomplete.to, 'nudge');
  assert.equal(harness.feedback.length, 0);
  assert.equal(subgraphParameters<AgentTurnParameters>(writerGraph, 'nudge', incomplete.state).prompt, 'finish the writing');
  const nudged = visitSubgraph(writerGraph, 'nudge', incomplete.state, agentTurnEnded(writerPane));
  assert.equal(nudged.state.recoveryAttempts, 1);
  const reread = await visit(writerGraph, 'readResponse', harness.ctx, nudged.state);
  const stillIncomplete = visitSubgraph(writerGraph, 'judge', reread.state, judgedRoute('incomplete', 'The ownership section remains unfinished.'));
  assert.equal(stillIncomplete.to, 'askUser');
  const asked = await visit(writerGraph, 'askUser', harness.ctx, stillIncomplete.state, { kind: 'user_continue' });
  assert.equal(harness.feedback.at(-1)?.phase, 'The writer needs help finishing the artifact');
  assert.match(harness.feedback.at(-1)?.message ?? '', /ownership section remains unfinished/);
  assert.equal(asked.to, 'recover');
  const recovered = await visit(writerGraph, 'recover', harness.ctx, asked.state);
  assert.equal(recovered.state.recoveryAttempts, 0);
  assert.equal(recovered.to, 'replay');
});

test('a reported completion cannot bypass a missing, empty, or directory artifact', async () => {
  const harness = workflowHarness({ 1: ['The artifact is ready for review.'] });
  for (const artifactPath of ['docs/missing.md', 'docs/empty.md', 'docs']) {
    const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context: { ...context, artifactPath }, writer: null, review: null }), agentTurnEnded(writerPane));
    const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
    assert.equal(read.state.artifactExists, false);
    assert.match(subgraphParameters<JudgmentParameters>(writerGraph, 'judge', read.state).prompt, /exists=false/);
    const incomplete = visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('ready'));
    assert.equal(incomplete.to, 'nudge');
    const nudged = visitSubgraph(writerGraph, 'nudge', incomplete.state, agentTurnEnded(writerPane));
    const stillMissing = visitSubgraph(writerGraph, 'judge', nudged.state, judgedRoute('ready'));
    assert.equal(stillMissing.to, 'askUser');
    await visit(writerGraph, 'askUser', harness.ctx, stillMissing.state, { kind: 'user_continue' });
    assert.match(harness.feedback.at(-1)?.message ?? '', /missing or empty/);
    assert.ok(harness.feedback.at(-1)?.message?.includes(artifactPath));
  }
});

test('automatic recovery can create the missing artifact and proceed to review', async () => {
  const artifactPath = 'docs/recovered.md';
  const history = { 1: ['Writing is unfinished.'] };
  const harness = workflowHarness(history);
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context: { ...context, artifactPath }, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(read.state.artifactExists, false);
  const incomplete = visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('incomplete', 'The file has not been written.'));
  assert.equal(incomplete.to, 'nudge');
  await writeFile(join(directory, artifactPath), '# Recovered artifact');
  history[1].push('The artifact is now written and ready for review.');
  const nudged = visitSubgraph(writerGraph, 'nudge', incomplete.state, agentTurnEnded(writerPane));
  const reread = await visit(writerGraph, 'readResponse', harness.ctx, nudged.state);
  assert.equal(reread.state.artifactExists, true);
  const ready = visitSubgraph(writerGraph, 'judge', reread.state, judgedRoute('ready'));
  assert.equal(ready.to, 'ready');
  assert.equal(writerGraph.outcomes.ready!.output(ready.state).response, history[1].at(-1));
});

test('run 18: a completed revision requiring U1 waits, then obtains a fresh reviewer-facing reply', async () => {
  const history = { 1: ['I updated the artifact. It is ready for review, but acceptance needs your U1 scope decision.'] };
  const harness = workflowHarness(history);
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: writerPane, review: 'Record the explicit U1 scope decision.' }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(read.state.artifactExists, true);
  const decision = visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('human-decision', 'U1: preserve pause-based uploads or upload continuous speech?'));
  assert.equal(decision.to, 'askUser');
  const asked = await visit(writerGraph, 'askUser', harness.ctx, decision.state, { kind: 'user_continue' });
  assert.equal(harness.feedback.at(-1)?.phase, 'Waiting for your decision');
  assert.match(harness.feedback.at(-1)?.message ?? '', /U1: preserve pause-based uploads/);
  assert.match(asked.result.type === 'suspend' && asked.result.wait.kind === 'user_continue' ? asked.result.wait.label ?? '' : '', /U1/);
  history[1].push('The user selected pause-based uploads.');
  const recovered = await visit(writerGraph, 'recover', harness.ctx, asked.state);
  assert.equal(recovered.to, 'replay');
  assert.equal(recovered.state.response, read.state.response, 'the discussion is not forwarded as the reviewer response');
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'replay', recovered.state);
  assert.deepEqual(turn.session, { kind: 'existing', ...writerPane });
  assert.match(turn.prompt ?? '', /incorporate our discussion and provide a fresh response/);
  assert.match(turn.prompt ?? '', /Review to address:/);
  const replayed = visitSubgraph(writerGraph, 'replay', recovered.state, agentTurnEnded(writerPane));
  assert.equal(replayed.to, 'readResponse');
  history[1].push('U1 is incorporated into the artifact. Ready for review.');
  const updated = await visit(writerGraph, 'readResponse', harness.ctx, replayed.state);
  const ready = visitSubgraph(writerGraph, 'judge', updated.state, judgedRoute('ready'));
  assert.equal(ready.to, 'ready');
  assert.equal(writerGraph.outcomes.ready!.output(ready.state).response, history[1].at(-1));
});

test('a human decision takes precedence over missing files and an exhausted recovery budget', async () => {
  const harness = workflowHarness({ 1: ['Need a scope decision.'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context: { ...context, artifactPath: 'docs/missing.md' }, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  const decision = visitSubgraph(writerGraph, 'judge', { ...read.state, recoveryAttempts: 1 }, judgedRoute('human-decision', 'Choose the scope.'));
  assert.equal(decision.to, 'askUser');
  await visit(writerGraph, 'askUser', harness.ctx, decision.state, { kind: 'user_continue' });
  assert.equal(harness.feedback.at(-1)?.phase, 'Waiting for your decision');
  assert.match(harness.feedback.at(-1)?.message ?? '', /Choose the scope/);
});

test('Continue always requests a fresh writer reply even without a newer conversation turn', async () => {
  const harness = workflowHarness({ 1: ['Need a decision.'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  const asked = await visit(writerGraph, 'askUser', harness.ctx, visitSubgraph(writerGraph, 'judge', read.state, judgedRoute('human-decision')).state, { kind: 'user_continue' });
  const recovered = await visit(writerGraph, 'recover', harness.ctx, asked.state);
  assert.equal(recovered.to, 'replay');
  const replayed = visitSubgraph(writerGraph, 'replay', recovered.state, agentTurnEnded(writerPane));
  const updated = await visit(writerGraph, 'readResponse', harness.ctx, replayed.state);
  assert.equal(visitSubgraph(writerGraph, 'judge', updated.state, judgedRoute('human-decision')).to, 'askUser');
});

test('a missing reply fails the step so Retry reads the conversation again', async () => {
  const harness = workflowHarness({});
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  await assert.rejects(visit(writerGraph, 'readResponse', harness.ctx, written.state), /writer session 1 has no complete assistant turn/);
  assert.deepEqual(harness.feedback.at(-1), { kind: 'error', phase: 'Design thing failed', message: 'No writer response was found' });
  const reviewed = visitSubgraph(reviewGraph, 'prompt', reviewGraph.init(destination, { context, reviewer: null, writerResponse: null, round: 1 }), agentTurnEnded(reviewerPane));
  await assert.rejects(visit(reviewGraph, 'readReview', harness.ctx, reviewed.state), /reviewer session 2 has no complete assistant turn/);
});

test('after a judgment the user looked at, both replies are read again', async () => {
  const harness = workflowHarness({ 1: ['draft done'], 2: ['No re-review needed.'] });
  const written = visitSubgraph(writerGraph, 'prompt', writerGraph.init(destination, { context, writer: null, review: null }), agentTurnEnded(writerPane));
  const read = await visit(writerGraph, 'readResponse', harness.ctx, written.state);
  assert.equal(visitSubgraph(writerGraph, 'judge', read.state, rejudged()).to, 'readResponse');
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

test('a reviewer decision waits at the loop, then prompts the writer before reviewing again', async () => {
  const harness = workflowHarness({ 2: ['Both agents agree U1 requires the user. No escalation.'] });
  const start = reviewGraph.init(destination, { context, reviewer: null, writerResponse: null, round: 1 });
  const reviewed = visitSubgraph(reviewGraph, 'prompt', start, agentTurnEnded(reviewerPane));
  const read = await visit(reviewGraph, 'readReview', harness.ctx, reviewed.state);
  const decision = visitSubgraph(reviewGraph, 'judge', read.state, judgedRoute('human-decision', 'Choose whether continuous speech uploads are required.'));
  assert.equal(decision.to, 'reviewed');
  const result = reviewGraph.outcomes.reviewed!.output(decision.state);
  const root = { ...graph.init(destination, context), writer: writerPane };
  const waiting = visitSubgraph(graph, 'review', root, { outcomeId: 'reviewed', outcomeKind: 'success', output: result });
  assert.equal(waiting.to, 'askHuman');
  const continued = await visit(graph, 'askHuman', harness.ctx, waiting.state, { kind: 'user_continue' });
  assert.equal(continued.to, 'replay');
  assert.match(harness.feedback.at(-1)?.message ?? '', /continuous speech uploads/);
  assert.match(harness.feedback.at(-1)?.message ?? '', /thing writer/);
  const parameters = subgraphParameters<any>(graph, 'replay', continued.state);
  assert.equal(parameters.afterHumanDecision, true);
  const writerState = writerGraph.init(destination, parameters);
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'prompt', writerState);
  assert.deepEqual(turn.session, { kind: 'existing', ...writerPane });
  assert.match(turn.prompt ?? '', /fresh response for the reviewer/);
  assert.match(turn.prompt ?? '', /Both agents agree U1/);
  const replayed = visitSubgraph(graph, 'replay', continued.state, { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready', writer: writerPane, response: 'Decision incorporated.' } });
  assert.equal(replayed.to, 'review');
  assert.deepEqual(subgraphParameters(graph, 'review', replayed.state), { context, reviewer: reviewerPane, writerResponse: 'Decision incorporated.', round: 2 });
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
  return { outcomeId: 'reviewed', outcomeKind: 'success' as const, output: { outcome: 'reviewed', verdict, reason: 'Review explanation.', reviewer: reviewerPane, review: `review ${round}`, round } };
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

function judgedRoute(outcome: WriterRoute | ReviewerRoute, reason = 'Routing explanation.') {
  return judged({ outcome, reason });
}
