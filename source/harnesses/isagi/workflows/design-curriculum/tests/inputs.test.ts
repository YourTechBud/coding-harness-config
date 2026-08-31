import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseInputs } from '../src/inputs.js';
import { variables, writeSources } from './fixtures.js';

test('direct invocation accepts newline-separated Markdown paths', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-input-'));
  try {
    writeSources(repositoryPath);
    const parsed = parseInputs(repositoryPath, { ...variables(), sources: 'docs/current.md\ndocs/proposal.md' });
    assert.deepEqual(parsed.sources.map(({ id, path, description }) => ({ id, path, description })), [
      { id: 'current', path: 'docs/current.md', description: null },
      { id: 'proposal', path: 'docs/proposal.md', description: null },
    ]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('child invocation accepts a structured source array with descriptions', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-input-'));
  try {
    writeSources(repositoryPath);
    const parsed = parseInputs(repositoryPath, variables());
    assert.equal(parsed.sources[1]?.description, 'The proposed design');
    assert.equal(parsed.audience.depth, 'The audience needs system relationships and consequential contracts.');
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('inputs reject missing Markdown sources and paths outside the repository', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-input-'));
  try {
    writeSources(repositoryPath);
    assert.throws(() => parseInputs(repositoryPath, { ...variables(), sources: 'docs/missing.md' }), /does not exist/);
    assert.throws(() => parseInputs(repositoryPath, { ...variables(), outputDirectory: '../outside' }), /inside the repository/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
