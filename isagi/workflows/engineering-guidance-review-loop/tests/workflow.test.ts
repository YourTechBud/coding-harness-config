import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowOrigin } from '@yourtechbudstudio/isagi-workflow-sdk';
import { assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { EngineeringGuidanceReviewGraph } from '../src/graph.js';
import type { FixRoundParameters } from '../src/graphs/fix-round.js';
import type { ReviewRoundParameters } from '../src/graphs/review-round.js';
import workflow from '../src/index.js';
import { agent, destination, workflowHarness } from './fixtures.js';

const graph = EngineeringGuidanceReviewGraph;
const origin: WorkflowOrigin = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const review = (verdict: 'complete' | 'fix', afterFixer: 'complete' | 'rereview', text = 'Apply the narrow fix.') => ({
  outcomeId: 'reviewed',
  outcomeKind: 'success' as const,
  output: { outcome: 'reviewed', reviewer: agent(11, 21), review: text, verdict, afterFixer },
});
const fixed = (fixerAgent: ReturnType<typeof agent>, response: string | null) => ({
  outcomeId: 'fixed',
  outcomeKind: 'success' as const,
  output: { outcome: 'fixed', fixer: fixerAgent, response },
});

test('command exposes context as its only input and parse preserves it verbatim', async () => {
  const manifest = await workflow.command(origin);
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), ['context']);

  const context = 'Review the working tree.\nKeep this second line.';
  assert.deepEqual(await workflow.parse(origin, { context }), { context, fixerSessionId: null });
  assert.deepEqual(await workflow.parse({ ...origin, agentSessionId: 99, paneId: 109 }, { context }), { context, fixerSessionId: 99 });
  assert.throws(() => workflow.parse(origin, { context: '   ' }), /non-empty free-form text/);
});

test('the business graph is review, fix, finish, and a failure report', () => {
  assert.deepEqual(Object.keys(graph.nodes), ['review', 'fix', 'finish', 'reportFailure']);
  assertDestinationsDeclared(graph);
});

test('an explicit closure completes and closes both workflow-created panes', async () => {
  const harness = workflowHarness();
  let state = graph.init(destination, { context: 'Review this phase.', fixerSessionId: null });
  assert.deepEqual(subgraphParameters<ReviewRoundParameters>(graph, 'review', state), { context: 'Review this phase.', reviewer: null, fixerResponse: null, reviewRound: 1 });

  let step = visitSubgraph(graph, 'review', state, review('fix', 'rereview'));
  assert.equal(step.to, 'fix');
  assert.deepEqual(subgraphParameters<FixRoundParameters>(graph, 'fix', step.state), { fixer: null, review: 'Apply the narrow fix.', readResponse: true });
  step = visitSubgraph(graph, 'fix', step.state, fixed(agent(12, 22), 'Fixed the finding.'));
  assert.equal(step.to, 'review');
  assert.deepEqual(subgraphParameters<ReviewRoundParameters>(graph, 'review', step.state), { context: 'Review this phase.', reviewer: agent(11, 21), fixerResponse: 'Fixed the finding.', reviewRound: 2 });

  step = visitSubgraph(graph, 'review', step.state, review('fix', 'rereview'));
  step = visitSubgraph(graph, 'fix', step.state, fixed(agent(12, 22), 'Fixed it again.'));
  state = visitSubgraph(graph, 'review', step.state, review('complete', 'rereview', 'All findings are resolved.\n\n**No re-review needed.**')).state;
  const finished = await visit(graph, 'finish', harness.ctx, state);
  assert.equal(finished.to, 'succeeded');
  assert.deepEqual(graph.outcomes.succeeded!.output(finished.state), { outcome: 'workflow-executed-successfully', reviewCount: 3 });
  assert.deepEqual(harness.closedPanes, [22, 21]);
});

test('terminal Nits get one final fixer turn without another re-review', async () => {
  const harness = workflowHarness();
  const start = graph.init(destination, { context: 'Review this phase.', fixerSessionId: null });
  const nit = visitSubgraph(graph, 'review', start, review('fix', 'complete', 'Nit: simplify the local name.\n\n**No re-review needed.**'));
  assert.equal(subgraphParameters<FixRoundParameters>(graph, 'fix', nit.state).readResponse, false);
  const fixedOnce = visitSubgraph(graph, 'fix', nit.state, fixed(agent(12, 22), null));
  assert.equal(fixedOnce.to, 'finish');
  await visit(graph, 'finish', harness.ctx, fixedOnce.state);
  assert.deepEqual(harness.closedPanes, [22, 21]);
});

for (const verdict of ['complete', 'final-fixer', 'continue'] as const) {
  test(`a caller-supplied fixer is reused and never closed (${verdict})`, async () => {
    const harness = workflowHarness();
    const start = graph.init(destination, { context: 'Review this phase.', fixerSessionId: 99 });
    let state = start;
    if (verdict === 'complete') {
      state = visitSubgraph(graph, 'review', start, review('complete', 'rereview')).state;
    } else {
      const reviewed = visitSubgraph(graph, 'review', start, review('fix', verdict === 'final-fixer' ? 'complete' : 'rereview'));
      assert.deepEqual(subgraphParameters<FixRoundParameters>(graph, 'fix', reviewed.state).fixer, agent(99, null));
      const afterFix = visitSubgraph(graph, 'fix', reviewed.state, fixed(agent(99, null), verdict === 'continue' ? 'Fixed the finding.' : null));
      state = afterFix.state;
      if (verdict === 'continue') {
        const again = visitSubgraph(graph, 'review', state, review('fix', 'rereview'));
        assert.deepEqual(subgraphParameters<FixRoundParameters>(graph, 'fix', again.state).fixer, agent(99, null));
        state = visitSubgraph(graph, 'review', visitSubgraph(graph, 'fix', again.state, fixed(agent(99, null), 'Done.')).state, review('complete', 'rereview')).state;
      }
    }
    await visit(graph, 'finish', harness.ctx, state);
    assert.deepEqual(harness.closedPanes, [21]);
  });
}

test('a failed round is reported once and ends in the failure outcome', async () => {
  const harness = workflowHarness();
  const failure = { message: 'Reviewer turn failed', diagnostic: 'Reviewer turn failed: Reviewer was interrupted in pane 21: session_died' };
  const failed = visitSubgraph(graph, 'review', graph.init(destination, { context: 'Review.', fixerSessionId: null }), { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', failure } });
  assert.equal(failed.to, 'reportFailure');
  const reported = await visit(graph, 'reportFailure', harness.ctx, failed.state);
  assert.equal(reported.to, 'failed');
  assert.deepEqual(harness.feedback, [{ kind: 'error', phase: 'Review loop failed', message: 'Reviewer turn failed' }]);
  assert.deepEqual(graph.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: failure.diagnostic });
});
