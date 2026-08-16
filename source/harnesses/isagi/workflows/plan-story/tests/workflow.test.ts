import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type {
  WorkflowContext,
  WorkflowConversationMessage,
  WorkflowLaunchContext,
  WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { planner, plannerJudgment, slugger } from '../src/constants.js';
import workflow from '../src/index.js';
import {
  plannerPrompt,
  plannerRoutingPrompt,
  PROMPT_FOOTER,
  slugPrompt,
} from '../src/prompts.js';

type State = Parameters<typeof workflow.step>[1];
type PlanContext = Extract<State['stage'], { readonly plan: unknown }>['plan'];

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command accepts only the story and preserves the repository path', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    ['story'],
  );
  const variables = { story: 'https://github.com/owner/repo/issues/2' };
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), {
    stateVersion: 1,
    repositoryPath: '/workspace',
    story: variables.story,
    stage: { kind: 'choose_plan_directory' },
  });
  await assert.rejects(async () => {
    await workflow.validate(launchCtx, { story: '   ' });
  });
});

test('chooses the slug with the configured headless profile and required footer', async () => {
  const harness = workflowHarness('/workspace');
  const current = baseState('/workspace', { kind: 'choose_plan_directory' });
  const result = await workflow.step(harness.ctx, current, null);

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.headless[0]?.profile, slugger);
  assert.equal(harness.headless[0]?.prompt, slugPrompt(current));
  assert.equal(harness.headless[0]?.prompt.endsWith(PROMPT_FOOTER), true);
});

test('selects the first collision-free plan directory', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'plan-story-slug-'));
  try {
    mkdirSync(join(repositoryPath, 'scratch/plans/add-session-recovery'), {
      recursive: true,
    });
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, { kind: 'await_plan_directory' }),
      headlessResult('{"slug":"add-session-recovery"}'),
    );

    assert.equal(result.type, 'cont');
    const state = resultState(result);
    assert.equal(state.stage.kind, 'start_current_state');
    if (state.stage.kind === 'start_current_state') {
      assert.deepEqual(state.stage.plan, plan('add-session-recovery-2'));
    }
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('invalid slug output fails without spawning a workflow or closing panes', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', { kind: 'await_plan_directory' }),
    headlessResult('{"slug":"Invalid Slug"}'),
  );

  assert.equal(result.type, 'fail');
  assert.equal(harness.started.length, 0);
  assert.equal(harness.closedPanes.length, 0);
  assert.equal(harness.feedback.at(-1)?.kind, 'error');
});

test('starts current-state analysis with the derived artifact path', async () => {
  const harness = workflowHarness('/workspace');
  const currentPlan = plan('add-session-recovery');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', { kind: 'start_current_state', plan: currentPlan }),
    null,
  );

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.started[0], {
    workflowKey: 'analyze-current-state',
    variables: {
      story: 'https://github.com/owner/repo/issues/2',
      artifactPath: currentPlan.currentStatePath,
    },
    context: undefined,
  });
  assert.deepEqual(result.type === 'suspend' ? result.condition : undefined, {
    kind: 'workflow',
    runIds: [101],
  });
});

test('a reviewed current-state artifact advances to architecture', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  const advanced = await workflow.step(
    harness.ctx,
    baseState('/workspace', {
      kind: 'await_current_state',
      plan: currentPlan,
      runId: 101,
    }),
    childResult(101, currentPlan.currentStatePath),
  );
  assert.equal(advanced.type, 'cont');
  assert.equal(resultState(advanced).stage.kind, 'start_architecture');
});

test('a failed child stops the wrapper and preserves every pane', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', {
      kind: 'await_current_state',
      plan: currentPlan,
      runId: 101,
    }),
    {
      kind: 'workflow',
      results: [{ runId: 101, status: 'failed', error: 'reviewer crashed' }],
    },
  );

  assert.equal(result.type, 'fail');
  assert.equal(harness.started.length, 0);
  assert.equal(harness.closedPanes.length, 0);
  assert.match(harness.logs.at(-1)?.message ?? '', /reviewer crashed/);
});

test('starts architecture with the story and current-state artifact', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  await workflow.step(
    harness.ctx,
    baseState('/workspace', { kind: 'start_architecture', plan: currentPlan }),
    null,
  );

  assert.deepEqual(harness.started[0], {
    workflowKey: 'design-architecture',
    variables: {
      story: 'https://github.com/owner/repo/issues/2',
      currentStatePath: currentPlan.currentStatePath,
      artifactPath: currentPlan.architecturePath,
    },
    context: undefined,
  });
});

test('starts program design with both predecessor artifacts', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  await workflow.step(
    harness.ctx,
    baseState('/workspace', { kind: 'start_program_design', plan: currentPlan }),
    null,
  );

  assert.deepEqual(harness.started[0], {
    workflowKey: 'design-program',
    variables: {
      story: 'https://github.com/owner/repo/issues/2',
      currentStatePath: currentPlan.currentStatePath,
      architecturePath: currentPlan.architecturePath,
      artifactPath: currentPlan.programDesignPath,
    },
    context: undefined,
  });
});

test('spawns the GPT-5.6 Sol planner with the plan skill and all reviewed artifacts', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  const current = baseState('/workspace', { kind: 'spawn_planner', plan: currentPlan });
  const result = await workflow.step(harness.ctx, current, null);

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.spawned[0], {
    ...planner,
    modifiers: [{ kind: 'skill', name: 'create-implementation-plan' }],
    prompt: plannerPrompt({
      repositoryPath: '/workspace',
      story: current.story,
      planDirectory: currentPlan.directory,
      entryPlanPath: currentPlan.entryPlanPath,
      currentStatePath: currentPlan.currentStatePath,
      architecturePath: currentPlan.architecturePath,
      programDesignPath: currentPlan.programDesignPath,
    }),
  });
  const prompt = harness.spawned[0]?.prompt ?? '';
  assert.match(prompt, /Use the explicit plan directory exactly/);
  assert.match(prompt, /artifacts\/current-state\.md/);
  assert.match(prompt, /artifacts\/architecture\.md/);
  assert.match(prompt, /artifacts\/program-design\.md/);
  assert.equal(prompt.endsWith(PROMPT_FOOTER), true);
});

test('judges the completed planner turn with the configured routing profile', async () => {
  const currentPlan = plan('example');
  const plannerResponse = `Created ${currentPlan.entryPlanPath}.`;
  const harness = workflowHarness('/workspace', {
    histories: { 11: [message('assistant', plannerResponse)] },
  });
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', {
      kind: 'await_planner',
      plan: currentPlan,
      planner: agent(11, 21),
    }),
    endedTurn(),
  );

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.headless[0]?.profile, plannerJudgment);
  assert.equal(
    harness.headless[0]?.prompt,
    plannerRoutingPrompt({ plannerResponse, entryPlanPath: currentPlan.entryPlanPath }),
  );
  assert.equal(harness.headless[0]?.prompt.endsWith(PROMPT_FOOTER), true);
});

test('a failed planner judgment leaves the planner pane open', async () => {
  const currentPlan = plan('example');
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', {
      kind: 'await_planner_judgment',
      plan: currentPlan,
      planner: agent(11, 21),
      plannerResponse: 'I still need to create the phase files.',
    }),
    headlessResult('{"outcome":"failed"}'),
  );

  assert.equal(result.type, 'fail');
  assert.equal(harness.closedPanes.length, 0);
  assert.match(harness.logs.at(-1)?.message ?? '', /still need to create/);
});

test('a ready plan completes immediately and preserves the planner pane', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'plan-story-ready-'));
  const currentPlan = plan('example');
  try {
    mkdirSync(join(repositoryPath, currentPlan.directory), { recursive: true });
    writeFileSync(join(repositoryPath, currentPlan.entryPlanPath), '# Plan\n');
    writeFileSync(
      join(repositoryPath, currentPlan.directory, 'phase-01-implement.md'),
      '---\ntype: implementation\ndepends_on: []\npays_back_in: []\n---\n',
    );
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: 'await_planner_judgment',
        plan: currentPlan,
        planner: agent(11, 21),
        plannerResponse: `Created ${currentPlan.entryPlanPath}.`,
      }),
      headlessResult('{"outcome":"ready"}'),
    );

    assert.equal(result.type, 'done');
    assert.deepEqual(result.type === 'done' ? result.value : undefined, {
      outcome: 'implementation-plan-created',
      planDirectory: currentPlan.directory,
      entryPlanPath: currentPlan.entryPlanPath,
      artifacts: {
        currentStatePath: currentPlan.currentStatePath,
        architecturePath: currentPlan.architecturePath,
        programDesignPath: currentPlan.programDesignPath,
      },
      plannerAgentSessionId: 11,
      plannerPaneId: 21,
    });
    assert.equal(harness.closedPanes.length, 0);
    assert.match(harness.feedback.at(-1)?.message ?? '', /remains open/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('a ready report with missing plan files fails and preserves the planner pane', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'plan-story-missing-'));
  try {
    const currentPlan = plan('example');
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: 'await_planner_judgment',
        plan: currentPlan,
        planner: agent(11, 21),
        plannerResponse: `Created ${currentPlan.entryPlanPath}.`,
      }),
      headlessResult('{"outcome":"ready"}'),
    );

    assert.equal(result.type, 'fail');
    assert.equal(harness.closedPanes.length, 0);
    assert.match(harness.logs.at(-1)?.message ?? '', /was not created/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('a failed planner turn fails visibly and leaves its pane open', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', {
      kind: 'await_planner',
      plan: plan('example'),
      planner: agent(11, 21),
    }),
    { outcome: 'failed', recordedAt: '2026-08-16T00:00:00.000Z', reason: 'provider exited' },
  );

  assert.equal(result.type, 'fail');
  assert.equal(harness.closedPanes.length, 0);
  assert.match(harness.logs.at(-1)?.message ?? '', /provider exited/);
});

function workflowHarness(
  repositoryPath: string,
  input?: { readonly histories?: Record<number, readonly WorkflowConversationMessage[]> },
) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const started: Array<{
    readonly workflowKey: string;
    readonly variables: Record<string, unknown> | undefined;
    readonly context: Parameters<WorkflowContext['startWorkflow']>[2];
  }> = [];
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

  const ctx: WorkflowContext = {
    worktreePath: repositoryPath,
    spawnAgentSession: async (spawnInput) => {
      spawned.push(spawnInput);
      return { agentSessionId: 11, paneId: 21, sentAt: '2026-08-16T00:00:00.000Z' };
    },
    sendAgentPrompt: async () => unexpected('sendAgentPrompt'),
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
    startWorkflow: async (workflowKey, variables, context) => {
      started.push({ workflowKey, variables, context });
      return 100 + started.length;
    },
    log: async (level, messageText) => {
      logs.push({ level, message: messageText });
    },
    setUiFeedback: async (value) => {
      feedback.push(value);
    },
  };

  return { ctx, spawned, started, headless, closedPanes, feedback, logs };
}

function baseState(repositoryPath: string, stage: State['stage']): State {
  return {
    stateVersion: 1,
    repositoryPath,
    story: 'https://github.com/owner/repo/issues/2',
    stage,
  };
}

function plan(slug: string): PlanContext {
  const directory = `scratch/plans/${slug}`;
  return {
    directory,
    entryPlanPath: `${directory}/index.md`,
    currentStatePath: `${directory}/artifacts/current-state.md`,
    architecturePath: `${directory}/artifacts/architecture.md`,
    programDesignPath: `${directory}/artifacts/program-design.md`,
  };
}

function agent(agentSessionId: number, paneId: number) {
  return { agentSessionId, paneId };
}

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

function endedTurn() {
  return { outcome: 'ended', recordedAt: '2026-08-16T00:00:00.000Z' };
}

function headlessResult(output: string) {
  return {
    kind: 'headless_agent',
    results: [{ opId: 'judge-1', status: 'completed', output }],
  };
}

function childResult(runId: number, artifactPath: string) {
  return {
    kind: 'workflow',
    results: [
      {
        runId,
        status: 'done',
        result: { outcome: 'artifact-reviewed', artifactPath, reviewCount: 1 },
      },
    ],
  };
}

function resultState(result: WorkflowResult): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  return result.state as State;
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
