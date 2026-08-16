import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import type {
  WorkflowContext,
  WorkflowLaunchContext,
  WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { reviewer } from '../src/constants.js';
import workflow from '../src/index.js';
import {
  architecturePrompt,
  currentStatePrompt,
  programDesignPrompt,
  PROMPT_FOOTER,
} from '../src/prompts.js';

type State = Parameters<typeof workflow.step>[1];

const variables = {
  story: 'https://github.com/owner/repo/issues/2',
  currentStatePath: 'scratch/plans/example/artifacts/current-state.md',
  architecturePath: 'scratch/plans/example/artifacts/architecture.md',
  programDesignPath: 'scratch/plans/example/artifacts/program-design.md',
  reviewDirectory: 'scratch/plans/example/review',
};

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command captures the story, three sources, and review directory', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, 'Create Story Review Artifacts');
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    [
      'story',
      'currentStatePath',
      'architecturePath',
      'programDesignPath',
      'reviewDirectory',
    ],
  );
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), baseState('/workspace'));
  await assert.rejects(async () => {
    await workflow.validate(launchCtx, { ...variables, architecturePath: '  ' });
  });
});

test('spawns one Claude Opus agent with Show Me for the current-state artifact', async () => {
  const harness = workflowHarness('/workspace');
  const state = baseState('/workspace');
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.spawned[0], {
    ...reviewer,
    modifiers: [{ kind: 'skill', name: 'show-me' }],
    prompt: currentStatePrompt({
      repositoryPath: '/workspace',
      story: state.story,
      sourcePath: state.sources.currentStatePath,
      outputPath: state.artifacts.currentStatePath,
      architectureOutputPath: state.artifacts.architecturePath,
    }),
  });
  assert.deepEqual(result.type === 'suspend' ? result.condition : undefined, {
    kind: 'agent_turn',
    agentSessionId: 11,
    sentAt: '2026-08-16T00:00:00.000Z',
  });
  assert.equal(harness.spawned[0]?.prompt?.endsWith(PROMPT_FOOTER), true);
});

test('a completed current-state artifact advances the same agent to architecture', async () => {
  await withRepository(async (repositoryPath) => {
    const state = baseState(repositoryPath, {
      kind: 'await_current_state',
      agent: agent(),
    });
    writeArtifact(repositoryPath, state.artifacts.currentStatePath);
    const harness = workflowHarness(repositoryPath);
    const advanced = await workflow.step(harness.ctx, state, endedTurn());
    assert.equal(advanced.type, 'cont');
    assert.equal(resultState(advanced).stage.kind, 'send_architecture');
    assert.equal(harness.closedPanes.length, 0);
  });
});

test('a missing artifact fails visibly and preserves the review pane', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, { kind: 'await_current_state', agent: agent() }),
      endedTurn(),
    );
    assert.equal(result.type, 'fail');
    assert.equal(harness.closedPanes.length, 0);
    assert.equal(harness.feedback.at(-1)?.kind, 'error');
    assert.match(harness.logs.at(-1)?.message ?? '', /was not created/);
  });
});

test('an agent-turn failure fails and preserves the review pane', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(
    harness.ctx,
    baseState('/workspace', { kind: 'await_architecture', agent: agent() }),
    {
      outcome: 'failed',
      recordedAt: '2026-08-16T00:00:00.000Z',
      reason: 'provider exited',
    },
  );
  assert.equal(result.type, 'fail');
  assert.equal(harness.closedPanes.length, 0);
  assert.match(harness.logs.at(-1)?.message ?? '', /provider exited/);
});

test('sends the architecture prompt to the existing agent with Show Me', async () => {
  const harness = workflowHarness('/workspace');
  const state = baseState('/workspace', { kind: 'send_architecture', agent: agent() });
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, 'suspend');
  assert.equal(harness.spawned.length, 0);
  assert.deepEqual(harness.sent[0], {
    agentSessionId: 11,
    modifiers: [{ kind: 'skill', name: 'show-me' }],
    prompt: architecturePrompt({
      repositoryPath: '/workspace',
      story: state.story,
      sourcePath: state.sources.architecturePath,
      outputPath: state.artifacts.architecturePath,
      programDesignOutputPath: state.artifacts.programDesignPath,
    }),
  });
});

test('sends the program-design prompt to the existing agent with Show Me', async () => {
  const harness = workflowHarness('/workspace');
  const state = baseState('/workspace', { kind: 'send_program_design', agent: agent() });
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, 'suspend');
  assert.equal(harness.spawned.length, 0);
  assert.deepEqual(harness.sent[0], {
    agentSessionId: 11,
    modifiers: [{ kind: 'skill', name: 'show-me' }],
    prompt: programDesignPrompt({
      repositoryPath: '/workspace',
      story: state.story,
      sourcePath: state.sources.programDesignPath,
      outputPath: state.artifacts.programDesignPath,
    }),
  });
});

test('the final artifact closes the review pane and returns all HTML paths', async () => {
  await withRepository(async (repositoryPath) => {
    const state = baseState(repositoryPath, {
      kind: 'await_program_design',
      agent: agent(),
    });
    writeArtifact(repositoryPath, state.artifacts.programDesignPath);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(harness.ctx, state, endedTurn());

    assert.equal(result.type, 'done');
    assert.deepEqual(result.type === 'done' ? result.value : undefined, {
      outcome: 'story-review-artifacts-created',
      reviewDirectory: variables.reviewDirectory,
      artifacts: state.artifacts,
    });
    assert.deepEqual(harness.closedPanes, [21]);
  });
});

test('prompts link forward without asking the current turn to create the next artifact', () => {
  const state = baseState('/workspace');
  const currentPrompt = currentStatePrompt({
    repositoryPath: state.repositoryPath,
    story: state.story,
    sourcePath: state.sources.currentStatePath,
    outputPath: state.artifacts.currentStatePath,
    architectureOutputPath: state.artifacts.architecturePath,
  });
  const architectureReviewPrompt = architecturePrompt({
    repositoryPath: state.repositoryPath,
    story: state.story,
    sourcePath: state.sources.architecturePath,
    outputPath: state.artifacts.architecturePath,
    programDesignOutputPath: state.artifacts.programDesignPath,
  });
  const programPrompt = programDesignPrompt({
    repositoryPath: state.repositoryPath,
    story: state.story,
    sourcePath: state.sources.programDesignPath,
    outputPath: state.artifacts.programDesignPath,
  });

  assert.match(currentPrompt, /later workflow turn/);
  assert.match(currentPrompt, /href is exactly "\.\/architecture\.html"/);
  assert.match(currentPrompt, /do not create the destination in this turn/);
  assert.match(architectureReviewPrompt, /program-design\.html/);
  assert.match(architectureReviewPrompt, /href is exactly "\.\/program-design\.html"/);
  assert.match(architectureReviewPrompt, /do not create the destination in this turn/);
  assert.match(programPrompt, /press Continue/);
  assert.doesNotMatch(programPrompt, /index\.md/);
});

function workflowHarness(repositoryPath: string) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext['setUiFeedback']>[0]> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const ctx: WorkflowContext = {
    worktreePath: repositoryPath,
    spawnAgentSession: async (input) => {
      spawned.push(input);
      return { agentSessionId: 11, paneId: 21, sentAt: '2026-08-16T00:00:00.000Z' };
    },
    sendAgentPrompt: async (input) => {
      sent.push(input);
      return { agentSessionId: input.agentSessionId, sentAt: '2026-08-16T00:01:00.000Z' };
    },
    closePane: async (paneId) => {
      closedPanes.push(paneId);
    },
    getConversationHistory: async () => unexpected('getConversationHistory'),
    runHeadlessAgent: async () => unexpected('runHeadlessAgent'),
    startWorkflow: async () => unexpected('startWorkflow'),
    log: async (level, message) => {
      logs.push({ level, message });
    },
    setUiFeedback: async (value) => {
      feedback.push(value);
    },
  };
  return { ctx, spawned, sent, closedPanes, feedback, logs };
}

function baseState(repositoryPath: string, stage?: State['stage']): State {
  return {
    stateVersion: 1,
    repositoryPath,
    story: variables.story,
    sources: {
      currentStatePath: variables.currentStatePath,
      architecturePath: variables.architecturePath,
      programDesignPath: variables.programDesignPath,
    },
    reviewDirectory: variables.reviewDirectory,
    artifacts: {
      currentStatePath: `${variables.reviewDirectory}/current-state.html`,
      architecturePath: `${variables.reviewDirectory}/architecture.html`,
      programDesignPath: `${variables.reviewDirectory}/program-design.html`,
    },
    stage: stage ?? { kind: 'spawn_current_state' },
  };
}

function writeArtifact(repositoryPath: string, artifactPath: string): void {
  const fullPath = join(repositoryPath, artifactPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, '<!doctype html>\n');
}

async function withRepository(run: (repositoryPath: string) => Promise<void>): Promise<void> {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'story-review-'));
  try {
    await run(repositoryPath);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
}

function agent() {
  return { agentSessionId: 11, paneId: 21 };
}

function endedTurn() {
  return { outcome: 'ended', recordedAt: '2026-08-16T00:00:00.000Z' };
}

function resultState(result: WorkflowResult): State {
  assert.ok(result.type === 'cont' || result.type === 'suspend');
  return result.state as State;
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
