import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  WorkflowContext,
  WorkflowConversationMessage,
  WorkflowLaunchContext,
  WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { reviewer, reviewerJudgment, writer, writerJudgment } from '../src/constants.js';
import workflow from '../src/index.js';
import {
  initialReviewerPrompt,
  initialWriterPrompt,
  PROMPT_FOOTER,
  retryWriterPrompt,
} from '../src/prompts.js';

type State = Parameters<typeof workflow.step>[1];

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command captures the story, current-state path, architecture path, and repository path', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    ['story', 'currentStatePath', 'artifactPath'],
  );

  const variables = {
    story: 'https://github.com/owner/repo/issues/2',
    currentStatePath: 'scratch/current-state/issue-2.md',
    artifactPath: 'scratch/architecture/issue-2.md',
  };
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), {
    stateVersion: 1,
    repositoryPath: '/workspace',
    ...variables,
    stage: { kind: 'spawn_writer' },
  });
  await assert.rejects(async () => {
    await workflow.validate(launchCtx, { ...variables, currentStatePath: '   ' });
  });
});

test('spawns the configured Fable writer with the architecture skill and required footer', async () => {
  const harness = workflowHarness();
  const current = baseState({ kind: 'spawn_writer' });
  const result = await workflow.step(harness.ctx, current, null);

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.spawned[0], {
    ...writer,
    modifiers: [{ kind: 'skill', name: 'design-architecture' }],
    prompt: initialWriterPrompt(current),
  });
  assert.match(harness.spawned[0]?.prompt ?? '', /Current-state analysis: scratch\/current-state/);
  assert.match(harness.spawned[0]?.prompt ?? '', /correct that predecessor artifact/);
  assert.equal(harness.spawned[0]?.prompt?.endsWith(PROMPT_FOOTER), true);
});

test('judges every writer turn and fails when the initial architecture is incomplete', async () => {
  const harness = workflowHarness({
    histories: { 11: [message('assistant', 'I still need to settle state ownership.')] },
  });
  const judgmentWait = await workflow.step(
    harness.ctx,
    baseState({ kind: 'await_initial_writer', writer: agent(11, 21) }),
    endedTurn(),
  );

  assert.equal(judgmentWait.type, 'suspend');
  assert.deepEqual(harness.headless[0]?.profile, writerJudgment);
  const failed = await workflow.step(
    harness.ctx,
    suspendedState(judgmentWait),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(failed.type, 'fail');
  assert.equal(harness.sent.length, 0);
  assert.equal(harness.feedback.at(-1)?.kind, 'error');
  assert.match(harness.feedback.at(-1)?.message ?? '', /did not produce a reviewable architecture/);
  assert.match(harness.logs.at(-1)?.message ?? '', /settle state ownership/);
});

test('a failed revision judgment stops instead of prompting the writer again', async () => {
  const harness = workflowHarness();
  const failed = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_revision_judgment',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      writerResponse: 'I need another turn to finish the requested changes.',
      reviewRound: 2,
      mode: 'normal',
    }),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(failed.type, 'fail');
  assert.equal(harness.sent.length, 0);
  assert.match(harness.logs.at(-1)?.message ?? '', /need another turn/);
});

test('a ready writer starts the independently configured architecture reviewer', async () => {
  const harness = workflowHarness();
  const current = baseState({
    kind: 'await_initial_writer_judgment',
    writer: agent(11, 21),
    writerResponse: 'Architecture complete.',
    mode: 'normal',
  });
  const result = await workflow.step(
    harness.ctx,
    current,
    headlessResult('{"outcome":"ready"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.spawned[0], {
    ...reviewer,
    modifiers: [{ kind: 'skill', name: 'design-architecture' }],
    prompt: initialReviewerPrompt(current),
  });
  const prompt = harness.spawned[0]?.prompt ?? '';
  assert.match(prompt, /Current-state analysis: scratch\/current-state/);
  assert.match(prompt, /\*\*Contradictions:\*\*/);
  assert.match(prompt, /\*\*Important Simplifications:\*\*/);
  assert.match(prompt, /\*\*Missing Architectural Decisions:\*\*/);
  assert.match(prompt, /\*\*Other Significant Issues:\*\*/);
  assert.match(prompt, /\*\*Blocker:\*\*/);
  assert.match(prompt, /\*\*Concern:\*\*/);
  assert.match(prompt, /\*\*Optional:\*\*/);
  assert.match(prompt, /Do not treat absent exact API signatures or routes/);
  assert.match(prompt, /repeatedly disagreed/);
  assert.equal(prompt.endsWith(PROMPT_FOOTER), true);
});

test('retry judges a newer complete writer turn without sending another prompt', async () => {
  const harness = workflowHarness({
    invocationKind: 'retry',
    histories: { 11: [message('assistant', 'Architecture is complete and verified.')] },
  });
  const result = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_initial_writer_judgment',
      writer: agent(11, 21),
      writerResponse: 'I will inspect the repository next.',
      mode: 'normal',
    }),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(harness.sent.length, 0);
  assert.match(harness.headless[0]?.prompt ?? '', /Architecture is complete and verified/);
  const recovered = suspendedState(result);
  assert.equal(
    recovered.stage.kind === 'await_initial_writer_judgment' ? recovered.stage.mode : undefined,
    'retry_recheck',
  );
});

test('retry sends one continuation when the writer history has not advanced', async () => {
  const response = 'I will inspect the repository next.';
  const harness = workflowHarness({
    invocationKind: 'retry',
    histories: { 11: [message('assistant', response)] },
  });
  const result = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_initial_writer_judgment',
      writer: agent(11, 21),
      writerResponse: response,
      mode: 'normal',
    }),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(result.type, 'suspend');
  assert.equal(harness.headless.length, 0);
  assert.deepEqual(harness.sent[0], {
    agentSessionId: 11,
    prompt: retryWriterPrompt(),
  });
  assert.equal(suspendedState(result).stage.kind, 'await_initial_writer');
});

test('a failed retry recheck sends one continuation and a second failure remains terminal', async () => {
  const histories: Record<number, readonly WorkflowConversationMessage[]> = {
    11: [message('assistant', 'Architecture is now complete.')],
  };
  const harness = workflowHarness({ invocationKind: 'retry', histories });
  const recheck = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_revision_judgment',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      writerResponse: 'I will verify the artifact next.',
      reviewRound: 2,
      mode: 'normal',
    }),
    headlessResult('{"outcome":"failed"}'),
  );
  harness.setInvocationKind('normal');
  const continuation = await workflow.step(
    harness.ctx,
    suspendedState(recheck),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(continuation.type, 'suspend');
  assert.equal(harness.sent.length, 1);
  assert.equal(suspendedState(continuation).stage.kind, 'await_revision');

  histories[11] = [message('assistant', 'I still need another turn.')];
  const judgedContinuation = await workflow.step(
    harness.ctx,
    suspendedState(continuation),
    endedTurn(),
  );
  const terminal = await workflow.step(
    harness.ctx,
    suspendedState(judgedContinuation),
    headlessResult('{"outcome":"failed"}'),
  );
  assert.equal(terminal.type, 'fail');
  assert.equal(harness.sent.length, 1);
});

test('review findings are judged and sent to the persistent writer', async () => {
  const review = 'State authority is unresolved.\n\n## Human Escalation\n\nNo escalation.';
  const harness = workflowHarness({ histories: { 12: [message('assistant', review)] } });
  const judgmentWait = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_review',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      reviewRound: 1,
    }),
    endedTurn(),
  );

  assert.equal(judgmentWait.type, 'suspend');
  assert.deepEqual(harness.headless[0]?.profile, reviewerJudgment);
  const revisionWait = await workflow.step(
    harness.ctx,
    suspendedState(judgmentWait),
    headlessResult('{"outcome":"revise"}'),
  );

  assert.equal(revisionWait.type, 'suspend');
  assert.equal(harness.sent[0]?.agentSessionId, 11);
  assert.match(harness.sent[0]?.prompt ?? '', /State authority is unresolved/);
  assert.match(harness.sent[0]?.prompt ?? '', /Correct the current-state artifact only/);
  assert.equal(harness.sent[0]?.prompt?.endsWith(PROMPT_FOOTER), true);
});

test('a completed revision is judged before its response goes to the reviewer', async () => {
  const writerResponse = 'Clarified state authority and retained one evidence-backed pushback.';
  const harness = workflowHarness({
    histories: { 11: [message('assistant', writerResponse)] },
  });
  const judgmentWait = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_revision',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      reviewRound: 1,
    }),
    endedTurn(),
  );
  const reviewWait = await workflow.step(
    harness.ctx,
    suspendedState(judgmentWait),
    headlessResult('{"outcome":"ready"}'),
  );

  assert.equal(reviewWait.type, 'suspend');
  assert.equal(harness.sent[0]?.agentSessionId, 12);
  const prompt = harness.sent[0]?.prompt ?? '';
  assert.match(prompt, /retained one evidence-backed pushback/);
  assert.match(prompt, /\*\*Contradictions:\*\*/);
  assert.match(prompt, /\*\*Important Simplifications:\*\*/);
  assert.match(prompt, /\*\*Missing Architectural Decisions:\*\*/);
  assert.match(prompt, /\*\*Other Significant Issues:\*\*/);
  assert.match(prompt, /Do not treat absent exact API signatures or routes/);
  assert.match(prompt, /repeatedly disagreed/);
  assert.equal(prompt.endsWith(PROMPT_FOOTER), true);
  const reviewState = suspendedState(reviewWait);
  assert.equal(reviewState.stage.kind, 'await_review');
  assert.equal(
    reviewState.stage.kind === 'await_review' ? reviewState.stage.reviewRound : undefined,
    2,
  );
});

test('explicit reviewer escalation pauses for a human and rejudges the latest reviewer turn', async () => {
  const escalation =
    '## Human Escalation\n\nEscalation required: choose which subsystem owns recovery state.';
  const histories: Record<number, readonly WorkflowConversationMessage[]> = {
    12: [message('assistant', escalation)],
  };
  const harness = workflowHarness({ histories });
  const paused = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_reviewer_judgment',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      review: escalation,
      reviewRound: 2,
    }),
    headlessResult('{"outcome":"human-decision"}'),
  );

  assert.equal(paused.type, 'suspend');
  assert.deepEqual(paused.type === 'suspend' ? paused.condition : undefined, {
    kind: 'user_continue',
  });
  assert.match(harness.feedback.at(-1)?.message ?? '', /Resolve it with the reviewer/);

  histories[12] = [
    message('assistant', escalation),
    message('user', 'The coordinator owns recovery state.'),
    message(
      'assistant',
      'Decision incorporated. No material correction remains.\n\n## Human Escalation\n\nNo escalation.\n\nNo re-review needed.',
    ),
  ];
  const rejudged = await workflow.step(harness.ctx, suspendedState(paused), {
    kind: 'user_continue',
  });

  assert.equal(rejudged.type, 'suspend');
  assert.deepEqual(harness.headless.at(-1)?.profile, reviewerJudgment);
  assert.match(harness.headless.at(-1)?.prompt ?? '', /Decision incorporated/);
});

test('review completion closes both workflow-created panes and returns the architecture path', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    baseState({
      kind: 'await_reviewer_judgment',
      writer: agent(11, 21),
      reviewer: agent(12, 22),
      review: 'No re-review needed.',
      reviewRound: 3,
    }),
    headlessResult('{"outcome":"complete"}'),
  );

  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'artifact-reviewed',
    artifactPath: 'scratch/architecture/issue-2.md',
    reviewCount: 3,
  });
  assert.deepEqual(harness.closedPanes, [21, 22]);
});

test('a failed agent turn fails with visible feedback and diagnostics', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    baseState({ kind: 'await_initial_writer', writer: agent(11, 21) }),
    {
      outcome: 'failed',
      recordedAt: '2026-08-15T00:00:00.000Z',
      reason: 'provider exited',
    },
  );

  assert.equal(result.type, 'fail');
  assert.match(result.type === 'fail' ? result.reason : '', /provider exited/);
  assert.equal(harness.feedback.at(-1)?.kind, 'error');
  assert.match(harness.logs.at(-1)?.message ?? '', /provider exited/);
});

function workflowHarness(input?: {
  readonly histories?: Record<number, readonly WorkflowConversationMessage[]>;
  readonly invocationKind?: 'normal' | 'retry';
}) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const headless: Array<{
    readonly profile: {
      readonly harness: string;
      readonly model?: string | undefined;
      readonly effort?: string | undefined;
    };
    readonly prompt: string;
  }> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext['setUiFeedback']>[0]> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  let nextAgentId = 11;
  let invocationKind = input?.invocationKind ?? 'normal';

  const ctx = {
    worktreePath: '/workspace',
    get invocation() {
      return { kind: invocationKind } as const;
    },
    spawnAgentSession: async (spawnInput) => {
      spawned.push(spawnInput);
      const agentSessionId = nextAgentId;
      nextAgentId += 1;
      return {
        agentSessionId,
        paneId: agentSessionId + 10,
        sentAt: '2026-08-15T00:00:00.000Z',
      };
    },
    sendAgentPrompt: async (sendInput) => {
      sent.push(sendInput);
      return {
        agentSessionId: sendInput.agentSessionId,
        sentAt: '2026-08-15T00:00:00.000Z',
      };
    },
    closePane: async (paneId) => {
      closedPanes.push(paneId);
    },
    getConversationHistory: async (agentSessionId) =>
      input?.histories?.[agentSessionId] ?? [],
    runHeadlessAgent: async (headlessInput) => {
      headless.push({
        profile: {
          harness: headlessInput.harness,
          model: headlessInput.model,
          effort: headlessInput.effort,
        },
        prompt: headlessInput.prompt ?? '',
      });
      return {
        opId: `judge-${headless.length}`,
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
  } as WorkflowContext & { readonly invocation: { readonly kind: 'normal' | 'retry' } };

  return {
    ctx,
    spawned,
    sent,
    headless,
    closedPanes,
    feedback,
    logs,
    setInvocationKind: (kind: 'normal' | 'retry') => {
      invocationKind = kind;
    },
  };
}

function baseState(stage: State['stage']): State {
  return {
    stateVersion: 1,
    repositoryPath: '/workspace',
    story: 'https://github.com/owner/repo/issues/2',
    currentStatePath: 'scratch/current-state/issue-2.md',
    artifactPath: 'scratch/architecture/issue-2.md',
    stage,
  };
}

function agent(agentSessionId: number, paneId: number) {
  return { agentSessionId, paneId };
}

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

function endedTurn() {
  return { outcome: 'ended', recordedAt: '2026-08-15T00:00:00.000Z' };
}

function headlessResult(output: string) {
  return {
    kind: 'headless_agent',
    results: [{ opId: 'judge-1', status: 'completed', output }],
  };
}

function suspendedState(result: WorkflowResult): State {
  assert.equal(result.type, 'suspend');
  return (result as Extract<WorkflowResult, { readonly type: 'suspend' }>).state as State;
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
