import assert from 'node:assert/strict';
import test from 'node:test';

import { walkthroughPaths } from '../src/paths.js';
import {
  PLAIN_LANGUAGE_STANDARD,
  architectRevisionPrompt,
  builderRevisionPrompt,
  curriculumPrompt,
  deckArchitecturePrompt,
  finalAssemblyPrompt,
  realizationUnitPrompt,
  verifierPrompt,
  type PromptInput,
} from '../src/prompts.js';
import type { DeckPlan } from '../src/types.js';

const input: PromptInput = {
  repositoryPath: '/workspace',
  story: 'Story 42',
  sources: {
    currentStatePath: 'design/current-state.md',
    architecturePath: 'design/architecture.md',
    programDesignPath: 'design/program-design.md',
  },
  paths: walkthroughPaths('review'),
  audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
};

const plan: DeckPlan = {
  schemaVersion: 1,
  curriculumPath: input.paths.curriculumPath,
  outputPath: input.paths.htmlPath,
  slides: [{
    id: 'system-flow',
    chapterId: 'architecture',
    beatIds: ['ar-01'],
    title: 'System flow',
    purpose: 'Explain the system flow',
    contentResponsibilities: ['Show the important boundary'],
    representationIntent: 'A data-flow view',
    progressiveDisclosure: [],
  }],
  realizationUnits: [{ id: 'architecture-flow', slideIds: ['system-flow'] }],
};

test('the curriculum and every deck-writing turn share one plain-language standard', () => {
  const prompts = [
    curriculumPrompt(input),
    deckArchitecturePrompt(input),
    realizationUnitPrompt(input, plan, plan.realizationUnits[0]!),
    finalAssemblyPrompt(input),
    architectRevisionPrompt(input, 1, 'Simplify the title.'),
    builderRevisionPrompt(input, 1, 'Rewrite the visible copy.'),
    verifierPrompt(input, 1),
  ];
  for (const prompt of prompts) assert.match(prompt, new RegExp(escapeRegExp(PLAIN_LANGUAGE_STANDARD)));
  assert.match(prompts[0]!, /"languagePolicy"/);
  assert.match(prompts[0]!, /smallest set of beats and required content/);
  assert.match(prompts[6]!, /Technical depth never excuses difficult wording/);
  assert.match(prompts[6]!, /factually complete and still require revision for unclear language/);
});

test('Show Me guidance follows the selected technical depth', () => {
  const product = deckArchitecturePrompt({ ...input, audienceProfile: { familiarity: 'new', technicalDepth: 'product' } });
  const system = deckArchitecturePrompt(input);
  const implementation = deckArchitecturePrompt({ ...input, audienceProfile: { familiarity: 'new', technicalDepth: 'implementation' } });
  for (const prompt of [product, system, implementation]) assert.match(prompt, /Use the Show Me skill/);
  assert.match(product, /user journey, before-and-after comparison, or tradeoff view/);
  assert.match(system, /boundary maps, ownership views, data or control flow/);
  assert.match(implementation, /code-shape sketches, call trees, state transitions, diffs, algorithms, and failure paths/);
  assert.match(realizationUnitPrompt(input, plan, plan.realizationUnits[0]!), /representations that reduce explanation rather than decorate it/);
});

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
