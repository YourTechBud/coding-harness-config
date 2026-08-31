import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowLaunchContext } from '@yourtechbudstudio/isagi-workflow-sdk';

import workflow from '../src/index.js';
import { walkthroughPaths } from '../src/paths.js';
import { reviewDirectory, sources } from './fixtures.js';

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command exposes only the canonical walkthrough inputs', async () => {
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), [
    'story',
    'currentStatePath',
    'architecturePath',
    'programDesignPath',
    'reviewDirectory',
    'familiarity',
    'technicalDepth',
    'deliveryMechanism',
  ]);
});

test('init creates the version-one canonical presentation state', async () => {
  const variables = {
    story: ' Story 42 ',
    ...sources,
    reviewDirectory,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'presentation',
  };
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), {
    stateVersion: 1,
    repositoryPath: '/workspace',
    story: 'Story 42',
    sources,
    paths: walkthroughPaths(reviewDirectory),
    audienceProfile: { familiarity: 'familiar', technicalDepth: 'implementation' },
    deliveryMechanism: 'presentation',
    stage: { kind: 'start_curriculum_workflow' },
  });
});

test('delivery mechanism accepts only presentation and Socratic walkthrough', async () => {
  const socratic = await workflow.init(launchCtx, { story: 'Story', deliveryMechanism: 'socratic-walkthrough' });
  assert.equal(socratic.deliveryMechanism, 'socratic-walkthrough');
  await assert.rejects(async () => workflow.validate(launchCtx, { story: 'Story', deliveryMechanism: 'guided-tutorial' }));
});
