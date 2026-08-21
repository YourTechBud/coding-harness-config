import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowContext, WorkflowLaunchContext, WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';

type State = Parameters<typeof workflow.step>[1];
type Stage = State['stage'];

const launchCtx: WorkflowLaunchContext = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const story = 'https://github.com/owner/repository/issues/123';
const defaults = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
};

test('command exposes deterministic default artifact paths', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, 'Design Story');
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), ['story', 'currentStatePath', 'architecturePath', 'programDesignPath']);
  assert.deepEqual((manifest.inputs ?? []).slice(1).map((input) => 'default' in input ? input.default : undefined), Object.values(defaults));
});

test('initial state uses defaults and starts current-state analysis', async () => {
  assert.deepEqual(await workflow.init(launchCtx, { story }), {
    stateVersion: 1,
    story,
    artifacts: defaults,
    stage: { kind: 'start_current_state' },
  });
});

test('custom artifact paths remain independent inputs', async () => {
  const artifacts = { currentStatePath: 'a.md', architecturePath: 'b.md', programDesignPath: 'c.md' };
  assert.deepEqual((await workflow.init(launchCtx, { story, ...artifacts })).artifacts, artifacts);
});

test('runs the three design children in dependency order', async () => {
  const harness = workflowHarness();
  let result = await workflow.step(harness.ctx, await state({ kind: 'start_current_state' }), null);
  assert.deepEqual(harness.started.at(-1), { workflowKey: 'analyze-current-state', variables: { story, artifactPath: defaults.currentStatePath }, context: undefined });
  result = await workflow.step(harness.ctx, resultState(result, { kind: 'await_current_state', runId: 101 }), artifactEvent(101, defaults.currentStatePath, 1));
  assert.deepEqual(resultState(result).stage, { kind: 'start_architecture', reviewCounts: { currentState: 1 } });

  result = await workflow.step(harness.ctx, resultState(result, { kind: 'start_architecture', reviewCounts: { currentState: 1 } }), null);
  assert.deepEqual(harness.started.at(-1), { workflowKey: 'design-architecture', variables: { story, currentStatePath: defaults.currentStatePath, artifactPath: defaults.architecturePath }, context: undefined });
  result = await workflow.step(harness.ctx, resultState(result, { kind: 'await_architecture', reviewCounts: { currentState: 1 }, runId: 102 }), artifactEvent(102, defaults.architecturePath, 2));
  assert.deepEqual(resultState(result).stage, { kind: 'start_program_design', reviewCounts: { currentState: 1, architecture: 2 } });

  result = await workflow.step(harness.ctx, resultState(result, { kind: 'start_program_design', reviewCounts: { currentState: 1, architecture: 2 } }), null);
  assert.deepEqual(harness.started.at(-1), { workflowKey: 'design-program', variables: { story, currentStatePath: defaults.currentStatePath, architecturePath: defaults.architecturePath, artifactPath: defaults.programDesignPath }, context: undefined });
  result = await workflow.step(harness.ctx, resultState(result, { kind: 'await_program_design', reviewCounts: { currentState: 1, architecture: 2 }, runId: 103 }), artifactEvent(103, defaults.programDesignPath, 3));
  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'story-designed',
    story,
    artifacts: defaults,
    reviewCounts: { currentState: 1, architecture: 2, programDesign: 3 },
  });
});

test('a mismatched artifact path fails the workflow', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(harness.ctx, await state({ kind: 'await_current_state', runId: 101 }), artifactEvent(101, 'wrong.md', 1));
  assert.equal(result.type, 'fail');
  assert.match(harness.logs.at(-1)?.message ?? '', /wrong\.md/);
});

async function state(stage: Stage): Promise<State> {
  return { ...await workflow.init(launchCtx, { story }), stage } satisfies State;
}

function artifactEvent(runId: number, artifactPath: string, reviewCount: number) {
  return { kind: 'workflow', results: [{ runId, status: 'done', result: { outcome: 'artifact-reviewed', artifactPath, reviewCount } }] };
}

function resultState(result: WorkflowResult, stage?: Stage): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  const state = result.state as State;
  return stage ? { ...state, stage } : state;
}

function workflowHarness() {
  const started: Array<{ readonly workflowKey: string; readonly variables: Record<string, unknown> | undefined; readonly context: unknown }> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  let nextRunId = 101;
  const ctx = {
    worktreePath: '/workspace',
    startWorkflow: async (workflowKey: string, variables?: Record<string, unknown>, context?: unknown) => {
      started.push({ workflowKey, variables, context });
      return nextRunId++;
    },
    setUiFeedback: async () => undefined,
    log: async (level: string, message: string) => { logs.push({ level, message }); },
  } as unknown as WorkflowContext;
  return { ctx, started, logs };
}
