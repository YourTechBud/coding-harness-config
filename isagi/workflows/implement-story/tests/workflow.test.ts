import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowContext, WorkflowLaunchContext, WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import { planner, plannerJudgment } from '../src/constants.js';
import workflow from '../src/index.js';

type State = Parameters<typeof workflow.step>[1];
type Stage = State['stage'];

const story = 'https://github.com/owner/repository/issues/123';
const artifacts = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
  uiBriefPath: 'scratch/story/design/ui-brief.md',
};
const plan = {
  planDirectory: 'scratch/story/implementation',
  entryPlanPath: 'scratch/story/implementation/index.md',
};
const plannerAgent = { agentSessionId: 55, paneId: 66 };

test('command exposes design inputs, plan paths, and implementation choices', async () => {
  const manifest = await workflow.command(launchContext('/workspace'));
  assert.equal(manifest.title, 'Implement Story');
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), [
    'story',
    'currentStatePath',
    'architecturePath',
    'programDesignPath',
    'uiBriefPath',
    'planDirectory',
    'entryPlanPath',
    'humanInTheLoop',
    'autoReview',
    'autoCommit',
  ]);
});

test('initial state uses the singular story pack and starts the planner', async () => {
  assert.deepEqual(await workflow.init(launchContext('/workspace'), { story }), {
    stateVersion: 1,
    repositoryPath: '/workspace',
    story,
    artifacts,
    plan,
    options: { humanInTheLoop: 'yes', autoReview: 'yes', autoCommit: 'yes' },
    stage: { kind: 'spawn_planner' },
  });
});

test('spawns the existing planner prompt with every explicit artifact path', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, await state('/workspace', { kind: 'spawn_planner' }), null);
  assert.equal(result.type, 'suspend');
  assert.equal(harness.spawned.length, 1);
  assert.deepEqual({ harness: harness.spawned[0]?.harness, model: harness.spawned[0]?.model, effort: harness.spawned[0]?.effort }, planner);
  assert.deepEqual(harness.spawned[0]?.modifiers, [{ kind: 'skill', name: 'create-implementation-plan' }]);
  const prompt = String(harness.spawned[0]?.prompt);
  assert.match(prompt, /omit mock-UI phases and repository documentation work/);
  assert.match(prompt, /Write index.md last/);
  assert.match(prompt, /stop for human reconciliation/);
  assert.match(prompt, /removal or replacement with production implementation/);
  for (const path of [...Object.values(artifacts), plan.planDirectory, plan.entryPlanPath]) assert.match(prompt, new RegExp(escapeRegex(path)));
  assert.deepEqual(result.type === 'suspend' ? result.condition : undefined, { kind: 'agent_turn', agentSessionId: 55, sentAt: '2026-08-20T00:00:00.000Z' });
});

test('routes a completed planner turn through the existing judgment when the index exists', async (t) => {
  const repositoryPath = temporaryRepository();
  t.after(() => rmSync(repositoryPath, { recursive: true, force: true }));
  writePlan(repositoryPath);
  const harness = workflowHarness(repositoryPath);
  harness.history.set(55, [message('user', 'Create the plan.'), message('assistant', `Created ${plan.entryPlanPath}.`)]);
  const result = await workflow.step(harness.ctx, await state(repositoryPath, { kind: 'await_planner', planner: plannerAgent }), agentEnded());
  assert.equal(result.type, 'suspend');
  assert.deepEqual({ harness: harness.headless[0]?.harness, model: harness.headless[0]?.model, effort: harness.headless[0]?.effort }, plannerJudgment);
  assert.match(String(harness.headless[0]?.prompt), /scratch\/story\/implementation\/index\.md/);
});

test('a valid plan immediately advances to phase-wise implementation', async () => {
  const repositoryPath = temporaryRepository();
  try {
    writePlan(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      await state(repositoryPath, { kind: 'await_planner_judgment', planner: plannerAgent, plannerResponse: 'Plan complete.' }),
      headlessEvent('ready'),
    );
    assert.equal(result.type, 'cont');
    assert.deepEqual(resultState(result).stage, { kind: 'start_implementation', planner: plannerAgent });
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('missing index pauses before judgment and Continue trusts a human-created index', async (t) => {
  const repositoryPath = temporaryRepository();
  t.after(() => rmSync(repositoryPath, { recursive: true, force: true }));
  const harness = workflowHarness(repositoryPath);
  let result = await workflow.step(harness.ctx, await state(repositoryPath, { kind: 'await_planner', planner: plannerAgent }), agentEnded());
  assert.equal(result.type, 'suspend');
  assert.equal(resultState(result).stage.kind, 'await_planner_reconciliation');
  assert.deepEqual(result.type === 'suspend' && result.condition, { kind: 'user_continue' });
  assert.equal(harness.headless.length, 0);
  result = await workflow.step(harness.ctx, resultState(result), { kind: 'user_continue' });
  assert.equal(resultState(result).stage.kind, 'await_planner_reconciliation');
  assert.match(harness.logs.at(-1)?.message ?? '', /still missing/);
  mkdirSync(join(repositoryPath, plan.planDirectory), { recursive: true });
  writeFileSync(join(repositoryPath, plan.entryPlanPath), '# Human reconciled plan');
  result = await workflow.step(harness.ctx, resultState(result), { kind: 'user_continue' });
  assert.equal(resultState(result).stage.kind, 'start_implementation');
  assert.equal(harness.headless.length, 0);
});

test('failed judgment pauses even when an index exists', async (t) => {
  const repositoryPath = temporaryRepository();
  t.after(() => rmSync(repositoryPath, { recursive: true, force: true }));
  writePlan(repositoryPath);
  const harness = workflowHarness(repositoryPath);
  const result = await workflow.step(harness.ctx, await state(repositoryPath, { kind: 'await_planner_judgment', planner: plannerAgent, plannerResponse: 'Concern remains.' }), headlessEvent('failed'));
  assert.equal(resultState(result).stage.kind, 'await_planner_reconciliation');
  assert.deepEqual(harness.closed, []);
});

test('ready judgment with missing artifacts pauses for reconciliation', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, await state('/workspace', { kind: 'await_planner_judgment', planner: plannerAgent, plannerResponse: 'Done.' }), headlessEvent('ready'));
  assert.equal(resultState(result).stage.kind, 'await_planner_reconciliation');
});

test('agent execution and malformed judgment failures remain workflow failures', async () => {
  const harness = workflowHarness('/workspace');
  const failed = await workflow.step(harness.ctx, await state('/workspace', { kind: 'await_planner', planner: plannerAgent }), { outcome: 'failed', reason: 'transport failed', recordedAt: 'now' });
  assert.equal(failed.type, 'fail');
  const malformed = await workflow.step(harness.ctx, await state('/workspace', { kind: 'await_planner_judgment', planner: plannerAgent, plannerResponse: 'Done.' }), { kind: 'headless_agent', results: [{ opId: 'op-1', status: 'completed', output: 'invalid' }] });
  assert.equal(malformed.type, 'fail');
});

test('starts phase-wise implementation with the planner session', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, await state('/workspace', { kind: 'start_implementation', planner: plannerAgent }), null);
  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.started[0], {
    workflowKey: 'implement-phase-wise-plan',
    variables: { humanInTheLoop: 'yes', autoReview: 'yes', autoCommit: 'yes' },
    context: { agentSessionId: plannerAgent.agentSessionId },
  });
});

test('completion preserves the planner pane and returns it to the user', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    await state('/workspace', { kind: 'await_implementation', planner: plannerAgent, runId: 101 }),
    implementedPlanEvent(101),
  );
  assert.equal(result.type, 'done');
  assert.deepEqual(harness.closed, []);
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'story-implemented',
    story,
    artifacts,
    plan,
    plannerAgentSessionId: 55,
    plannerPaneId: 66,
    implementation: {
      entryPlanPath: plan.entryPlanPath,
      decisionLogPath: 'scratch/story/implementation/decisions.md',
      phaseCount: 2,
      completedPhaseCount: 2,
    },
  });
});

test('a failed implementation leaves the planner open for diagnosis', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    await state('/workspace', { kind: 'await_implementation', planner: plannerAgent, runId: 101 }),
    { kind: 'workflow', results: [{ runId: 101, status: 'failed', error: 'phase failed' }] },
  );
  assert.equal(result.type, 'fail');
  assert.deepEqual(harness.closed, []);
  assert.match(harness.logs.at(-1)?.message ?? '', /phase failed/);
});

function launchContext(worktreePath: string): WorkflowLaunchContext {
  return { worktreeId: 1, worktreePath, surfaceId: 7 };
}

async function state(worktreePath: string, stage: Stage): Promise<State> {
  return { ...await workflow.init(launchContext(worktreePath), { story }), stage } satisfies State;
}

function resultState(result: WorkflowResult): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  return result.state as State;
}

function headlessEvent(outcome: 'ready' | 'failed') {
  return { kind: 'headless_agent', results: [{ opId: 'op-1', status: 'completed', output: JSON.stringify({ outcome }) }] };
}

function implementedPlanEvent(runId: number) {
  return {
    kind: 'workflow',
    results: [{
      runId,
      status: 'done',
      result: {
        entryPlanPath: plan.entryPlanPath,
        decisionLogPath: 'scratch/story/implementation/decisions.md',
        phases: [{ number: 1 }, { number: 2 }],
        completedPhaseCount: 2,
      },
    }],
  };
}

function temporaryRepository(): string {
  return mkdtempSync(join(tmpdir(), 'implement-story-'));
}

function writePlan(repositoryPath: string): void {
  const directory = join(repositoryPath, plan.planDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(repositoryPath, plan.entryPlanPath), '# Plan\n');
  writeFileSync(join(directory, 'phase-01-example.md'), '# Phase\n');
}

function message(role: 'user' | 'assistant', text: string) {
  return { role, parts: [{ type: 'text' as const, text, state: 'done' as const }] };
}

function agentEnded() {
  return { outcome: 'ended', recordedAt: '2026-08-20T00:00:00.000Z' };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function workflowHarness(worktreePath: string) {
  const spawned: Array<Record<string, unknown>> = [];
  const headless: Array<Record<string, unknown>> = [];
  const started: Array<{ readonly workflowKey: string; readonly variables: Record<string, unknown> | undefined; readonly context: unknown }> = [];
  const closed: number[] = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const history = new Map<number, ReturnType<typeof message>[]>();
  const ctx = {
    worktreePath,
    spawnAgentSession: async (input: Record<string, unknown>) => {
      spawned.push(input);
      return { agentSessionId: 55, paneId: 66, sentAt: '2026-08-20T00:00:00.000Z' };
    },
    getConversationHistory: async (agentSessionId: number) => history.get(agentSessionId) ?? [],
    runHeadlessAgent: async (input: Record<string, unknown>) => {
      headless.push(input);
      return { opId: 'op-1', launch: { ...input, harness: String(input.harness), timeoutMs: 180000 } };
    },
    startWorkflow: async (workflowKey: string, variables?: Record<string, unknown>, context?: unknown) => {
      started.push({ workflowKey, variables, context });
      return 101;
    },
    closePane: async (paneId: number) => { closed.push(paneId); },
    setUiFeedback: async () => undefined,
    log: async (level: string, message: string) => { logs.push({ level, message }); },
  } as unknown as WorkflowContext;
  return { ctx, spawned, headless, started, closed, logs, history };
}
