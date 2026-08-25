import assert from 'node:assert/strict';
import test from 'node:test';

import { walkthroughV2Paths } from '../src/paths.js';
import { architectRevisionPrompt, builderRevisionPrompt, verifierPrompt, type V2PromptInput } from '../src/v2-prompts.js';

const input: V2PromptInput = {
  repositoryPath: '/workspace',
  story: 'Story 42',
  sources: {
    currentStatePath: 'design/current-state.md',
    architecturePath: 'design/architecture.md',
    programDesignPath: 'design/program-design.md',
  },
  paths: walkthroughV2Paths('review'),
  audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
};

test('each review round requests a complete standalone Markdown artifact', () => {
  const prompt = verifierPrompt(input, 2, {
    review: 'Prior review evidence.',
    architectResponse: 'Architect changed the plan.',
    builderResponse: 'Builder changed the deck.',
  });
  for (const heading of ['Review scope', 'Prior finding verification', 'Findings', 'Human decision', 'Conclusion']) assert.match(prompt, new RegExp(`## ${heading}`));
  for (const field of ['responsibility', 'affected area', 'evidence', 'consequence', 'required outcome', 'next review can verify']) assert.match(prompt, new RegExp(field, 'i'));
  for (const severity of ['Blocker', 'Concern', 'Suggestion']) assert.match(prompt, new RegExp(severity));
  for (const responsibility of ['Deck architecture', 'Deck implementation', 'Human decision']) assert.match(prompt, new RegExp(responsibility));
  assert.match(prompt, /round-02\.md/);
  assert.match(prompt, /Prior review evidence/);
  assert.match(prompt, /Architect changed the plan/);
  assert.match(prompt, /Builder changed the deck/);
  assert.match(prompt, /Suggestions are optional and never require another revision round/);
  assert.match(prompt, /stable ID across rounds/);
  assert.match(prompt, /one or more of/);
  assert.doesNotMatch(prompt, /schemaVersion/);
});

test('revision prompts receive the review and agent handoff text verbatim without response files', () => {
  const review = '# Review\n\nConcern: navigation loses focus.';
  const architect = architectRevisionPrompt(input, 1, review);
  const builder = builderRevisionPrompt(input, 1, review, 'Architect kept the existing plan.');
  assert.match(architect, /Concern: navigation loses focus/);
  assert.match(builder, /Concern: navigation loses focus/);
  assert.match(builder, /Architect kept the existing plan/);
  assert.match(architect, /Modify only review\/\.walkthrough\/deck-plan\.json/);
  assert.match(builder, /Modify only review\/walkthrough\.html/);
  assert.doesNotMatch(`${architect}\n${builder}`, /revision-response\.json/);
});
