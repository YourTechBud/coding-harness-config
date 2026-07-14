import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowContext, WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';

type WorkflowState = Parameters<typeof workflow.step>[1];

test('every non-complete implementer turn returns to the planner, including after approval', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-implementer-outcome',
      implementer: { agentSessionId: 22, paneId: 32 },
      implementerTurn: 'Implementation started, but I found another architectural question.',
      activity: 'implementation',
      exchangeNumber: 3,
    }),
    headlessResult('{"outcome":"planner-response-needed"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(result.type === 'suspend' ? result.condition.kind : undefined, 'agent_turn');
  assert.equal(harness.sentPrompts.length, 1);
  assert.equal(harness.sentPrompts[0]?.agentSessionId, 11);
  assert.match(harness.sentPrompts[0]?.text ?? '', /^I am implementing phase 2\./);
  assert.match(harness.sentPrompts[0]?.text ?? '', /another architectural question/);
});

test('planner feedback is sent with only the alignment footer', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-planner-outcome',
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn: 'The boundary belongs in the runtime. Please revise your approach.',
      exchangeNumber: 1,
    }),
    headlessResult('{"outcome":"feedback"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(harness.sentPrompts[0]?.agentSessionId, 22);
  assert.match(
    harness.sentPrompts[0]?.text ?? '',
    /^The boundary belongs in the runtime\. Please revise your approach\.\n\nI want you to:/,
  );
  assert.doesNotMatch(harness.sentPrompts[0]?.text ?? '', /Implement the phase/);
});

test('planner approval is sent verbatim without the alignment footer', async () => {
  const harness = workflowHarness();
  const plannerTurn = 'No flags. I approve implementation.';
  await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-planner-outcome',
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn,
      exchangeNumber: 1,
    }),
    headlessResult('{"outcome":"approved"}'),
  );

  assert.equal(harness.sentPrompts[0]?.text, plannerTurn);
});

test('severe flag continuation sends the latest planner turn verbatim without reclassification', async () => {
  const severePlannerTurn = 'FLAGS\n\nSevere: this changes the persistence boundary.';
  const harness = workflowHarness({
    conversationHistory: [
      message('user', 'Resolve this flag.'),
      message('assistant', severePlannerTurn),
    ],
  });
  const paused = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-planner-outcome',
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn: severePlannerTurn,
      exchangeNumber: 2,
    }),
    headlessResult('{"outcome":"severe-flag"}'),
  );

  assert.equal(paused.type, 'suspend');
  assert.equal(paused.type === 'suspend' ? paused.condition.kind : undefined, 'user_continue');
  assert.equal(harness.sentPrompts.length, 0);

  const resumed = await workflow.step(harness.ctx, suspendedState(paused), {
    kind: 'user_continue',
  });

  assert.equal(resumed.type, 'suspend');
  assert.equal(harness.sentPrompts.length, 1);
  assert.deepEqual(harness.sentPrompts[0], {
    agentSessionId: 22,
    text: severePlannerTurn,
  });
  assert.equal(harness.headlessLaunchCount, 0);
});

function activeState(stage: Record<string, unknown>): WorkflowState {
  return {
    stateVersion: 2,
    humanInTheLoop: false,
    plannerSessionId: 11,
    plan: {
      entryPlanPath: 'docs/plan.md',
      decisionLogPath: 'docs/plan-decisions.md',
      phaseCount: 4,
      completedPhaseCount: 1,
      currentPhase: 2,
    },
    stage,
  } as WorkflowState;
}

function workflowHarness(input?: {
  readonly conversationHistory?: Awaited<ReturnType<WorkflowContext['getConversationHistory']>>;
}) {
  const sentPrompts: Array<{ readonly agentSessionId: number; readonly text: string }> = [];
  let headlessLaunchCount = 0;
  const ctx: WorkflowContext = {
    worktreePath: '/workspace',
    spawnAgentSession: async () => unexpected('spawnAgentSession'),
    sendAgentPrompt: async ({ agentSessionId, prompt }) => {
      if (prompt === undefined) return unexpected('sendAgentPrompt without prompt');
      sentPrompts.push({ agentSessionId, text: prompt });
      return { agentSessionId, sentAt: '2026-07-10T00:00:00.000Z' };
    },
    closePane: async () => unexpected('closePane'),
    getConversationHistory: async () => input?.conversationHistory ?? [],
    runHeadlessAgent: async () => {
      headlessLaunchCount += 1;
      return unexpected('runHeadlessAgent');
    },
    startWorkflow: async () => unexpected('startWorkflow'),
    log: async () => {},
    setUiFeedback: async () => {},
  };
  return {
    ctx,
    sentPrompts,
    get headlessLaunchCount() {
      return headlessLaunchCount;
    },
  };
}

function headlessResult(output: string) {
  return {
    kind: 'headless_agent',
    results: [{ opId: 'op-1', status: 'completed', output }],
  };
}

function suspendedState(result: WorkflowResult): WorkflowState {
  assert.equal(result.type, 'suspend');
  return (result as Extract<WorkflowResult, { readonly type: 'suspend' }>).state as WorkflowState;
}

function message(role: 'user' | 'assistant', text: string) {
  return { role, parts: [{ type: 'text' as const, text, state: 'done' as const }] };
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
