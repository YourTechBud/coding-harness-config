import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test, { type TestContext } from 'node:test';

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
const uiBriefPath = 'scratch/story/design/ui-brief.md';
const session = { agentSessionId: 77, paneId: 88 };
const ended = { outcome: 'ended', recordedAt: '2026-08-20T00:00:00.000Z' };
const continued = { kind: 'user_continue' };
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

test('command and initial state capture the complete end-to-end controls', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), [
    'story',
    'familiarity',
    'technicalDepth',
    'deliveryMechanism',
    'submitPullRequest',
  ]);
  assert.deepEqual(await workflow.init(launchCtx, {
    story: `  ${story}  `,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'socratic-walkthrough',
    submitPullRequest: 'no',
  }), {
    stateVersion: 1,
    story,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'socratic-walkthrough',
    submitPullRequest: 'no',
    stage: { kind: 'start_current_state' },
  });
});

test('missing design artifacts run in order and preserve their reviewed results', async () => {
  const harness = workflowHarness();
  let result = await workflow.step(harness.ctx, await state({ kind: 'start_current_state' }), null);
  assert.equal(harness.started[0]?.workflowKey, 'analyze-current-state');

  result = await workflow.step(harness.ctx, resultState(result), childEvent(101, artifactResult(designPaths.currentStatePath, 1)));
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(harness.started.at(-1)?.workflowKey, 'design-architecture');

  result = await workflow.step(harness.ctx, resultState(result), childEvent(101, artifactResult(designPaths.architecturePath, 2)));
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(harness.started.at(-1)?.workflowKey, 'design-program');

  result = await workflow.step(harness.ctx, resultState(result), childEvent(101, artifactResult(designPaths.programDesignPath, 3)));
  assert.deepEqual(resultState(result).stage, {
    kind: 'start_walkthrough',
    design: {
      artifacts: designPaths,
      steps: {
        currentState: { outcome: 'created', reviewCount: 1 },
        architecture: { outcome: 'created', reviewCount: 2 },
        programDesign: { outcome: 'created', reviewCount: 3 },
      },
    },
  });
});

test('an existing walkthrough HTML skips the presentation child and waits for approval', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, `${reviewDirectory}/walkthrough.html`, '<html>completed presentation</html>');
  const harness = workflowHarness(worktreePath);
  const design = designResult();
  const result = await workflow.step(harness.ctx, await state({ kind: 'start_walkthrough', design }), null);
  assert.equal(result.type, 'suspend');
  assert.equal(result.type === 'suspend' ? result.condition.kind : null, 'user_input');
  assert.deepEqual(resultState(result).stage, {
    kind: 'await_implementation_approval',
    design,
    walkthrough: {
      outcome: 'presentation-reused',
      presentationPath: `${reviewDirectory}/walkthrough.html`,
    },
  });
  assert.equal(harness.started.length, 0);
});

test('Socratic mode does not treat an existing HTML presentation as its walkthrough', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, `${reviewDirectory}/walkthrough.html`, '<html>completed presentation</html>');
  const harness = workflowHarness(worktreePath);
  const initial = await workflow.init(launchCtx, { story, deliveryMechanism: 'socratic-walkthrough' });
  const result = await workflow.step(harness.ctx, { ...initial, stage: { kind: 'start_walkthrough', design: designResult() } }, null);
  assert.equal(result.type, 'suspend');
  assert.equal(resultState(result).stage.kind, 'await_walkthrough');
  assert.equal(harness.started[0]?.workflowKey, 'solution-walkthrough-story');
});

test('presentation completion waits for explicit approval and preserves all metrics', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = presentationResult();
  const result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_walkthrough', design, runId: 101 }),
    childEvent(101, walkthrough),
  );
  assert.equal(result.type, 'suspend');
  assert.equal(result.type === 'suspend' ? result.condition.kind : null, 'user_input');
  assert.deepEqual(resultState(result).stage, { kind: 'await_implementation_approval', design, walkthrough });
  assert.deepEqual(result.type === 'suspend' && result.condition.kind === 'user_input' ? result.condition.questions[0] : undefined, {
    kind: 'select',
    key: 'implementationDecision',
    label: 'Approve this solution and begin implementation?',
    options: [
      { value: 'approve', label: 'Approve and implement' },
      { value: 'reject', label: 'Reject and stop' },
    ],
  });
});

test('approval resets the implementation plan before UI discovery', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, plan.entryPlanPath, '# stale plan');
  const harness = workflowHarness(worktreePath);
  const design = designResult();
  const walkthrough = presentationResult();

  let result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_implementation_approval', design, walkthrough }),
    decisionEvent('approve'),
  );
  assert.deepEqual(resultState(result).stage, { kind: 'reset_implementation_plan', design, walkthrough });
  assert.equal(existsSync(resolve(worktreePath, plan.planDirectory)), true);

  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(existsSync(resolve(worktreePath, plan.planDirectory)), false);
  assert.deepEqual(resultState(result).stage, { kind: 'start_ui', design, walkthrough });
  assert.equal(harness.started.length, 0);
});

test('rejection stops cleanly before touching the implementation plan', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, plan.entryPlanPath, '# keep this plan');
  const harness = workflowHarness(worktreePath);
  const design = designResult();
  const walkthrough = presentationResult();
  const result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_implementation_approval', design, walkthrough }),
    decisionEvent('reject'),
  );
  assert.equal(result.type, 'done');
  assert.deepEqual(result.type === 'done' ? result.value : undefined, {
    outcome: 'end-to-end-implementation-stopped',
    reason: 'solution-rejected',
    story,
    storyRoot: 'scratch/story',
    design,
    walkthrough,
  });
  assert.equal(existsSync(resolve(worktreePath, plan.entryPlanPath)), true);
  assert.equal(harness.started.length, 0);
});

test('the canonical Socratic result also waits for approval', async () => {
  const initial = await workflow.init(launchCtx, { story, deliveryMechanism: 'socratic-walkthrough' });
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = socraticResult();
  const result = await workflow.step(
    harness.ctx,
    { ...initial, stage: { kind: 'await_walkthrough', design, runId: 101 } },
    childEvent(101, walkthrough),
  );
  assert.equal(result.type, 'suspend');
  assert.deepEqual(resultState(result).stage, { kind: 'await_implementation_approval', design, walkthrough });
});

test('obsolete walkthrough result shapes are rejected', async () => {
  const initial = await workflow.init(launchCtx, { story, deliveryMechanism: 'socratic-walkthrough' });
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    { ...initial, stage: { kind: 'await_walkthrough', design: designResult(), runId: 101 } },
    childEvent(101, {
      outcome: 'guided-tutorial-completed',
      curriculumPath: `${reviewDirectory}/.walkthrough/curriculum.json`,
      chapterCount: 3,
      beatCount: 9,
    }),
  );
  assert.equal(result.type, 'fail');
  assert.match(harness.logs.at(-1)?.message ?? '', /does not match Socratic mode/);
});

test('delivery can finish without pull-request submission after documentation', async () => {
  const harness = workflowHarness();
  const design = designResult();
  const walkthrough = presentationResult();
  const implementation = implementationResult();
  const initial = await workflow.init(launchCtx, { story, submitPullRequest: 'no' });
  const result = await workflow.step(
    harness.ctx,
    { ...initial, stage: { kind: 'finish_delivery', design, walkthrough, implementation } },
    null,
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
  assert.equal(harness.headless.length, 0);
});

test('failed child workflows stop the wrapper with their diagnostic', async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    await state({ kind: 'await_current_state', runId: 101 }),
    { kind: 'workflow', results: [{ runId: 101, status: 'failed', error: { reason: 'analyst failed' } }] },
  );
  assert.equal(result.type, 'fail');
  assert.match(harness.logs.at(-1)?.message ?? '', /analyst failed/);
});

test('UI always opens brainstorming, pauses, writes a brief in the same session, and skips a clean checkpoint', async (t) => {
  const worktreePath = tempWorktree(t);
  initGit(worktreePath);
  writeArtifact(worktreePath, '.git/info/exclude', 'scratch/\n');
  const harness = workflowHarness(worktreePath);
  const context = { design: designResult(), walkthrough: presentationResult() };
  let result = await workflow.step(harness.ctx, await state({ kind: 'start_ui', ...context }), null);
  assert.deepEqual(harness.spawned[0], {
    harness: 'claude', model: 'fable', effort: 'medium', modifiers: [{ kind: 'skill', name: 'brainstorming' }], prompt: harness.spawned[0]?.prompt,
  });
  assert.match(harness.spawned[0]?.prompt ?? '', /Let's brainstorm/);
  assert.match(harness.spawned[0]?.prompt ?? '', /opening turn focused on discovery/);
  result = await workflow.step(harness.ctx, resultState(result), ended);
  assert.equal(resultState(result).stage.kind, 'await_ui_continue');
  assert.deepEqual(result.type === 'suspend' && result.condition, { kind: 'user_continue' });
  assert.equal(harness.sent.length, 0);
  result = await workflow.step(harness.ctx, resultState(result), continued);
  assert.equal(harness.sent[0]?.agentSessionId, session.agentSessionId);
  assert.equal(harness.sent[0]?.modifiers, undefined);
  assert.match(harness.sent[0]?.prompt ?? '', /Capture decisions/);
  assert.match(harness.sent[0]?.prompt ?? '', /scratch\/story\/design\/ui-brief.md/);
  writeArtifact(worktreePath, uiBriefPath, 'No UI needed.');
  result = await workflow.step(harness.ctx, resultState(result), ended);
  assert.equal(resultState(result).stage.kind, 'commit_ui');
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(resultState(result).stage.kind, 'close_ui');
  assert.equal(harness.headless.length, 0);
  assert.deepEqual(harness.closed, []);
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.deepEqual(harness.closed, [session.paneId]);
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.deepEqual(harness.started.at(-1), {
    workflowKey: 'implement-story', variables: { story, ...designPaths, uiBriefPath, ...plan, ...implementationOptions }, context: undefined,
  });
});

test('missing UI brief or failed agent turns block without closing the pane', async (t) => {
  const harness = workflowHarness(tempWorktree(t));
  const context = { design: designResult(), walkthrough: presentationResult(), session };
  const missing = await workflow.step(harness.ctx, await state({ kind: 'await_ui_brief', ...context }), ended);
  assert.equal(missing.type, 'fail');
  assert.match(harness.logs.at(-1)?.message ?? '', /ui-brief.md/);
  for (const kind of ['await_ui_discovery', 'await_ui_brief', 'await_documentation_discovery'] as const) {
    const failed = await workflow.step(harness.ctx, await state({ kind, ...context, implementation: implementationResult() }), { outcome: 'failed', reason: 'agent failed', recordedAt: ended.recordedAt });
    assert.equal(failed.type, 'fail');
  }
  assert.deepEqual(harness.closed, []);
});

test('implementation always enters documentation discovery before the PR branch', async () => {
  for (const submitPullRequest of ['yes', 'no'] as const) {
    const harness = workflowHarness();
    const initial = await workflow.init(launchCtx, { story, submitPullRequest });
    const context = { design: designResult(), walkthrough: presentationResult() };
    let result = await workflow.step(harness.ctx, { ...initial, stage: { kind: 'await_implementation', ...context, runId: 101 } }, childEvent(101, implementationResult()));
    assert.equal(resultState(result).stage.kind, 'start_documentation');
    result = await workflow.step(harness.ctx, resultState(result), null);
    assert.deepEqual(harness.spawned[0], {
      harness: 'codex', model: 'gpt-6-astra', effort: 'low', modifiers: [{ kind: 'skill', name: 'brainstorming' }], prompt: harness.spawned[0]?.prompt,
    });
    assert.match(harness.spawned[0]?.prompt ?? '', /Let's brainstorm/);
    assert.match(harness.spawned[0]?.prompt ?? '', /both new documentation and updates to existing documentation within ADRs/);
    assert.match(harness.spawned[0]?.prompt ?? '', /implementation\/decisions.md/);
    result = await workflow.step(harness.ctx, resultState(result), ended);
    assert.equal(resultState(result).stage.kind, 'await_documentation_continue');
    assert.deepEqual(result.type === 'suspend' && result.condition, { kind: 'user_continue' });
    assert.equal(harness.headless.length, 0);
  }
});

test('documentation Continue skips a clean commit, closes its pane, and proceeds to PR', async (t) => {
  const worktreePath = tempWorktree(t);
  initGit(worktreePath);
  const harness = workflowHarness(worktreePath);
  let result = await workflow.step(harness.ctx, await state({ kind: 'await_documentation_continue', design: designResult(), walkthrough: presentationResult(), implementation: implementationResult(), session }), continued);
  assert.equal(resultState(result).stage.kind, 'commit_documentation');
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(resultState(result).stage.kind, 'close_documentation');
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.deepEqual(harness.closed, [session.paneId]);
  assert.equal(harness.sent.length, 0);
  result = await workflow.step(harness.ctx, resultState(result), null);
  assert.equal(resultState(result).stage.kind, 'start_pull_request');
  assert.equal(harness.headless.length, 0);
});

for (const checkpoint of ['ui', 'documentation'] as const) {
  test(`${checkpoint} checkpoint commits outstanding changes before closing its pane`, async (t) => {
    const worktreePath = tempWorktree(t);
    initGit(worktreePath);
    writeArtifact(worktreePath, 'temporary-route.ts', 'export const mock = true;');
    const harness = workflowHarness(worktreePath);
    const context = { design: designResult(), walkthrough: presentationResult(), session, implementation: implementationResult() };
    let result = await workflow.step(harness.ctx, await state({ kind: checkpoint === 'ui' ? 'commit_ui' : 'commit_documentation', ...context }), null);
    assert.equal(result.type, 'suspend');
    assert.deepEqual(harness.closed, []);
    assert.equal(harness.headless.length, 1);
    if (checkpoint === 'ui') assert.match(harness.headless[0]?.prompt ?? '', /draft: /);
    const subject = checkpoint === 'ui' ? 'draft: UI exploration' : 'docs: architecture overview';
    git(worktreePath, ['add', '-A']);
    git(worktreePath, ['commit', '-m', subject]);
    const commit = git(worktreePath, ['rev-parse', 'HEAD']).trim();
    result = await workflow.step(harness.ctx, resultState(result), { kind: 'headless_agent', results: [{ opId: 'pr-1', status: 'completed', output: JSON.stringify({ outcome: 'commit-created', commit, subject }) }] });
    assert.equal(resultState(result).stage.kind, checkpoint === 'ui' ? 'close_ui' : 'close_documentation');
    assert.deepEqual(harness.closed, []);
    await workflow.step(harness.ctx, resultState(result), null);
    assert.deepEqual(harness.closed, [session.paneId]);
  });

  test(`${checkpoint} checkpoint failures preserve the session`, async (t) => {
    const worktreePath = tempWorktree(t);
    initGit(worktreePath);
    const harness = workflowHarness(worktreePath);
    const stage = { kind: checkpoint === 'ui' ? 'await_ui_commit' : 'await_documentation_commit', design: designResult(), walkthrough: presentationResult(), implementation: implementationResult(), session, opId: 'pr-1' } as const;
    const result = await workflow.step(harness.ctx, await state(stage), { kind: 'headless_agent', results: [{ opId: 'pr-1', status: 'failed', error: 'hook failed' }] });
    assert.equal(result.type, 'fail');
    assert.deepEqual(harness.closed, []);
  });
}

function git(worktreePath: string, args: string[]): string {
  return execFileSync('git', args, { cwd: worktreePath, encoding: 'utf8' });
}

function initGit(worktreePath: string): void {
  git(worktreePath, ['init', '-q']);
  git(worktreePath, ['config', 'user.name', 'Workflow Test']);
  git(worktreePath, ['config', 'user.email', 'test@example.invalid']);
  git(worktreePath, ['config', 'commit.gpgsign', 'false']);
  git(worktreePath, ['config', 'core.hooksPath', '/dev/null']);
}

async function state(stage: Stage): Promise<State> {
  return { ...await workflow.init(launchCtx, { story }), stage } satisfies State;
}

function resultState(result: WorkflowResult): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  return result.state as State;
}

function designResult() {
  return {
    artifacts: designPaths,
    steps: {
      currentState: { outcome: 'created' as const, reviewCount: 1 },
      architecture: { outcome: 'created' as const, reviewCount: 2 },
      programDesign: { outcome: 'created' as const, reviewCount: 1 },
    },
  };
}

function artifactResult(artifactPath: string, reviewCount: number) {
  return { outcome: 'artifact-reviewed', artifactPath, reviewCount };
}

function presentationResult() {
  return {
    outcome: 'presentation-created' as const,
    curriculumPath: `${reviewDirectory}/.walkthrough/curriculum.json`,
    deckPlanPath: `${reviewDirectory}/.walkthrough/deck-plan.json`,
    presentationPath: `${reviewDirectory}/walkthrough.html`,
    neighborhoodCount: 5,
    contentMomentCount: 14,
    substantiveSlideCount: 18,
    totalSlideCount: 19,
    coverageItemCount: 46,
  };
}

function socraticResult() {
  return {
    outcome: 'socratic-walkthrough-completed' as const,
    curriculumPath: `${reviewDirectory}/.walkthrough/curriculum.json`,
  };
}

function implementationResult() {
  return {
    outcome: 'story-implemented' as const,
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

function decisionEvent(value: 'approve' | 'reject') {
  return { kind: 'user_input', answers: { implementationDecision: value } };
}

function workflowHarness(worktreePath = '/workspace') {
  const started: Array<{ readonly workflowKey: string; readonly variables: Record<string, unknown> | undefined; readonly context: unknown }> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const headless: Array<Parameters<WorkflowContext['runHeadlessAgent']>[0]> = [];
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const closed: number[] = [];
  const ctx = {
    worktreePath,
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
    spawnAgentSession: async (input: Parameters<WorkflowContext['spawnAgentSession']>[0]) => {
      spawned.push(input);
      return { ...session, sentAt: ended.recordedAt };
    },
    sendAgentPrompt: async (input: Parameters<WorkflowContext['sendAgentPrompt']>[0]) => {
      sent.push(input);
      return { agentSessionId: input.agentSessionId, sentAt: ended.recordedAt };
    },
    closePane: async (paneId: number) => { closed.push(paneId); },
    setUiFeedback: async () => {},
    log: async (level: string, message: string) => { logs.push({ level, message }); },
  } as unknown as WorkflowContext;
  return { ctx, started, logs, headless, spawned, sent, closed };
}

function tempWorktree(t: TestContext): string {
  const worktreePath = mkdtempSync(resolve(tmpdir(), 'end-to-end-implementation-'));
  t.after(() => rmSync(worktreePath, { recursive: true, force: true }));
  return worktreePath;
}

function writeArtifact(worktreePath: string, artifactPath: string, contents = '# Existing artifact'): void {
  const absolutePath = resolve(worktreePath, artifactPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}
