import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { OperationContext, WorkflowOrigin } from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import {
  agentTurnEnded,
  agentTurnInterrupted,
  assertDestinationsDeclared,
  subgraphParameters,
  visit,
  visitSubgraph,
} from 'isagi-workflow-common-graphs/testing';

import { curriculumDesigner } from '../src/constants.js';
import { DesignCurriculumGraph } from '../src/graph.js';
import workflow from '../src/index.js';
import { analysis, curriculum, variables, writeJson, writeSources } from './fixtures.js';

const graph = DesignCurriculumGraph;
const designer = { agentSessionId: 11, paneId: 21 };
const origin = (worktreePath: string): WorkflowOrigin => ({ worktreeId: 1, worktreePath, surfaceId: 1 });
const destination = (worktreePath: string) => ({ worktreeId: 1, worktreePath, surfaceId: 1 });

test('command exposes simple generic curriculum inputs', async () => {
  const manifest = await workflow.command(origin('/workspace'));
  assert.equal(manifest.title, 'Design Curriculum');
  assert.deepEqual(manifest.inputs?.map(({ key }) => key), ['sources', 'learningGoal', 'audienceFamiliarity', 'audienceDepth', 'teachingBrief', 'outputDirectory']);
  assert.equal(manifest.inputs?.find(({ key }) => key === 'sources')?.kind, 'text');
});

test('parse validates sources in the launch worktree and leaves the repository path to the destination', async () => {
  await withRepository(async (repositoryPath) => {
    const parameters = await workflow.parse(origin(repositoryPath), variables());
    assert.equal('repositoryPath' in parameters, false);
    assert.equal(parameters.paths.curriculumPath, 'review/.curriculum/curriculum.json');
    assert.equal(graph.init(destination('/elsewhere'), parameters).input.repositoryPath, '/elsewhere');
    assert.throws(() => workflow.parse(origin(repositoryPath), { ...variables(), sources: 'docs/missing.md' }), /does not exist/);
  });
});

test('workflow uses two turns in one designer session and returns observable metrics', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    const state = graph.init(destination(repositoryPath), await workflow.parse(origin(repositoryPath), variables()));

    const prepared = await visit(graph, 'prepareOutput', harness.ctx, state);
    assert.equal(prepared.to, 'analyzeSources');
    assert.equal(existsSync(join(repositoryPath, state.input.paths.outputDirectory)), true);

    const analysisTurn = subgraphParameters<AgentTurnParameters>(graph, 'analyzeSources', prepared.state);
    assert.deepEqual(analysisTurn.session, { kind: 'spawn', ...curriculumDesigner });
    assert.match(analysisTurn.prompt ?? '', /curriculum-analysis\.json/);
    const analyzed = visitSubgraph(graph, 'analyzeSources', prepared.state, agentTurnEnded(designer));
    assert.equal(analyzed.to, 'readAnalysis');

    writeJson(repositoryPath, state.input.paths.analysisPath, analysis(state.input));
    const planned = await visit(graph, 'readAnalysis', harness.ctx, analyzed.state);
    assert.equal(planned.to, 'designCurriculum');

    const designTurn = subgraphParameters<AgentTurnParameters>(graph, 'designCurriculum', planned.state);
    assert.deepEqual(designTurn.session, { kind: 'existing', ...designer });
    assert.match(designTurn.prompt ?? '', /Curriculum conventions/);
    const designed = visitSubgraph(graph, 'designCurriculum', planned.state, agentTurnEnded(designer));
    assert.equal(designed.to, 'finish');

    writeJson(repositoryPath, state.input.paths.curriculumPath, curriculum(state.input));
    const finished = await visit(graph, 'finish', harness.ctx, designed.state);
    assert.equal(finished.to, 'created');
    assert.deepEqual(harness.closedPanes, [21]);
    const output = graph.outcomes.created!.output(finished.state);
    assert.equal(output.outcome, 'curriculum-created');
    assert.deepEqual(output.outcome === 'curriculum-created' && {
      sourceCount: output.sourceCount,
      coverageItemCount: output.coverageItemCount,
      primaryCoverageCount: output.primaryCoverageCount,
      supportingCoverageCount: output.supportingCoverageCount,
      referenceCoverageCount: output.referenceCoverageCount,
      requiredCoverageCount: output.requiredCoverageCount,
      optionalCoverageCount: output.optionalCoverageCount,
      omissionCount: output.omissionCount,
      neighborhoodCount: output.neighborhoodCount,
      outcomeCount: output.outcomeCount,
    }, {
      sourceCount: 2,
      coverageItemCount: 6,
      primaryCoverageCount: 2,
      supportingCoverageCount: 1,
      referenceCoverageCount: 2,
      requiredCoverageCount: 4,
      optionalCoverageCount: 1,
      omissionCount: 1,
      neighborhoodCount: 2,
      outcomeCount: 2,
    });
  });
});

test('a dead designer session ends in the failure outcome, and an invalid artifact fails the step for Retry', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    const state = graph.init(destination(repositoryPath), await workflow.parse(origin(repositoryPath), variables()));

    const died = visitSubgraph(graph, 'analyzeSources', state, agentTurnInterrupted(designer, 'Curriculum analysis was interrupted in pane 21: session_died'));
    assert.equal(died.to, 'reportFailure');
    const reported = await visit(graph, 'reportFailure', harness.ctx, died.state);
    assert.equal(reported.to, 'failed');
    assert.deepEqual(graph.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: 'Curriculum analysis was interrupted in pane 21: session_died' });

    const analyzed = visitSubgraph(graph, 'analyzeSources', state, agentTurnEnded(designer));
    writeJson(repositoryPath, state.input.paths.analysisPath, { schemaVersion: 2 });
    await assert.rejects(visit(graph, 'readAnalysis', harness.ctx, analyzed.state), /schemaVersion must be 3/);
  });
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});

async function withRepository(run: (repositoryPath: string) => Promise<void>): Promise<void> {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-workflow-'));
  try {
    writeSources(repositoryPath);
    await run(repositoryPath);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
}

function workflowHarness(repositoryPath: string) {
  const closedPanes: number[] = [];
  const ctx: OperationContext = {
    destination: destination(repositoryPath),
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    sendAgentPrompt: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async () => [],
    runHeadlessAgent: async () => { throw new Error('Unexpected headless agent.'); },
    log: async () => {},
    setUiFeedback: async () => {},
  };
  return { ctx, closedPanes };
}
