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
      'deliveryMechanism',
    ],
  );
  assert.deepEqual((manifest.inputs ?? []).at(-1), {
    kind: 'select',
    key: 'deliveryMechanism',
    label: 'Walkthrough delivery mechanism?',
    options: [
      { value: 'presentation', label: 'Presentation' },
      { value: 'socratic-walkthrough', label: 'Socratic walkthrough' },
    ],
    default: 'presentation',
  });
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

test('delivery mechanism selects the presentation or Socratic walkthrough branch', async () => {
  const presentation = await workflow.init(launchCtx, { story: 'Story', deliveryMechanism: 'presentation' });
  const socratic = await workflow.init(launchCtx, { story: 'Story', deliveryMechanism: 'socratic-walkthrough' });
  const legacyGuidedBoolean = await workflow.init(launchCtx, { story: 'Story', presentationMode: false });
  const legacyGuided = await workflow.init(launchCtx, { story: 'Story', deliveryMode: 'guided-tutorial' });
  assert.equal(presentation.deliveryMode, 'presentation-first');
  assert.equal(socratic.deliveryMode, 'guided-tutorial');
  assert.equal(legacyGuidedBoolean.deliveryMode, 'guided-tutorial');
  assert.equal(legacyGuided.deliveryMode, 'guided-tutorial');
  await assert.rejects(async () => workflow.validate(launchCtx, { story: 'Story', deliveryMechanism: 'guided' }));
});
