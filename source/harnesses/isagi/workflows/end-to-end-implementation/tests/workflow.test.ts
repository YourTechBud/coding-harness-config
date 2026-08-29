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
const plan = {
  planDirectory: 'scratch/story/implementation',
  entryPlanPath: 'scratch/story/implementation/index.md',
};
const implementationOptions = {
  humanInTheLoop: 'no',
  autoReview: 'yes',
  autoCommit: 'yes',
};

test('command captures the story, walkthrough controls, and pull-request choice', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, 'End-to-End Implementation');
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), [
    'story',
    'familiarity',
    'technicalDepth',
    'deliveryMechanism',
    'submitPullRequest',
  ]);
  assert.deepEqual((manifest.inputs ?? []).at(-2), {
    kind: 'select',
    key: 'deliveryMechanism',
    label: 'Walkthrough delivery mechanism?',
    options: [
      { value: 'presentation', label: 'Presentation' },
      { value: 'socratic-walkthrough', label: 'Socratic walkthrough' },
    ],
    default: 'presentation',
  });
  assert.deepEqual((manifest.inputs ?? []).at(-1), {
    kind: 'select',
    key: 'submitPullRequest',
    label: 'Submit pull request?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    default: 'yes',
  });
});

test('initial state captures normalized walkthrough controls and starts design', async () => {
  assert.deepEqual(await workflow.init(launchCtx, {
    story: `  ${story}  `,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'socratic-walkthrough',
    submitPullRequest: 'no',
  }), {
    stateVersion: 4,
    story,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'socratic-walkthrough',
    submitPullRequest: 'no',
    stage: { kind: 'start_design' },
  });
  await assert.rejects(async () => workflow.validate(launchCtx, { story, familiarity: 'expert' }));
  await assert.rejects(async () => workflow.validate(launchCtx, { story, technicalDepth: 'deep' }));
  await assert.rejects(async () => workflow.validate(launchCtx, { story, deliveryMechanism: 'guided' }));
  await assert.rejects(async () => workflow.validate(launchCtx, { story, submitPullRequest: 'later' }));
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
    variables: {
      story,
      ...designPaths,
      reviewDirectory,
      familiarity: 'new',
      technicalDepth: 'system-design',
      deliveryMechanism: 'presentation',
    },
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

test('guided walkthrough completion hands off to implementation', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const guided = guidedWalkthroughResult();
  const initial = await workflow.init(launchCtx, {
    story,
    familiarity: 'familiar',
    technicalDepth: 'product',
    deliveryMechanism: 'socratic-walkthrough',
  });
  let result = await workflow.step(harness.ctx, { ...initial, stage: { kind: 'start_walkthrough', design } }, null);
  assert.deepEqual(harness.started.at(-1), {
    workflowKey: 'solution-walkthrough-story',
    variables: {
      story,
      ...designPaths,
      reviewDirectory,
      familiarity: 'familiar',
      technicalDepth: 'product',
      deliveryMechanism: 'socratic-walkthrough',
    },
    context: undefined,
  });
  result = await workflow.step(harness.ctx, resultState(result), childEvent(101, guided));
  assert.deepEqual(resultState(result).stage, { kind: 'start_implementation', design, walkthrough: guided });
});

test('a version-one run can consume the walkthrough result it was launched against', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const legacy = legacyWalkthroughResult();
  const result = await workflow.step(harness.ctx, {
    stateVersion: 1,
    story,
    stage: { kind: 'await_walkthrough', design, runId: 101 },
  }, childEvent(101, legacy));
  assert.deepEqual(resultState(result).stage, { kind: 'start_implementation', design, walkthrough: legacy });
});

test('a version-two run keeps its boolean delivery choice when resumed', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const result = await workflow.step(harness.ctx, {
    stateVersion: 2,
    story,
    familiarity: 'familiar',
    technicalDepth: 'product',
    presentationMode: false,
    stage: { kind: 'start_walkthrough', design },
  }, null);
  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.started.at(-1)?.variables, {
    story,
    ...designPaths,
    reviewDirectory,
    familiarity: 'familiar',
    technicalDepth: 'product',
    deliveryMechanism: 'socratic-walkthrough',
  });
});

test('implementation completion launches Luna to submit the pull request against main', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = walkthroughResult();
  const implementation = implementationResult();
  let result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_implementation', design, walkthrough, runId: 101 }),
    childEvent(101, implementation),
  );
  assert.deepEqual(resultState(result).stage, { kind: 'start_pull_request', design, walkthrough, implementation });

  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.headless[0] && {
    harness: harness.headless[0].harness,
    model: harness.headless[0].model,
    effort: harness.headless[0].effort,
  }, { harness: 'codex', model: 'gpt-5.6-luna', effort: 'medium' });
  assert.match(harness.headless[0]?.prompt ?? '', /Target base branch: main/);
  assert.match(harness.headless[0]?.prompt ?? '', /Closes owner\/repository#123/);
  assert.match(harness.headless[0]?.prompt ?? '', /already has an open pull request/);

  const pullRequest = pullRequestResult();
  result = await workflow.step(harness.ctx, resultState(result), headlessEvent(JSON.stringify(pullRequest)));
  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'end-to-end-implementation-completed',
    story,
    storyRoot: 'scratch/story',
    design,
    walkthrough,
    implementation,
    pullRequest,
  });
  assert.deepEqual(harness.closed, []);
});

test('implementation completion skips pull-request submission when selected', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = walkthroughResult();
  const implementation = implementationResult();
  const initial = await workflow.init(launchCtx, { story, submitPullRequest: 'no' });
  const result = await workflow.step(
    harness.ctx,
    { ...initial, stage: { kind: 'await_implementation', design, walkthrough, runId: 101 } },
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
    pullRequest: null,
  });
  assert.deepEqual(harness.headless, []);
});

test('a version-three run retains the previous automatic PR-submission behavior', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = walkthroughResult();
  const implementation = implementationResult();
  const result = await workflow.step(harness.ctx, {
    stateVersion: 3,
    story,
    familiarity: 'new',
    technicalDepth: 'system-design',
    deliveryMechanism: 'presentation',
    stage: { kind: 'await_implementation', design, walkthrough, runId: 101 },
  }, childEvent(101, implementation));
  assert.deepEqual(resultState(result).stage, { kind: 'start_pull_request', design, walkthrough, implementation });
});

test('a failed or malformed pull-request operation stops with diagnostics', async () => {
  const design = designResult();
  const walkthrough = walkthroughResult();
  const implementation = implementationResult();
  const stage = { kind: 'await_pull_request', design, walkthrough, implementation, opId: 'pr-1' } as const;

  const failedHarness = workflowHarness();
  const failed = await workflow.step(failedHarness.ctx, await state(stage), {
    kind: 'headless_agent',
    results: [{ opId: 'pr-1', status: 'failed', error: 'authentication failed' }],
  });
  assert.equal(failed.type, 'fail');
  assert.match(failedHarness.logs.at(-1)?.message ?? '', /authentication failed/);

  const malformedHarness = workflowHarness();
  const malformed = await workflow.step(malformedHarness.ctx, await state(stage), headlessEvent(JSON.stringify({ ...pullRequestResult(), baseBranch: 'develop' })));
  assert.equal(malformed.type, 'fail');
  assert.match(malformedHarness.logs.at(-1)?.message ?? '', /target main/);
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
    outcome: 'presentation-review-completed' as const,
    curriculumPath: `${reviewDirectory}/.walkthrough/curriculum.json`,
    deckPlanPath: `${reviewDirectory}/.walkthrough/deck-plan.json`,
    presentationPath: `${reviewDirectory}/walkthrough.html`,
    chapterCount: 3,
    narrativeUnitCount: 9,
  };
}

function guidedWalkthroughResult() {
  return {
    outcome: 'guided-tutorial-completed' as const,
    curriculumPath: `${reviewDirectory}/.walkthrough/curriculum.json`,
    chapterCount: 3,
    beatCount: 9,
  };
}

function legacyWalkthroughResult() {
  return {
    outcome: 'story-walkthrough-completed' as const,
    reviewDirectory,
    manifestPath: `${reviewDirectory}/.walkthrough/manifest.json`,
    completedTopicCount: 9,
    artifacts: {
      currentStatePath: `${reviewDirectory}/current-state.html`,
      architecturePath: `${reviewDirectory}/architecture.html`,
      programDesignPath: `${reviewDirectory}/program-design.html`,
    },
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

function pullRequestResult() {
  return {
    outcome: 'pull-request-submitted' as const,
    number: 456,
    url: 'https://github.com/owner/repository/pull/456',
    title: 'Implement the story end to end',
    body: '## Summary\n\nImplements the designed story.\n\n## Testing\n\nAll phase checks passed.\n\nCloses owner/repository#123',
    baseBranch: 'main' as const,
    headBranch: 'story-123',
    state: 'OPEN' as const,
  };
}

function childEvent(runId: number, result: unknown) {
  return { kind: 'workflow', results: [{ runId, status: 'done', result }] };
}

function headlessEvent(output: string) {
  return { kind: 'headless_agent', results: [{ opId: 'pr-1', status: 'completed', output }] };
}

function workflowHarness() {
  const started: Array<{ readonly workflowKey: string; readonly variables: Record<string, unknown> | undefined; readonly context: unknown }> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const closed: number[] = [];
  const headless: Array<Parameters<WorkflowContext['runHeadlessAgent']>[0]> = [];
  const ctx = {
    worktreePath: '/workspace',
    startWorkflow: async (workflowKey: string, variables?: Record<string, unknown>, context?: unknown) => {
      started.push({ workflowKey, variables, context });
      return 101;
    },
    runHeadlessAgent: async (input: Parameters<WorkflowContext['runHeadlessAgent']>[0]) => {
      headless.push(input);
      return {
        opId: 'pr-1',
        launch: {
          prompt: input.prompt ?? '',
          harness: input.harness,
          model: input.model,
          effort: input.effort,
          timeoutMs: input.timeoutMs ?? 900_000,
        },
      };
    },
    closePane: async (paneId: number) => { closed.push(paneId); },
    setUiFeedback: async () => undefined,
    log: async (level: string, message: string) => { logs.push({ level, message }); },
  } as unknown as WorkflowContext;
  return { ctx, started, logs, closed, headless };
}
