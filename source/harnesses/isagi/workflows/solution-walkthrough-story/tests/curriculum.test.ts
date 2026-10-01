import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import type { DesignCurriculumParameters } from 'isagi-workflow-design-curriculum/graph';
import { assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { WalkthroughCurriculumGraph } from '../src/graphs/curriculum.js';
import type { DeliveryMechanism } from '../src/types.js';
import { context, destination, sources, withRepository, workflowHarness, write, writeDeckPlan, writeGenericCurriculum } from './fixtures.js';

const graph = WalkthroughCurriculumGraph;
const { paths } = context();
const state = (repositoryPath: string, deliveryMechanism: DeliveryMechanism = 'presentation') =>
  graph.init(destination(repositoryPath), { context: context(), deliveryMechanism });

test('fresh runs delegate curriculum design with the complete decision-oriented brief', async () => {
  await withRepository(async (repositoryPath) => {
    writeDesignSources(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const inspected = await visit(graph, 'inspectPlanning', harness.ctx, state(repositoryPath));
    assert.equal(inspected.to, 'designCurriculum');

    const child = subgraphParameters<DesignCurriculumParameters>(graph, 'designCurriculum', inspected.state);
    assert.deepEqual(child.sources.map(({ id, path }) => ({ id, path })), [
      { id: 'current-state', path: sources.currentStatePath },
      { id: 'architecture', path: sources.architecturePath },
      { id: 'program-design', path: sources.programDesignPath },
    ]);
    assert.match(child.learningGoal, /approve or reject/);
    assert.match(child.teachingBrief, /exact changed contracts/);
    assert.equal(child.paths.outputDirectory, paths.walkthroughDirectory);

    writeGenericCurriculum(repositoryPath);
    const designed = visitSubgraph(graph, 'designCurriculum', inspected.state, curriculumResult());
    assert.equal(designed.to, 'confirmCurriculum');
    const confirmed = await visit(graph, 'confirmCurriculum', harness.ctx, designed.state);
    assert.equal(confirmed.to, 'ready');
  });
});

test('a valid curriculum is reused without designing a new one', async () => {
  await withRepository(async (repositoryPath) => {
    writeGenericCurriculum(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const inspected = await visit(graph, 'inspectPlanning', harness.ctx, state(repositoryPath));
    assert.equal(inspected.to, 'ready');
    assert.deepEqual(harness.feedback, [{ phase: 'Reusing the approved curriculum', message: 'A new deck plan will be created.' }]);
  });
});

for (const staleArtifact of ['curriculumAnalysisPath', 'curriculumPath', 'deckPlanPath'] as const) {
  test(`a stale ${staleArtifact} resets every planning JSON artifact`, async () => {
    await withRepository(async (repositoryPath) => {
      writeDesignSources(repositoryPath);
      writeGenericCurriculum(repositoryPath);
      writeDeckPlan(repositoryPath);
      write(repositoryPath, paths[staleArtifact], JSON.stringify({ schemaVersion: 0 }));
      const result = await visit(graph, 'inspectPlanning', workflowHarness(repositoryPath).ctx, state(repositoryPath));
      assert.equal(result.to, 'designCurriculum');
      assertPlanningArtifactsRemoved(repositoryPath);
    });
  });
}

test('a partial curriculum pair resets every planning JSON artifact', async () => {
  await withRepository(async (repositoryPath) => {
    writeDesignSources(repositoryPath);
    write(repositoryPath, paths.curriculumAnalysisPath, JSON.stringify({ schemaVersion: 3 }));
    write(repositoryPath, paths.deckPlanPath, JSON.stringify({ schemaVersion: 7 }));
    const result = await visit(graph, 'inspectPlanning', workflowHarness(repositoryPath).ctx, state(repositoryPath));
    assert.equal(result.to, 'designCurriculum');
    assertPlanningArtifactsRemoved(repositoryPath);
  });
});

test('Socratic mode also resets a stale deck plan so the planning cache stays coherent', async () => {
  await withRepository(async (repositoryPath) => {
    writeDesignSources(repositoryPath);
    writeGenericCurriculum(repositoryPath);
    writeDeckPlan(repositoryPath);
    write(repositoryPath, paths.deckPlanPath, JSON.stringify({ schemaVersion: 0 }));
    const result = await visit(graph, 'inspectPlanning', workflowHarness(repositoryPath).ctx, state(repositoryPath, 'socratic-walkthrough'));
    assert.equal(result.to, 'designCurriculum');
    assertPlanningArtifactsRemoved(repositoryPath);
  });
});

test('a failed curriculum graph returns its diagnostic', () => {
  const failed = visitSubgraph(graph, 'designCurriculum', state('/workspace'), {
    outcomeId: 'failed',
    outcomeKind: 'failure',
    output: { outcome: 'failed', reason: 'source could not be read' },
  });
  assert.equal(failed.to, 'failed');
  assert.deepEqual(graph.outcomes.failed!.output(failed.state), {
    outcome: 'failed',
    failure: { message: 'The curriculum workflow did not complete successfully.', diagnostic: 'Curriculum design failed: source could not be read' },
  });
});

test('a curriculum written somewhere else is rejected', () => {
  const misplaced = visitSubgraph(graph, 'designCurriculum', state('/workspace'), curriculumResult({ curriculumPath: 'elsewhere/curriculum.json' }));
  assert.equal(misplaced.to, 'failed');
  assert.match(misplaced.state.failure?.diagnostic ?? '', /elsewhere\/curriculum\.json/);
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});

function curriculumResult(overrides: { readonly curriculumPath?: string } = {}) {
  return {
    outcomeId: 'created',
    outcomeKind: 'success' as const,
    output: {
      outcome: 'curriculum-created',
      analysisPath: paths.curriculumAnalysisPath,
      curriculumPath: paths.curriculumPath,
      sourceCount: 3,
      coverageItemCount: 2,
      primaryCoverageCount: 1,
      supportingCoverageCount: 0,
      referenceCoverageCount: 1,
      requiredCoverageCount: 2,
      optionalCoverageCount: 0,
      omissionCount: 0,
      neighborhoodCount: 1,
      outcomeCount: 1,
      budgetExceptionCount: 0,
      ...overrides,
    },
  };
}

function writeDesignSources(repositoryPath: string): void {
  for (const path of Object.values(sources)) write(repositoryPath, path, '# Design source\n');
}

function assertPlanningArtifactsRemoved(repositoryPath: string): void {
  for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
    assert.equal(existsSync(join(repositoryPath, artifactPath)), false);
  }
}
