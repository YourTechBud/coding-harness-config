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

test('automatic review and commit inputs default to yes', async () => {
  const launchCtx = {
    worktreeId: 1,
    worktreePath: '/workspace',
    surfaceId: 7,
    agentSessionId: 11,
  };
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    ['humanInTheLoop', 'autoReview', 'autoCommit'],
  );
  const initialized = await workflow.init(launchCtx, { humanInTheLoop: 'no' });
  assert.equal(initialized.autoReview, true);
  assert.equal(initialized.autoCommit, true);
});

test('completed phase starts the review child with phase-specific context', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: 'await-implementer-outcome',
        implementer: { agentSessionId: 22, paneId: 32 },
        implementerTurn: 'Phase complete.',
        activity: 'implementation',
        exchangeNumber: 3,
      },
      { autoReview: true },
    ),
    headlessResult('{"outcome":"phase-complete"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.deepEqual(result.type === 'suspend' ? result.condition : undefined, {
    kind: 'workflow',
    runIds: [44],
  });
  assert.deepEqual(harness.startedWorkflows, [
    {
      workflowKey: 'engineering-guidance-review-loop',
      variables: {
        context:
          'We are currently implementing phase 2 of the plan in docs/plan.md. Review all the changes since HEAD.',
      },
    },
  ]);
});

test('disabled auto review skips directly to draft commit when no human approval is required', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-implementer-outcome',
      implementer: { agentSessionId: 22, paneId: 32 },
      implementerTurn: 'Phase complete.',
      activity: 'implementation',
      exchangeNumber: 3,
    }),
    headlessResult('{"outcome":"phase-complete"}'),
  );

  assert.equal(result.type, 'cont');
  assert.equal(
    result.type === 'cont' ? (result.state as WorkflowState).stage.kind : undefined,
    'start-draft-commit',
  );
  assert.equal(harness.startedWorkflows.length, 0);
});

test('disabled auto commit advances without launching the draft commit agent', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: 'await-implementer-outcome',
        implementer: { agentSessionId: 22, paneId: 32 },
        implementerTurn: 'Phase complete.',
        activity: 'implementation',
        exchangeNumber: 3,
      },
      { autoCommit: false },
    ),
    headlessResult('{"outcome":"phase-complete"}'),
  );

  assert.equal(result.type, 'cont');
  assert.equal(
    result.type === 'cont' ? (result.state as WorkflowState).stage.kind : undefined,
    'advance-phase',
  );
  assert.equal(harness.headlessLaunchCount, 0);
});

test('successful auto review waits for human approval when enabled', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: 'await-auto-review',
        implementer: { agentSessionId: 22, paneId: 32 },
        runId: 44,
      },
      { autoReview: true, humanInTheLoop: true },
    ),
    workflowResult(44, {
      outcome: 'workflow-executed-successfully',
      reviewCount: 2,
    }),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(result.type === 'suspend' ? result.condition.kind : undefined, 'user_continue');
});

test('malformed review child success stops the parent workflow', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-auto-review',
      implementer: { agentSessionId: 22, paneId: 32 },
      runId: 44,
    }),
    workflowResult(44, { reviewCount: 2 }),
  );

  assert.equal(result.type, 'fail');
  assert.match(result.type === 'fail' ? result.reason : '', /success contract/);
});

test('human approval proceeds to the draft commit stage', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: 'await-phase-review',
        implementer: { agentSessionId: 22, paneId: 32 },
      },
      { humanInTheLoop: true },
    ),
    { kind: 'user_continue' },
  );

  assert.equal(result.type, 'cont');
  assert.equal(
    result.type === 'cont' ? (result.state as WorkflowState).stage.kind : undefined,
    'start-draft-commit',
  );
});

test('human approval respects disabled auto commit', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: 'await-phase-review',
        implementer: { agentSessionId: 22, paneId: 32 },
      },
      { autoCommit: false, humanInTheLoop: true },
    ),
    { kind: 'user_continue' },
  );

  assert.equal(result.type, 'cont');
  assert.equal(
    result.type === 'cont' ? (result.state as WorkflowState).stage.kind : undefined,
    'advance-phase',
  );
});

test('draft commit stage launches the operational agent with strong commit instructions', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'start-draft-commit',
      implementer: { agentSessionId: 22, paneId: 32 },
    }),
    null,
  );

  assert.equal(result.type, 'suspend');
  assert.equal(result.type === 'suspend' ? result.condition.kind : undefined, 'headless_agent');
  assert.match(harness.headlessLaunches[0]?.prompt ?? '', /Create the Git commit yourself now/);
  assert.match(harness.headlessLaunches[0]?.prompt ?? '', /git add -A/);
  assert.match(harness.headlessLaunches[0]?.prompt ?? '', /untracked files/);
  assert.match(harness.headlessLaunches[0]?.prompt ?? '', /draft:/);
});

test('verified draft commit advances the phase', async () => {
  const harness = workflowHarness();
  const commit = 'a'.repeat(40);
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: 'await-draft-commit',
      implementer: { agentSessionId: 22, paneId: 32 },
    }),
    headlessResult(
      `{"outcome":"draft-commit-created","commit":"${commit}","subject":"draft: implement phase 2"}`,
    ),
  );

  assert.equal(result.type, 'cont');
  assert.equal(
    result.type === 'cont' ? (result.state as WorkflowState).stage.kind : undefined,
    'advance-phase',
  );
});

function activeState(
  stage: Record<string, unknown>,
  input?: {
    readonly autoCommit?: boolean;
    readonly autoReview?: boolean;
    readonly humanInTheLoop?: boolean;
  },
): WorkflowState {
  return {
    stateVersion: 4,
    autoCommit: input?.autoCommit ?? true,
    autoReview: input?.autoReview ?? false,
    humanInTheLoop: input?.humanInTheLoop ?? false,
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
  const headlessLaunches: Array<Parameters<WorkflowContext['runHeadlessAgent']>[0]> = [];
  const startedWorkflows: Array<{
    readonly workflowKey: string;
    readonly variables: Record<string, unknown> | undefined;
  }> = [];
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
    runHeadlessAgent: async (headlessInput) => {
      headlessLaunchCount += 1;
      headlessLaunches.push(headlessInput);
      return {
        opId: 'op-1',
        launch: {
          prompt: headlessInput.prompt ?? '',
          harness: headlessInput.harness,
          model: headlessInput.model,
          effort: headlessInput.effort,
          timeoutMs: headlessInput.timeoutMs ?? 900_000,
        },
      };
    },
    startWorkflow: async (workflowKey, variables) => {
      startedWorkflows.push({ workflowKey, variables });
      return 44;
    },
    log: async () => {},
    setUiFeedback: async () => {},
  };
  return {
    ctx,
    sentPrompts,
    headlessLaunches,
    startedWorkflows,
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

function workflowResult(runId: number, result: unknown) {
  return {
    kind: 'workflow',
    results: [{ runId, status: 'done', result }],
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
