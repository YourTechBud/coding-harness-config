import assert from 'node:assert/strict';
import test from 'node:test';

import { initialReviewerPrompt, initialWriterPrompt, reviewToWriterPrompt, writerToReviewerPrompt } from '../src/prompts.js';

const input = {
  repositoryPath: '/workspace',
  story: 'https://github.com/owner/repo/issues/2',
  currentStatePath: 'scratch/current-state/issue-2.md',
  artifactPath: 'scratch/architecture/issue-2.md',
};

test('writers and reviewers distinguish story suggestions from completed analysis', () => {
  for (const prompt of [initialWriterPrompt(input), initialReviewerPrompt(input), reviewToWriterPrompt('Review'), writerToReviewerPrompt('Response')]) {
    assert.match(prompt, /story defines the bounded scope through its acceptance criteria, provided contracts, and explicitly agreed design decisions/);
    assert.match(prompt, /strong starting suggestions rather than requirements/);
    assert.match(prompt, /suggested approaches recorded in the story/);
    assert.match(prompt, /current-state analysis as completed predecessor work to build on/);
    assert.match(prompt, /simplest architecture that fulfills the binding scope/);
    assert.match(prompt, /scope change as a decision for the user/);
  }
});
