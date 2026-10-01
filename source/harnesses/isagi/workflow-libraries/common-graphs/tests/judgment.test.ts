import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperationContext } from '@yourtechbudstudio/isagi-workflow-sdk';

import { createJudgmentGraph, type JudgmentParameters } from '../src/index.js';
import { assertDestinationsDeclared, destination, headlessCompleted, headlessFailed, visit } from '../src/testing.js';

const graph = createJudgmentGraph({
  key: 'WriterJudgment',
  title: 'Route the writer',
  parse: (output: string) => {
    const route = (JSON.parse(output) as { outcome: string }).outcome;
    if (route !== 'ready' && route !== 'failed') throw new Error('writer judgment outcome must be one of: failed, ready.');
    return route;
  },
});
const request: JudgmentParameters = {
  label: 'writer',
  profile: { harness: 'codex', model: 'gpt-6-luna', effort: 'medium' },
  prompt: 'Judge the writer.',
  feedback: { phase: 'Checking writer progress' },
};

test('a completed judgment is parsed into its route', async () => {
  const harness = workflowHarness();
  const judged = await visit(graph, 'judge', harness.ctx, graph.init(destination, request), headlessCompleted('op-1', '{"outcome":"ready"}'));
  assert.deepEqual(harness.launched, [{ harness: 'codex', model: 'gpt-6-luna', effort: 'medium', prompt: 'Judge the writer.' }]);
  assert.deepEqual(harness.feedback, [{ phase: 'Checking writer progress' }]);
  assert.equal(judged.to, 'judged');
  assert.deepEqual(graph.outcomes.judged!.output(judged.state), { outcome: 'judged', route: 'ready' });
});

test('failed and unparseable judgments are retried, then the user is asked and the caller judges a fresh reply', async () => {
  const harness = workflowHarness();
  const first = await visit(graph, 'judge', harness.ctx, graph.init(destination, request), headlessFailed('op-1'));
  assert.equal(first.to, 'judge');
  assert.equal(first.state.error, 'Judgment did not complete: judge crashed.');
  const second = await visit(graph, 'judge', harness.ctx, first.state, headlessCompleted('op-2', '{"outcome":"maybe"}'));
  assert.equal(second.to, 'judge');
  const third = await visit(graph, 'judge', harness.ctx, second.state, headlessCompleted('op-3', 'not json'));
  assert.equal(third.to, 'askUser');

  const asked = await visit(graph, 'askUser', harness.ctx, third.state, { kind: 'user_continue' });
  assert.equal(asked.to, 'rejudge');
  assert.deepEqual(graph.outcomes.rejudge!.output(asked.state), { outcome: 'rejudge' });
  assert.match(harness.logs.at(-1) ?? '', /^writer routing failed: /);
  assert.equal(harness.feedback.at(-1)?.phase, 'The writer response could not be routed');
});

test('the inspect label names the judged role', () => {
  assert.equal(graph.label?.(request), 'Route the writer');
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});

function workflowHarness() {
  const launched: Array<Parameters<OperationContext['runHeadlessAgent']>[0]> = [];
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: string[] = [];
  const ctx: OperationContext = {
    destination,
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Unexpected agent session.'); },
    sendAgentPrompt: async () => { throw new Error('Unexpected agent prompt.'); },
    closePane: async () => {},
    getConversationHistory: async () => [],
    runHeadlessAgent: async (input) => {
      launched.push(input);
      return { operationId: `op-${launched.length}` };
    },
    log: async (_level, message) => { logs.push(message); },
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, launched, feedback, logs };
}
