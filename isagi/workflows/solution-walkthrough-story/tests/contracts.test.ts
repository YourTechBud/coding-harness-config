import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validatePresentation } from '../src/contracts.js';
import { walkthroughPaths } from '../src/paths.js';
import { assembledHtml, plan, reviewDirectory, write } from './fixtures.js';

test('presentation validation counts DOM slides without counting commented examples', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, assembledHtml());
    assert.deepEqual(validatePresentation(repositoryPath, paths.htmlPath, plan()), {
      neighborhoodCount: 1,
      contentMomentCount: 1,
      substantiveSlideCount: 1,
      totalSlideCount: 2,
      coverageItemCount: 2,
    });
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('presentation validation rejects missing and unknown content moments', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, assembledHtml('unknown-moment'));
    assert.throws(() => validatePresentation(repositoryPath, paths.htmlPath, plan()), /unknown content moment IDs/);
    write(repositoryPath, paths.htmlPath, assembledHtml('').replace(' data-content-moments=""', ''));
    assert.throws(() => validatePresentation(repositoryPath, paths.htmlPath, plan()), /does not realize/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('presentation validation rejects an unfinished shell', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, assembledHtml().replace('</div>', '<!-- walkthrough-content-end --></div>'));
    assert.throws(() => validatePresentation(repositoryPath, paths.htmlPath, plan()), /insertion marker/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
