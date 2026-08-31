import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowContext, WorkflowLaunchContext } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';
import { analysis, curriculum, variables, writeJson, writeSources } from './fixtures.js';

const launchContext = (worktreePath: string): WorkflowLaunchContext => ({ worktreeId: 1, worktreePath, surfaceId: 1 });

test('command exposes simple generic curriculum inputs', async () => {
  const manifest = await workflow.command(launchContext('/workspace'));
  assert.equal(manifest.title, 'Design Curriculum');
  assert.deepEqual(manifest.inputs?.map(({ key }) => key), ['sources', 'learningGoal', 'audienceFamiliarity', 'audienceDepth', 'teachingBrief', 'outputDirectory']);
  assert.equal(manifest.inputs?.find(({ key }) => key === 'sources')?.kind, 'text');
});

test('workflow uses two turns in one designer session and returns observable metrics', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-workflow-'));
  try {
    writeSources(repositoryPath);
    const state = await workflow.init(launchContext(repositoryPath), variables());
    const harness = workflowHarness();
    const started = await workflow.step(harness.ctx, state, null);
    assert.equal(started.type, 'suspend');
    assert.equal(harness.spawned.length, 1);
    assert.deepEqual(profile(harness.spawned[0]), { harness: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
    assert.match(harness.spawned[0]?.prompt ?? '', /curriculum-analysis\.json/);

    const input = state.input;
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const planned = await workflow.step(harness.ctx, resultState(started), ended());
    assert.equal(resultStage(planned).kind, 'send_curriculum');
    const writing = await workflow.step(harness.ctx, resultState(planned), null);
    assert.equal(writing.type, 'suspend');
    assert.equal(harness.sent[0]?.agentSessionId, 11);
    assert.match(harness.sent[0]?.prompt ?? '', /Organizing outcomes and coverage obligations|Curriculum conventions/);

    writeJson(repositoryPath, input.paths.curriculumPath, curriculum(input));
    const finished = await workflow.step(harness.ctx, resultState(writing), ended());
    assert.equal(finished.type, 'done');
    assert.deepEqual(harness.closedPanes, [21]);
    const value = finished.type === 'done' ? finished.value as Record<string, unknown> : {};
    assert.equal(value.outcome, 'curriculum-created');
    assert.equal(value.sourceCount, 2);
    assert.equal(value.coverageItemCount, 6);
    assert.equal(value.primaryCoverageCount, 2);
    assert.equal(value.supportingCoverageCount, 1);
    assert.equal(value.referenceCoverageCount, 2);
    assert.equal(value.requiredCoverageCount, 4);
    assert.equal(value.optionalCoverageCount, 1);
    assert.equal(value.omissionCount, 1);
    assert.equal(value.neighborhoodCount, 2);
    assert.equal(value.outcomeCount, 2);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

function workflowHarness() {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const closedPanes: number[] = [];
  const ctx: WorkflowContext = {
    worktreePath: '/workspace',
    spawnAgentSession: async (input) => {
      spawned.push(input);
      return { agentSessionId: 11, paneId: 21, sentAt: '2026-08-30T00:00:00.000Z' };
    },
    sendAgentPrompt: async (input) => {
      sent.push(input);
      return { agentSessionId: input.agentSessionId, sentAt: '2026-08-30T00:00:01.000Z' };
    },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async () => [],
    runHeadlessAgent: async () => { throw new Error('Unexpected headless agent.'); },
    startWorkflow: async () => { throw new Error('Unexpected child workflow.'); },
    log: async () => {},
    setUiFeedback: async () => {},
  };
  return { ctx, spawned, sent, closedPanes };
}

function profile(input: Parameters<WorkflowContext['spawnAgentSession']>[0] | undefined) {
  return input && { harness: input.harness, model: input.model, effort: input.effort };
}

function ended() {
  return { outcome: 'ended' as const, recordedAt: '2026-08-30T00:00:00.000Z' };
}

function resultState(result: Awaited<ReturnType<typeof workflow.step>>) {
  if (result.type !== 'cont' && result.type !== 'suspend') throw new Error(`Expected state result, got ${result.type}.`);
  return result.state as Parameters<typeof workflow.step>[1];
}

function resultStage(result: Awaited<ReturnType<typeof workflow.step>>) {
  return resultState(result).stage;
}
