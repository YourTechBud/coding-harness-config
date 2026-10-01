import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperationContext } from '@yourtechbudstudio/isagi-workflow-sdk';

import { AgentTurnGraph, type AgentTurnParameters } from '../src/index.js';
import { assertDestinationsDeclared, destination, ended, sessionDied, turnFailed, visit } from '../src/testing.js';

const graph = AgentTurnGraph;
const spawn: AgentTurnParameters = {
  label: 'Deck shell creation',
  session: { kind: 'spawn', harness: 'claude', model: 'opus', effort: 'medium' },
  prompt: 'Build the shell.',
  modifiers: [{ kind: 'skill', name: 'show-me' }],
  feedback: { phase: 'Establishing the presentation design' },
};

test('a spawned turn sets feedback, starts the agent with its profile, and ends with the agent pane', async () => {
  const harness = workflowHarness();
  const sent = await visit(graph, 'send', harness.ctx, graph.init(destination, spawn), ended());
  assert.deepEqual(harness.feedback, [{ phase: 'Establishing the presentation design' }]);
  assert.deepEqual(harness.spawned, [{ harness: 'claude', model: 'opus', effort: 'medium', prompt: 'Build the shell.', modifiers: [{ kind: 'skill', name: 'show-me' }] }]);
  assert.equal(sent.to, 'ended');
  assert.deepEqual(graph.outcomes.ended!.output(sent.state), { outcome: 'ended', agent: { agentSessionId: 11, paneId: 21 } });
});

test('an existing session receives the prompt in its own pane', async () => {
  const harness = workflowHarness();
  const request: AgentTurnParameters = { label: 'Curriculum design', session: { kind: 'existing', agentSessionId: 5, paneId: 6 }, prompt: 'Design it.' };
  const sent = await visit(graph, 'send', harness.ctx, graph.init(destination, request), ended());
  assert.deepEqual(harness.sent, [{ agentSessionId: 5, prompt: 'Design it.', modifiers: undefined }]);
  assert.equal(harness.spawned.length, 0);
  assert.deepEqual(graph.outcomes.ended!.output(sent.state), { outcome: 'ended', agent: { agentSessionId: 5, paneId: 6 } });
});

test('a failed turn asks the user, then the latest turn answers without another prompt', async () => {
  const harness = workflowHarness();
  const stalled = await visit(graph, 'send', harness.ctx, graph.init(destination, spawn), turnFailed('overloaded'));
  assert.equal(stalled.to, 'askUser');

  const asked = await visit(graph, 'askUser', harness.ctx, stalled.state, { kind: 'user_continue' });
  assert.equal(asked.result.type === 'suspend' ? asked.result.wait.kind : null, 'user_continue');
  assert.deepEqual(harness.logs, ['Deck shell creation failed in pane 21: overloaded']);
  assert.equal(harness.feedback.at(-1)?.kind, 'warning');

  assert.equal((await visit(graph, 'recheck', harness.ctx, asked.state, turnFailed('overloaded'))).to, 'askUser');
  const resumed = await visit(graph, 'recheck', harness.ctx, asked.state, ended());
  assert.equal(resumed.result.type === 'suspend' && resumed.result.wait.kind === 'agent_turn' ? resumed.result.wait.target.agentSessionId : null, 11);
  assert.equal(resumed.to, 'ended');
  assert.equal(harness.spawned.length, 1);
  assert.equal(harness.sent.length, 0);
});

test('a harness error resends the same prompt within its budget, then asks the user', async () => {
  const harness = workflowHarness();
  const request: AgentTurnParameters = { ...spawn, label: 'Program-design writer', resubmitOnHarnessError: 1 };
  const failed = await visit(graph, 'send', harness.ctx, graph.init(destination, request), turnFailed('harness_error'));
  assert.equal(failed.to, 'resubmit');
  const resent = await visit(graph, 'resubmit', harness.ctx, failed.state, turnFailed('harness_error'));
  assert.deepEqual(harness.sent, [{ agentSessionId: 11, prompt: 'Build the shell.', modifiers: [{ kind: 'skill', name: 'show-me' }] }]);
  assert.equal(harness.feedback.at(-1)?.phase, 'Retrying program-design writer');
  assert.equal(resent.to, 'askUser');
});

test('other failures and a zero budget never resend', async () => {
  const harness = workflowHarness();
  assert.equal((await visit(graph, 'send', harness.ctx, graph.init(destination, spawn), turnFailed('harness_error'))).to, 'askUser');
  const budgeted = graph.init(destination, { ...spawn, resubmitOnHarnessError: 1 });
  assert.equal((await visit(graph, 'send', harness.ctx, budgeted, turnFailed('context_overflow'))).to, 'askUser');
});

test('a dead session is returned to the caller as the interrupted outcome', async () => {
  const harness = workflowHarness();
  const died = await visit(graph, 'send', harness.ctx, graph.init(destination, spawn), sessionDied());
  assert.equal(died.to, 'interrupted');
  assert.deepEqual(graph.outcomes.interrupted!.output(died.state), {
    outcome: 'interrupted',
    agent: { agentSessionId: 11, paneId: 21 },
    reason: 'Deck shell creation was interrupted in pane 21: session_died',
  });
});

test('the inspect label names the step', () => {
  assert.equal(graph.label?.(spawn), 'Deck shell creation');
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});

function workflowHarness() {
  const spawned: Array<Parameters<OperationContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<OperationContext['sendAgentPrompt']>[0]> = [];
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: string[] = [];
  const ctx: OperationContext = {
    destination,
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async (input) => {
      spawned.push(input);
      return { agentSessionId: 11, paneId: 21, sentAt: '2026-08-30T00:00:00.000Z' };
    },
    sendAgentPrompt: async (input) => {
      sent.push(input);
      return { agentSessionId: input.agentSessionId, sentAt: '2026-08-30T00:00:01.000Z' };
    },
    closePane: async () => {},
    getConversationHistory: async () => [],
    runHeadlessAgent: async () => { throw new Error('Unexpected headless agent.'); },
    log: async (_level, message) => { logs.push(message); },
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, spawned, sent, feedback, logs };
}
