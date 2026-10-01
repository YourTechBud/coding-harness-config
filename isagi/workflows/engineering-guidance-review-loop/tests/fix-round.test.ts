import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { fixer } from '../src/constants.js';
import { FixRoundGraph } from '../src/graphs/fix-round.js';
import { agent, destination, message, workflowHarness } from './fixtures.js';

const graph = FixRoundGraph;
const review = 'Concern: the lifecycle owner is unclear.';

test('without a fixer session the workflow spawns its own fixer with the review template', () => {
  const turn = subgraphParameters<AgentTurnParameters>(graph, 'askFixer', graph.init(destination, { fixer: null, review, readResponse: true }));
  assert.deepEqual(turn.session, { kind: 'spawn', ...fixer });
  assert.equal(turn.prompt?.startsWith('Heres the feedback from the reviewer:'), true);
  assert.match(turn.prompt ?? '', /Concern: the lifecycle owner is unclear\./);
  assert.match(turn.prompt ?? '', /Never silently dismiss a Blocker or Concern/);
  assert.deepEqual(turn.feedback, { phase: 'Fixing review findings' });
});

test('a caller-supplied fixer session receives the review without a pane', () => {
  const turn = subgraphParameters<AgentTurnParameters>(graph, 'askFixer', graph.init(destination, { fixer: agent(99, null), review, readResponse: true }));
  assert.deepEqual(turn.session, { kind: 'existing', agentSessionId: 99, paneId: null });
});

test('a fixer turn before a re-review reads the fixer response', async () => {
  const harness = workflowHarness({ 12: [message('assistant', 'Fixed the finding.')] });
  const fixed = visitSubgraph(graph, 'askFixer', graph.init(destination, { fixer: null, review, readResponse: true }), agentTurnEnded(agent(12, 22)));
  assert.equal(fixed.to, 'readResponse');
  const read = await visit(graph, 'readResponse', harness.ctx, fixed.state);
  assert.equal(read.to, 'fixed');
  assert.deepEqual(graph.outcomes.fixed!.output(read.state), { outcome: 'fixed', fixer: agent(12, 22), response: 'Fixed the finding.' });
});

test('a final fixer turn finishes without reading a response', () => {
  const fixed = visitSubgraph(graph, 'askFixer', graph.init(destination, { fixer: agent(12, 22), review, readResponse: false }), agentTurnEnded(agent(12, 22)));
  assert.equal(fixed.to, 'fixed');
  assert.deepEqual(graph.outcomes.fixed!.output(fixed.state), { outcome: 'fixed', fixer: agent(12, 22), response: null });
});

test('a missing fixer response fails the step so Retry reads it again', async () => {
  const fixed = visitSubgraph(graph, 'askFixer', graph.init(destination, { fixer: null, review, readResponse: true }), agentTurnEnded(agent(12, 22)));
  await assert.rejects(visit(graph, 'readResponse', workflowHarness().ctx, fixed.state), /fixer session 12 has no complete assistant turn to inspect\./);
});

test('a dead fixer session fails with the old diagnostic', () => {
  const died = visitSubgraph(graph, 'askFixer', graph.init(destination, { fixer: null, review, readResponse: true }), agentTurnInterrupted(agent(12, 22), 'Fixer was interrupted in pane 22: session_died'));
  assert.equal(died.to, 'failed');
  assert.deepEqual(died.state.failure, { message: 'Fixer turn failed', diagnostic: 'Fixer turn failed: Fixer was interrupted in pane 22: session_died' });
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});
