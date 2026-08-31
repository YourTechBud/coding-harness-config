import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { deckBuilder } from '../src/constants.js';
import workflow from '../src/index.js';
import { walkthroughPaths } from '../src/paths.js';
import {
  assembledHtml,
  ended,
  resultStage,
  resultState,
  reviewDirectory,
  state,
  workflowHarness,
  write,
  writeDeckPlan,
  writeGenericCurriculum,
} from './fixtures.js';

test('fresh runs delegate curriculum design with the complete decision-oriented brief', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const harness = workflowHarness(repositoryPath);
    const started = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }), null);
    assert.equal(started.type, 'suspend');
    assert.equal(resultStage(started).kind, 'await_curriculum_workflow');
    assert.equal(harness.workflows[0]?.key, 'design-curriculum');
    const variables = harness.workflows[0]?.variables as Record<string, unknown>;
    assert.equal(Array.isArray(variables.sources), true);
    assert.match(String(variables.learningGoal), /approve or reject/);
    assert.match(String(variables.teachingBrief), /exact changed contracts/);

    writeGenericCurriculum(repositoryPath);
    const paths = walkthroughPaths(reviewDirectory);
    const continued = await workflow.step(harness.ctx, resultState(started), {
      kind: 'workflow',
      results: [{
        runId: 101,
        status: 'done',
        result: {
          outcome: 'curriculum-created',
          analysisPath: paths.curriculumAnalysisPath,
          curriculumPath: paths.curriculumPath,
        },
      }],
    });
    assert.equal(resultStage(continued).kind, 'start_presentation');
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('valid curriculum and deck plan are reused while the HTML presentation is always rebuilt', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    writeGenericCurriculum(repositoryPath);
    writeDeckPlan(repositoryPath);
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, 'partial stale deck');

    const harness = workflowHarness(repositoryPath);
    const curriculumReady = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }), null);
    assert.equal(resultStage(curriculumReady).kind, 'start_presentation');
    assert.equal(harness.workflows.length, 0);

    const planReady = await workflow.step(harness.ctx, resultState(curriculumReady), null);
    assert.equal(resultStage(planReady).kind, 'start_deck_shell');
    assert.equal(harness.spawned.length, 0);

    const shellStarted = await workflow.step(harness.ctx, resultState(planReady), null);
    assert.equal(resultStage(shellStarted).kind, 'await_deck_shell');
    assert.deepEqual(
      harness.spawned[0] && { harness: harness.spawned[0].harness, model: harness.spawned[0].model, effort: harness.spawned[0].effort },
      deckBuilder,
    );
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('valid curriculum is reused when the deck plan still needs to be created', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    writeGenericCurriculum(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const curriculumReady = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }), null);
    assert.equal(resultStage(curriculumReady).kind, 'start_presentation');
    assert.equal(harness.workflows.length, 0);
    const architectureReady = await workflow.step(harness.ctx, resultState(curriculumReady), null);
    assert.equal(resultStage(architectureReady).kind, 'start_deck_architecture');
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

for (const staleArtifact of ['curriculumAnalysisPath', 'curriculumPath', 'deckPlanPath'] as const) {
  test(`a stale ${staleArtifact} resets every planning JSON artifact`, async () => {
    const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
    try {
      writeGenericCurriculum(repositoryPath);
      writeDeckPlan(repositoryPath);
      const paths = walkthroughPaths(reviewDirectory);
      write(repositoryPath, paths[staleArtifact], JSON.stringify({ schemaVersion: 0 }));
      const harness = workflowHarness(repositoryPath);
      const result = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }), null);
      assert.equal(result.type, 'suspend');
      assert.equal(resultStage(result).kind, 'await_curriculum_workflow');
      assert.equal(harness.workflows[0]?.key, 'design-curriculum');
      for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
        assert.equal(existsSync(join(repositoryPath, artifactPath)), false);
      }
    } finally {
      rmSync(repositoryPath, { recursive: true, force: true });
    }
  });
}

test('a partial curriculum pair resets every planning JSON artifact', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.curriculumAnalysisPath, JSON.stringify({ schemaVersion: 3 }));
    write(repositoryPath, paths.deckPlanPath, JSON.stringify({ schemaVersion: 7 }));
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }), null);
    assert.equal(resultStage(result).kind, 'await_curriculum_workflow');
    for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
      assert.equal(existsSync(join(repositoryPath, artifactPath)), false);
    }
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('Socratic mode also resets a stale deck plan so the planning cache stays coherent', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    writeGenericCurriculum(repositoryPath);
    writeDeckPlan(repositoryPath);
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.deckPlanPath, JSON.stringify({ schemaVersion: 0 }));
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      state(repositoryPath, { kind: 'start_curriculum_workflow' }, 'socratic-walkthrough'),
      null,
    );
    assert.equal(resultStage(result).kind, 'await_curriculum_workflow');
    for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
      assert.equal(existsSync(join(repositoryPath, artifactPath)), false);
    }
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('presentation construction uses a fresh Show Me session per neighborhood and validates final assembly', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    writeGenericCurriculum(repositoryPath);
    writeDeckPlan(repositoryPath);
    const paths = walkthroughPaths(reviewDirectory);
    const harness = workflowHarness(repositoryPath);

    const presentation = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_presentation' }), null);
    const shell = await workflow.step(harness.ctx, resultState(presentation), null);
    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck><div data-slide-viewport><section id="opening" data-walkthrough-slide></section><!-- walkthrough-content-end --></div><nav data-slide-navigation></nav></main>');
    const neighborhoodReady = await workflow.step(harness.ctx, resultState(shell), ended());
    const neighborhood = await workflow.step(harness.ctx, resultState(neighborhoodReady), null);
    assert.deepEqual(harness.spawned[1]?.modifiers, [{ kind: 'skill', name: 'show-me' }]);

    const assemblyReady = await workflow.step(harness.ctx, resultState(neighborhood), ended());
    const assembly = await workflow.step(harness.ctx, resultState(assemblyReady), null);
    assert.deepEqual(harness.spawned[2]?.modifiers, [{ kind: 'skill', name: 'show-me' }]);

    write(repositoryPath, paths.htmlPath, assembledHtml());
    const finished = await workflow.step(harness.ctx, resultState(assembly), ended());
    assert.equal(finished.type, 'done');
    assert.deepEqual(finished.type === 'done' ? finished.value : undefined, {
      outcome: 'presentation-created',
      curriculumPath: paths.curriculumPath,
      deckPlanPath: paths.deckPlanPath,
      presentationPath: paths.htmlPath,
      neighborhoodCount: 1,
      contentMomentCount: 1,
      substantiveSlideCount: 1,
      totalSlideCount: 2,
      coverageItemCount: 2,
    });
    assert.deepEqual(harness.closedPanes, [21, 22, 23]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('Socratic mode uses the same approved curriculum and returns its canonical outcome', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    writeGenericCurriculum(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const routed = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_curriculum_workflow' }, 'socratic-walkthrough'), null);
    assert.equal(resultStage(routed).kind, 'start_socratic_walkthrough');

    const started = await workflow.step(harness.ctx, resultState(routed), null);
    assert.equal(resultStage(started).kind, 'await_socratic_walkthrough');
    assert.deepEqual(harness.spawned[0]?.modifiers, [{ kind: 'skill', name: 'show-me' }]);

    const discussing = await workflow.step(harness.ctx, resultState(started), ended());
    assert.equal(discussing.type === 'suspend' ? discussing.condition.kind : null, 'user_continue');

    const finished = await workflow.step(harness.ctx, resultState(discussing), { kind: 'user_continue' });
    assert.equal(finished.type, 'done');
    assert.deepEqual(finished.type === 'done' ? finished.value : undefined, {
      outcome: 'socratic-walkthrough-completed',
      curriculumPath: walkthroughPaths(reviewDirectory).curriculumPath,
    });
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('failed child workflows expose their structured diagnostic', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, state('/workspace', { kind: 'await_curriculum_workflow', runId: 214 }), {
    kind: 'workflow',
    results: [{ runId: 214, status: 'failed', error: { reason: 'source could not be read' } }],
  });
  assert.equal(result.type, 'fail');
  assert.match(result.type === 'fail' ? result.reason : '', /source could not be read/);
});
