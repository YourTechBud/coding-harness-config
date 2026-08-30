import assert from 'node:assert/strict';
import test from 'node:test';

import { walkthroughPaths } from '../src/paths.js';
import {
  PLAIN_LANGUAGE_STANDARD,
  QUICK_GLANCE_STANDARD,
  architectRevisionPrompt,
  builderRevisionPrompt,
  curriculumPrompt,
  deckArchitecturePrompt,
  finalAssemblyPrompt,
  narrativeUnitPrompt,
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
  schemaVersion: 3,
  curriculumPath: input.paths.curriculumPath,
  outputPath: input.paths.htmlPath,
  story: { title: 'Story 42', openingPromise: 'Understand the change', throughline: 'Follow the system', endingResolution: 'Know how it works' },
  compactnessStrategy: 'Keep one slide per distinct contribution.',
  chapters: [{
    id: 'request-lifecycle',
    kind: 'neighborhood',
    title: 'Architecture',
    storyRole: 'Explain the system relationships',
    openingContext: 'The current state is understood',
    closingSynthesis: 'The boundaries are clear',
    transitionToNext: 'Move into implementation',
    narrativeUnits: [{
      title: 'System flow',
      facet: 'architecture',
      storyPurpose: 'Explain the system flow',
      beatIds: ['request-lifecycle-01'],
      narrativeBridge: 'Follow the request through the system',
      slides: [{
        id: 'boundary-ownership',
        title: 'The boundary owns the transition',
        uniqueContribution: 'Show which boundary owns the transition.',
        requiredContent: ['Show the important boundary'],
        contractIds: [],
        representationIntent: 'A data-flow view',
        progressiveDisclosure: [],
        sourceReferences: [{ heading: 'Architecture', locator: 'design/architecture.md' }],
      }],
    }],
  }],
};

test('the curriculum stays plain and every deck-writing turn uses the quick-glance standard', () => {
  const prompts = [
    curriculumPrompt(input),
    deckArchitecturePrompt(input),
    narrativeUnitPrompt(input, plan, plan.chapters[0]!, plan.chapters[0]!.narrativeUnits[0]!, 0),
    finalAssemblyPrompt(input),
    architectRevisionPrompt(input, 1, 'Simplify the title.'),
    builderRevisionPrompt(input, 1, 'Rewrite the visible copy.'),
    verifierPrompt(input, 1),
  ];
  for (const prompt of prompts) assert.match(prompt, new RegExp(escapeRegExp(PLAIN_LANGUAGE_STANDARD)));
  for (const prompt of prompts.slice(1)) assert.match(prompt, new RegExp(escapeRegExp(QUICK_GLANCE_STANDARD)));
  assert.doesNotMatch(prompts[0]!, new RegExp(escapeRegExp(QUICK_GLANCE_STANDARD)));
  assert.match(prompts[0]!, /"languagePolicy"/);
  assert.match(prompts[0]!, /smallest curriculum/);
  assert.match(prompts[6]!, /primary layer feels like forward motion rather than a study document/);
});

test('Show Me guidance follows the selected technical depth', () => {
  const product = deckArchitecturePrompt({ ...input, audienceProfile: { familiarity: 'new', technicalDepth: 'product' } });
  const system = deckArchitecturePrompt(input);
  const implementation = deckArchitecturePrompt({ ...input, audienceProfile: { familiarity: 'new', technicalDepth: 'implementation' } });
  for (const prompt of [product, system, implementation]) assert.match(prompt, /Use the Show Me skill/);
  assert.match(product, /user journey, before-and-after comparison, or tradeoff view/);
  assert.match(system, /boundary maps, ownership views, data or control flow/);
  assert.match(implementation, /exact code and contract shapes, call trees, state transitions, diffs, algorithms, and failure paths/);
  assert.match(narrativeUnitPrompt(input, plan, plan.chapters[0]!, plan.chapters[0]!.narrativeUnits[0]!, 0), /focused representations/);
});

test('the deck architect owns compact slide allocation and the builder realizes it', () => {
  const architecture = deckArchitecturePrompt(input);
  const realization = narrativeUnitPrompt(input, plan, plan.chapters[0]!, plan.chapters[0]!.narrativeUnits[0]!, 0);
  for (const field of ['openingPromise', 'throughline', 'endingResolution', 'storyRole', 'compactnessStrategy', 'narrativeUnits', 'uniqueContribution', 'contractIds']) assert.match(architecture, new RegExp(field));
  assert.match(architecture, /Plan the story and every content slide/);
  assert.match(realization, /realize exactly the planned slides/i);
  assert.match(realization, /data-walkthrough-chapter="request-lifecycle"/);
  assert.match(realization, /data-walkthrough-facet="architecture"/);
});

test('each review round requests a complete standalone Markdown artifact', () => {
  const prompt = verifierPrompt(input, 2, {
    review: 'Prior review evidence.',
    architectResponse: 'Architect changed the plan.',
    builderResponse: 'Builder changed the deck.',
  });
  for (const heading of ['Review scope', 'Prior finding verification', 'Findings', 'Human decision', 'Conclusion']) assert.match(prompt, new RegExp(`## ${heading}`));
  for (const field of ['responsibility', 'affected area', 'evidence', 'consequence', 'required outcome', 'verification']) assert.match(prompt, new RegExp(field, 'i'));
  for (const severity of ['Blocker', 'Concern', 'Suggestion']) assert.match(prompt, new RegExp(severity));
  for (const responsibility of ['Deck architecture', 'Deck implementation', 'Human decision']) assert.match(prompt, new RegExp(responsibility));
  assert.match(prompt, /round-02\.md/);
  assert.match(prompt, /Prior review evidence/);
  assert.match(prompt, /Architect changed the plan/);
  assert.match(prompt, /Builder changed the deck/);
  assert.match(prompt, /Suggestions never require another round/);
  assert.match(prompt, /stable ID/);
  assert.match(prompt, /no slide-count target/);
  assert.match(prompt, /must move directly from architecture to the program design/);
  assert.match(prompt, /every materially changed contract/i);
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

test('architect revisions preserve the exact deck-plan schema', () => {
  const prompt = architectRevisionPrompt(input, 1, 'Merge repeated slides.');
  assert.match(prompt, /validated against exact object key sets/);
  assert.match(prompt, /keep schemaVersion, curriculumPath, and outputPath unchanged/);
  assert.match(prompt, /do not add, remove, or rename object fields/);
  assert.match(prompt, /changing field values or array items within that schema/);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
