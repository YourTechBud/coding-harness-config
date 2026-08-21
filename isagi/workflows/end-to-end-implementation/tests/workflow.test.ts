import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowContext, WorkflowLaunchContext, WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';

type State = Parameters<typeof workflow.step>[1];
type Stage = State['stage'];

const launchCtx: WorkflowLaunchContext = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const story = 'https://github.com/owner/repository/issues/123';
const designPaths = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
};
const reviewDirectory = 'scratch/story/walkthrough';
const reviewPaths = {
  currentStatePath: `${reviewDirectory}/current-state.html`,
  architecturePath: `${reviewDirectory}/architecture.html`,
  programDesignPath: `${reviewDirectory}/program-design.html`,
};
const plan = {
  planDirectory: 'scratch/story/implementation',
  entryPlanPath: 'scratch/story/implementation/index.md',
};
const implementationOptions = {
  humanInTheLoop: 'no',
  autoReview: 'yes',
  autoCommit: 'yes',
};

test('command accepts only the story', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, 'End-to-End Implementation');
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), ['story']);
});

test('initial state captures the story and starts design', async () => {
  assert.deepEqual(await workflow.init(launchCtx, { story: `  ${story}  ` }), {
    stateVersion: 1,
    story,
    stage: { kind: 'start_design' },
  });
});

test('starts Design Story with the complete scratch/story design convention', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(harness.ctx, await state({ kind: 'start_design' }), null);
  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.started[0], {
    workflowKey: 'design-story',
    variables: { story, ...designPaths },
    context: undefined,
  });
});

test('runs walkthrough and implementation in order with explicit pack paths', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = walkthroughResult();

  let result = await workflow.step(harness.ctx, await state({ kind: 'await_design', runId: 101 }), childEvent(101, design));
  assert.deepEqual(resultState(result).stage, { kind: 'start_walkthrough', design });

  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.deepEqual(harness.started.at(-1), {
    workflowKey: 'solution-walkthrough-story',
    variables: { story, ...designPaths, reviewDirectory },
    context: undefined,
  });

  result = await workflow.step(harness.ctx, resultState(result, { kind: 'await_walkthrough', design, runId: 101 }), childEvent(101, walkthrough));
  assert.deepEqual(resultState(result).stage, { kind: 'start_implementation', design, walkthrough });

  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.deepEqual(harness.started.at(-1), {
    workflowKey: 'implement-story',
    variables: { story, ...designPaths, ...plan, ...implementationOptions },
    context: undefined,
  });
});

test('returns all child results and the open planner identifiers', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = walkthroughResult();
  const implementation = implementationResult();
  const result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_implementation', design, walkthrough, runId: 101 }),
    childEvent(101, implementation),
  );
  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'end-to-end-implementation-completed',
    story,
    storyRoot: 'scratch/story',
    design,
    walkthrough,
    implementation,
  });
  assert.deepEqual(harness.closed, []);
});

test('a failed or malformed child stops the wrapper with diagnostics', async () => {
  const failedHarness = workflowHarness();
  const failed = await workflow.step(
    failedHarness.ctx,
    await state({ kind: 'await_design', runId: 101 }),
    { kind: 'workflow', results: [{ runId: 101, status: 'failed', error: 'designer failed' }] },
  );
  assert.equal(failed.type, 'fail');
  assert.match(failedHarness.logs.at(-1)?.message ?? '', /designer failed/);

  const malformedHarness = workflowHarness();
  const malformed = await workflow.step(
    malformedHarness.ctx,
    await state({ kind: 'await_design', runId: 101 }),
    childEvent(101, { ...designResult(), artifacts: { ...designPaths, architecturePath: 'wrong.md' } }),
  );
  assert.equal(malformed.type, 'fail');
  assert.match(malformedHarness.logs.at(-1)?.message ?? '', /unexpected artifact paths/);
});

async function state(stage: Stage): Promise<State> {
  return { ...await workflow.init(launchCtx, { story }), stage } satisfies State;
}

function resultState(result: WorkflowResult, stage?: Stage): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  const value = result.state as State;
  return stage ? { ...value, stage } : value;
}

function designResult() {
  return {
    outcome: 'story-designed' as const,
    story,
    artifacts: designPaths,
    reviewCounts: { currentState: 1, architecture: 2, programDesign: 1 },
  };
}

function walkthroughResult() {
  return {
    outcome: 'story-walkthrough-completed' as const,
    reviewDirectory,
    manifestPath: `${reviewDirectory}/.walkthrough/manifest.json`,
    completedTopicCount: 9,
    artifacts: reviewPaths,
  };
}

function implementationResult() {
  return {
    outcome: 'story-implemented',
    story,
    artifacts: designPaths,
    plan,
    plannerAgentSessionId: 55,
    plannerPaneId: 66,
    implementation: {
      entryPlanPath: plan.entryPlanPath,
      decisionLogPath: `${plan.planDirectory}/decisions.md`,
      phaseCount: 3,
      completedPhaseCount: 3,
    },
  };
}

function childEvent(runId: number, result: unknown) {
  return { kind: 'workflow', results: [{ runId, status: 'done', result }] };
}

function workflowHarness() {
  const started: Array<{ readonly workflowKey: string; readonly variables: Record<string, unknown> | undefined; readonly context: unknown }> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const closed: number[] = [];
  const ctx = {
    worktreePath: '/workspace',
    startWorkflow: async (workflowKey: string, variables?: Record<string, unknown>, context?: unknown) => {
      started.push({ workflowKey, variables, context });
      return 101;
    },
    closePane: async (paneId: number) => { closed.push(paneId); },
    setUiFeedback: async () => undefined,
    log: async (level: string, message: string) => { logs.push({ level, message }); },
  } as unknown as WorkflowContext;
  return { ctx, started, logs, closed };
}
