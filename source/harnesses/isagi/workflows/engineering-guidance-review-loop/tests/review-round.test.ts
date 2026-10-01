import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTurnParameters, JudgmentParameters } from 'isagi-workflow-common-graphs';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, judged, rejudged, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { reviewer, routingJudgment } from '../src/constants.js';
import { ReviewRoundGraph, type ReviewRoundParameters } from '../src/graphs/review-round.js';
import { agent, destination, message, workflowHarness } from './fixtures.js';

const graph = ReviewRoundGraph;
const initial: ReviewRoundParameters = { context: 'Review scope and goal.', reviewer: null, fixerResponse: null, reviewRound: 1 };
const rereview: ReviewRoundParameters = { context: 'Review scope and goal.', reviewer: agent(11, 21), fixerResponse: 'Fixed the lifecycle issue. I declined the unrelated refactor.', reviewRound: 2 };

async function reviewed(parameters: ReviewRoundParameters, review: string, route: 'complete' | 'continue' | 'final-fixer' | 'human-decision') {
  const harness = workflowHarness({ 11: [message('assistant', review)] });
  const turned = visitSubgraph(graph, 'askReviewer', graph.init(destination, parameters), agentTurnEnded(agent(11, 21)));
  const read = await visit(graph, 'readReview', harness.ctx, turned.state);
  assert.equal(read.to, 'routeReview');
  return { harness, read, routed: visitSubgraph(graph, 'routeReview', read.state, judged(route)) };
}

test('spawns the reviewer with the command modifier and the full context', () => {
  assert.deepEqual(subgraphParameters<AgentTurnParameters>(graph, 'askReviewer', graph.init(destination, initial)), {
    label: 'Reviewer',
    session: { kind: 'spawn', ...reviewer },
    modifiers: [{ kind: 'command', name: 'perform-engineering-guidance-review' }],
    prompt: 'Review scope and goal.',
    feedback: { phase: 'Starting reviewer' },
  });
});

test('sends the fixer response verbatim inside the re-review template', () => {
  const turn = subgraphParameters<AgentTurnParameters>(graph, 'askReviewer', graph.init(destination, rereview));
  assert.deepEqual(turn.session, { kind: 'existing', agentSessionId: 11, paneId: 21 });
  assert.match(turn.prompt ?? '', /^Heres the implementers response to your review:/);
  assert.match(turn.prompt ?? '', /Fixed the lifecycle issue\. I declined the unrelated refactor\./);
  assert.match(turn.prompt ?? '', /Now run a re-review round:/);
  assert.match(turn.prompt ?? '', /No escalation is valid and expected unless you and the implementer have reached a fundamental impasse/);
  assert.match(turn.prompt ?? '', /A held finding is not itself an escalation/);
  assert.deepEqual(turn.feedback, { phase: 'Re-reviewing fixes' });
});

test('routes the latest review through the configured routing judgment', async () => {
  const { read } = await reviewed(initial, 'Concern: the lifecycle owner is unclear.', 'continue');
  const judgment = subgraphParameters<JudgmentParameters>(graph, 'routeReview', read.state);
  assert.deepEqual(judgment.profile, routingJudgment);
  assert.match(judgment.prompt, /lifecycle owner is unclear/);
  assert.deepEqual(judgment.feedback, { phase: 'Routing reviewer feedback' });
});

test('continue, final-fixer, and complete map to the fixer policy', async () => {
  const cases = [
    ['continue', { verdict: 'fix', afterFixer: 'rereview' }],
    ['final-fixer', { verdict: 'fix', afterFixer: 'complete' }],
    ['complete', { verdict: 'complete', afterFixer: 'rereview' }],
  ] as const;
  for (const [route, expected] of cases) {
    const review = 'Held Concern: the current evidence does not resolve ownership.\n\n## Human Escalation\n\nNo escalation.';
    const { routed } = await reviewed(rereview, review, route);
    assert.equal(routed.to, 'reviewed');
    const output = graph.outcomes.reviewed!.output(routed.state);
    assert.deepEqual(output, { outcome: 'reviewed', reviewer: agent(11, 21), review, ...expected });
  }
});

test('an explicit early human escalation pauses, then sends the reviewer latest turn without another judgment', async () => {
  const review = '## Human Escalation\n\nEscalation required: choose the persistence owner.';
  const { harness, routed } = await reviewed(initial, review, 'human-decision');
  assert.equal(routed.to, 'awaitHumanDecision');

  const paused = await visit(graph, 'awaitHumanDecision', harness.ctx, routed.state, { kind: 'user_continue' });
  assert.equal(paused.result.type === 'suspend' ? paused.result.wait.kind : null, 'user_continue');
  assert.match(harness.feedback.at(-1)?.message ?? '', /human escalation/);
  assert.equal(harness.logs.at(-1)?.message, 'Reviewer raised a human escalation before the first fixer turn; waiting for user resolution.');

  harness.histories[11] = [message('assistant', review), message('user', 'The runtime owns it.'), message('assistant', 'Decision recorded. Apply the runtime-owned design.')];
  const resolved = await visit(graph, 'readResolvedReview', harness.ctx, paused.state);
  assert.equal(resolved.to, 'reviewed');
  assert.deepEqual(graph.outcomes.reviewed!.output(resolved.state), {
    outcome: 'reviewed',
    reviewer: agent(11, 21),
    review: 'Decision recorded. Apply the runtime-owned design.',
    verdict: 'fix',
    afterFixer: 'rereview',
  });
});

test('a later escalation names its review round', async () => {
  const { harness, routed } = await reviewed(rereview, '## Human Escalation\n\nEscalation required: ownership.', 'human-decision');
  await visit(graph, 'awaitHumanDecision', harness.ctx, routed.state, { kind: 'user_continue' });
  assert.equal(harness.logs.at(-1)?.message, 'Reviewer raised a human escalation in review round 2; waiting for user resolution.');
});

test('a rejudge reads the reviewer latest turn again before routing it', async () => {
  const { read } = await reviewed(initial, 'Concern: unclear.', 'continue');
  const again = visitSubgraph(graph, 'routeReview', read.state, rejudged());
  assert.equal(again.to, 'readReview');
  assert.equal(again.state.route, null);
});

test('a dead reviewer session fails, and a missing review fails the step so Retry reads it again', async () => {
  const died = visitSubgraph(graph, 'askReviewer', graph.init(destination, initial), agentTurnInterrupted(agent(11, 21), 'Reviewer was interrupted in pane 21: session_died'));
  assert.equal(died.to, 'failed');
  assert.deepEqual(graph.outcomes.failed!.output(died.state), {
    outcome: 'failed',
    failure: { message: 'Reviewer turn failed', diagnostic: 'Reviewer turn failed: Reviewer was interrupted in pane 21: session_died' },
  });

  const turned = visitSubgraph(graph, 'askReviewer', graph.init(destination, initial), agentTurnEnded(agent(11, 21)));
  const harness = workflowHarness();
  await assert.rejects(visit(graph, 'readReview', harness.ctx, turned.state), /reviewer session 11 has no complete assistant turn to inspect\./);
  assert.deepEqual(harness.feedback, [{ kind: 'error', phase: 'Review loop failed', message: 'No reviewer response was found' }]);
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});
