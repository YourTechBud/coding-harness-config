import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowLaunchContext } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';
import { walkthroughPaths } from '../src/paths.js';
import type { ArtifactPaths } from '../src/types.js';

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

const sources: ArtifactPaths = {
  currentStatePath: 'scratch/plans/example/artifacts/current-state.md',
  architecturePath: 'scratch/plans/example/artifacts/architecture.md',
  programDesignPath: 'scratch/plans/example/artifacts/program-design.md',
};

const reviewDirectory = 'scratch/plans/example/review';

test('command captures audience and delivery controls and starts source analysis', async () => {
  const variables = {
    story: 'https://github.com/owner/repo/issues/2',
    ...sources,
    reviewDirectory,
  };
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, 'Solution Walkthrough Story');
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    [
      'story',
      'currentStatePath',
      'architecturePath',
      'programDesignPath',
      'reviewDirectory',
      'familiarity',
      'technicalDepth',
      'deliveryMode',
    ],
  );
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), {
    stateVersion: 2,
    repositoryPath: '/workspace',
    story: variables.story,
    sources,
    paths: walkthroughPaths(reviewDirectory),
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    deliveryMode: 'presentation-first',
    stage: { kind: 'start_source_analysis' },
  });
});

test('command defaults compose with the singular story pack', async () => {
  const state = await workflow.init(launchCtx, { story: 'Story' });
  assert.deepEqual(state.sources, {
    currentStatePath: 'scratch/story/design/current-state.md',
    architecturePath: 'scratch/story/design/architecture.md',
    programDesignPath: 'scratch/story/design/program-design.md',
  });
  assert.equal(state.stateVersion, 2);
  assert.equal(state.paths.reviewDirectory, 'scratch/story/walkthrough');
});
