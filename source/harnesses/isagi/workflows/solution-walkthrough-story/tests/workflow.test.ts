import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowOrigin } from '@yourtechbudstudio/isagi-workflow-sdk';

import { SolutionWalkthroughGraph } from '../src/graph.js';
import workflow from '../src/index.js';
import { walkthroughPaths } from '../src/paths.js';
import { reviewDirectory, sources } from './fixtures.js';

const origin: WorkflowOrigin = {
  worktreeId: 1,
  worktreePath: '/workspace',
  surfaceId: 7,
};

test('command exposes only the canonical walkthrough inputs', async () => {
  const manifest = await workflow.command(origin);
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

test('parse and init create the canonical presentation state', async () => {
  const parameters = await workflow.parse(origin, {
    story: ' Story 42 ',
    ...sources,
    reviewDirectory,
    familiarity: 'familiar',
    technicalDepth: 'implementation',
    deliveryMechanism: 'presentation',
  });
  assert.deepEqual(parameters, {
    story: 'Story 42',
    sources,
    reviewDirectory,
    audienceProfile: { familiarity: 'familiar', technicalDepth: 'implementation' },
    deliveryMechanism: 'presentation',
  });
  const state = SolutionWalkthroughGraph.init({ worktreeId: 2, worktreePath: '/destination', surfaceId: 9 }, parameters);
  assert.deepEqual(state.context.paths, walkthroughPaths(reviewDirectory));
});

test('delivery mechanism accepts only presentation and Socratic walkthrough', async () => {
  const socratic = await workflow.parse(origin, { story: 'Story', deliveryMechanism: 'socratic-walkthrough' });
  assert.equal(socratic.deliveryMechanism, 'socratic-walkthrough');
  assert.throws(() => workflow.parse(origin, { story: 'Story', deliveryMechanism: 'guided-tutorial' }), /deliveryMechanism must be one of/);
});
