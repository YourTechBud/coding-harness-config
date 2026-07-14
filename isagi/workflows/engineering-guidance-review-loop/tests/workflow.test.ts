import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  WorkflowContext,
  WorkflowConversationMessage,
  WorkflowLaunchContext,
  WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';

type State = Parameters<typeof workflow.step>[1];

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command exposes context as its only input and init preserves it verbatim', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    ['context'],
  );

  const context = 'Review the working tree.\nKeep this second line.';
  await workflow.validate(launchCtx, { context });
  assert.deepEqual(await workflow.init(launchCtx, { context }), {
    stateVersion: 1,
    context,
    stage: { kind: 'spawn_reviewer' },
  });
  await assert.rejects(async () => workflow.validate(launchCtx, { context: '   ' }));
});

test('spawns the reviewer with the command modifier and the full context', async () => {
  const harness = workflowHarness();
  const state = await workflow.init(launchCtx, { context: 'Review scope and goal.' });
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, 'suspend');
  assert.deepEqual(result.type === 'suspend' ? result.condition : undefined, {
    kind: 'agent_turn',
    agentSessionId: 11,
    sentAt: '2026-07-14T00:00:00.000Z',
  });
  assert.deepEqual(harness.spawned[0], {
    harness: 'pi',
    model: 'gpt-5.6-sol',
    effort: 'high',
    modifiers: [{ kind: 'command', name: 'perform-engineering-guidance-review' }],
    prompt: 'Review scope and goal.',
  });
});

test('routes initial reviewer feedback and starts a fixer in the same workflow run', async () => {
  const reviewerText = 'Concern: the lifecycle owner is unclear.';
  const harness = workflowHarness({ histories: { 11: [message('assistant', reviewerText)] } });
  const routingWait = await workflow.step(
    harness.ctx,
    state({ kind: 'await_initial_review', reviewer: agent(11, 21) }),
    endedTurn(),
  );

  assert.equal(routingWait.type, 'suspend');
  assert.equal(
    routingWait.type === 'suspend' ? routingWait.condition.kind : undefined,
    'headless_agent',
  );
  assert.match(harness.headlessPrompts[0] ?? '', /lifecycle owner is unclear/);

  const fixerWait = await workflow.step(
    harness.ctx,
    suspendedState(routingWait),
    headlessResult('{"outcome":"continue"}'),
  );

  assert.equal(fixerWait.type, 'suspend');
  assert.equal(harness.spawned.length, 1);
  assert.equal(
    harness.spawned[0]?.prompt?.startsWith('Heres the feedback from the reviewer:'),
    true,
  );
  assert.match(harness.spawned[0]?.prompt ?? '', /Concern: the lifecycle owner is unclear\./);
  assert.match(harness.spawned[0]?.prompt ?? '', /Never silently dismiss a Blocker or Concern/);
});

test('sends the fixer response verbatim inside the re-review template', async () => {
  const fixerResponse = 'Fixed the lifecycle issue. I declined the unrelated refactor.';
  const harness = workflowHarness({ histories: { 12: [message('assistant', fixerResponse)] } });
  const result = await workflow.step(
    harness.ctx,
    state({
      kind: 'await_fixer_turn',
      reviewer: agent(11, 21),
      fixer: agent(12, 22),
      reviewRound: 1,
      afterFixer: 'rereview',
    }),
    endedTurn(),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0]?.agentSessionId, 11);
  assert.match(harness.sent[0]?.prompt ?? '', /^Heres the implementers response to your review:/);
  assert.match(
    harness.sent[0]?.prompt ?? '',
    /Fixed the lifecycle issue\. I declined the unrelated refactor\./,
  );
  assert.match(harness.sent[0]?.prompt ?? '', /Now run a re-review round:/);
});

test('an early disagreement pauses instead of being rejected as out of phase', async () => {
  const histories: Record<number, readonly WorkflowConversationMessage[]> = {
    11: [message('assistant', 'Held Concern: choose the persistence owner.')],
  };
  const harness = workflowHarness({ histories });
  const paused = await workflow.step(
    harness.ctx,
    state({
      kind: 'await_initial_review_routing',
      reviewer: agent(11, 21),
      review: 'Held Concern: choose the persistence owner.',
    }),
    headlessResult('{"outcome":"human-decision"}'),
  );

  assert.equal(paused.type, 'suspend');
  assert.equal(paused.type === 'suspend' ? paused.condition.kind : undefined, 'user_continue');

  histories[11] = [
    message('assistant', 'Held Concern: choose the persistence owner.'),
    message('user', 'The runtime owns it.'),
    message('assistant', 'Decision recorded. Apply the runtime-owned design.'),
  ];
  const resumed = await workflow.step(harness.ctx, suspendedState(paused), {
    kind: 'user_continue',
  });

  assert.equal(resumed.type, 'suspend');
  assert.equal(harness.spawned.length, 1);
  assert.match(
    harness.spawned[0]?.prompt ?? '',
    /Decision recorded\. Apply the runtime-owned design\./,
  );
});

test('pauses on a held disagreement and resumes with the reviewer latest turn', async () => {
  const histories: Record<number, readonly WorkflowConversationMessage[]> = {
    11: [message('assistant', 'Held Concern: this needs the users decision.')],
  };
  const harness = workflowHarness({ histories });
  const paused = await workflow.step(
    harness.ctx,
    state({
      kind: 'await_rereview_routing',
      reviewer: agent(11, 21),
      fixer: agent(12, 22),
      review: 'Held Concern: this needs the users decision.',
      reviewRound: 2,
    }),
    headlessResult('{"outcome":"human-decision"}'),
  );

  assert.equal(paused.type, 'suspend');
  assert.deepEqual(paused.type === 'suspend' ? paused.condition : undefined, {
    kind: 'user_continue',
  });
  assert.equal(harness.sent.length, 0);

  histories[11] = [
    message('assistant', 'Held Concern: this needs the users decision.'),
    message('user', 'Use the existing boundary.'),
    message('assistant', 'Decision recorded. Apply the narrow fix.'),
  ];
  const resumed = await workflow.step(harness.ctx, suspendedState(paused), {
    kind: 'user_continue',
  });

  assert.equal(resumed.type, 'suspend');
  assert.equal(harness.sent[0]?.agentSessionId, 12);
  assert.match(harness.sent[0]?.prompt ?? '', /Decision recorded\. Apply the narrow fix\./);
  assert.doesNotMatch(
    harness.sent[0]?.prompt ?? '',
    /Held Concern: this needs the users decision\./,
  );
});

test('an explicit closure completes and closes both workflow-created panes', async () => {
  const review = 'All findings are resolved.\n\n**No re-review needed.**';
  const harness = workflowHarness({ histories: { 11: [message('assistant', review)] } });
  const routingWait = await workflow.step(
    harness.ctx,
    state({
      kind: 'await_rereview',
      reviewer: agent(11, 21),
      fixer: agent(12, 22),
      reviewRound: 3,
    }),
    endedTurn(),
  );
  const result = await workflow.step(
    harness.ctx,
    suspendedState(routingWait),
    headlessResult('{"outcome":"complete"}'),
  );

  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'workflow-executed-successfully',
    reviewCount: 3,
  });
  assert.deepEqual(harness.closedPanes, [22, 21]);
});

test('terminal Nits get one final fixer turn without another re-review', async () => {
  const harness = workflowHarness();
  const fixerWait = await workflow.step(
    harness.ctx,
    state({
      kind: 'await_rereview_routing',
      reviewer: agent(11, 21),
      fixer: agent(12, 22),
      review: 'Nit: simplify the local name.\n\n**No re-review needed.**',
      reviewRound: 3,
    }),
    headlessResult('{"outcome":"final-fixer"}'),
  );

  assert.equal(fixerWait.type, 'suspend');
  assert.match(harness.sent[0]?.prompt ?? '', /Nit: simplify the local name/);
  const result = await workflow.step(harness.ctx, suspendedState(fixerWait), endedTurn());
  assert.equal(result.type, 'done');
  assert.equal(harness.sent.length, 1);
  assert.deepEqual(harness.closedPanes, [22, 21]);
});

test('a failed agent turn fails with visible feedback and diagnostics', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    state({ kind: 'await_initial_review', reviewer: agent(11, 21) }),
    { outcome: 'failed', recordedAt: '2026-07-14T00:00:00.000Z', reason: 'provider exited' },
  );

  assert.equal(result.type, 'fail');
  assert.match(result.type === 'fail' ? result.reason : '', /provider exited/);
  assert.equal(harness.feedback.at(-1)?.kind, 'error');
  assert.match(harness.logs.at(-1)?.message ?? '', /provider exited/);
});

function workflowHarness(input?: {
  readonly histories?: Record<number, readonly WorkflowConversationMessage[]>;
}) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const headlessPrompts: string[] = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext['setUiFeedback']>[0]> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const ctx: WorkflowContext = {
    worktreePath: '/workspace',
    spawnAgentSession: async (spawnInput) => {
      spawned.push(spawnInput);
      const isReviewer = spawnInput.modifiers?.[0]?.kind === 'command';
      return {
        agentSessionId: isReviewer ? 11 : 12,
        paneId: isReviewer ? 21 : 22,
        sentAt: '2026-07-14T00:00:00.000Z',
      };
    },
    sendAgentPrompt: async (sendInput) => {
      sent.push(sendInput);
      return {
        agentSessionId: sendInput.agentSessionId,
        sentAt: '2026-07-14T00:00:00.000Z',
      };
    },
    closePane: async (paneId) => {
      closedPanes.push(paneId);
    },
    getConversationHistory: async (agentSessionId) => input?.histories?.[agentSessionId] ?? [],
    runHeadlessAgent: async (headlessInput) => {
      headlessPrompts.push(headlessInput.prompt ?? '');
      return {
        opId: 'route-1',
        launch: {
          prompt: headlessInput.prompt ?? '',
          harness: headlessInput.harness,
          model: headlessInput.model,
          effort: headlessInput.effort,
          timeoutMs: headlessInput.timeoutMs ?? 900_000,
        },
      };
    },
    startWorkflow: async () => unexpected('startWorkflow'),
    log: async (level, messageText) => {
      logs.push({ level, message: messageText });
    },
    setUiFeedback: async (value) => {
      feedback.push(value);
    },
  };
  return { ctx, spawned, sent, headlessPrompts, closedPanes, feedback, logs };
}

function state(stage: State['stage']): State {
  return { stateVersion: 1, context: 'Review scope and goal.', stage };
}

function agent(agentSessionId: number, paneId: number) {
  return { agentSessionId, paneId };
}

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

function endedTurn() {
  return { outcome: 'ended', recordedAt: '2026-07-14T00:00:00.000Z' };
}

function headlessResult(output: string) {
  return {
    kind: 'headless_agent',
    results: [{ opId: 'route-1', status: 'completed', output }],
  };
}

function suspendedState(result: WorkflowResult): State {
  assert.equal(result.type, 'suspend');
  return (result as Extract<WorkflowResult, { readonly type: 'suspend' }>).state as State;
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
