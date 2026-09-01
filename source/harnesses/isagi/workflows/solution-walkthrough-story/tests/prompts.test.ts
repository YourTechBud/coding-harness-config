import assert from 'node:assert/strict';
import test from 'node:test';

import {
  genericDeckArchitecturePrompt,
  genericDeckAssemblyPrompt,
  genericDeckNeighborhoodPrompt,
  genericDeckShellPrompt,
  genericSocraticPrompt,
  type PromptInput,
} from '../src/prompts.js';
import { walkthroughPaths } from '../src/paths.js';
import { plan, sources } from './fixtures.js';

const input: PromptInput = {
  repositoryPath: '/workspace',
  story: 'Story 42',
  sources,
  paths: walkthroughPaths('review'),
  audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
};

test('deck architecture owns narrative and coverage without shell mechanics', () => {
  const prompt = genericDeckArchitecturePrompt(input);
  assert.match(prompt, /narrative architecture, not slide allocation/i);
  assert.match(prompt, /every retained coverage item exactly once/i);
  assert.match(prompt, /schemas, APIs, events, state machines, security boundaries/i);
  assert.match(prompt, /deck creator will decide how many slides/i);
  assert.doesNotMatch(prompt, /data-slide-viewport/);
  assert.doesNotMatch(prompt, /Mermaid/);
  assert.doesNotMatch(prompt, /full available browser viewport/);
});

test('shell owns the full-width presentation environment and inspectable diagrams', () => {
  const prompt = genericDeckShellPrompt(input);
  assert.match(prompt, /full available browser viewport/);
  assert.match(prompt, /overflow and scrolling dependable/);
  assert.match(prompt, /Set up Mermaid/);
  assert.match(prompt, /every rendered diagram independently inspectable/i);
  assert.match(prompt, /zoom, pan, and reset/i);
  assert.match(prompt, /does not disrupt slide navigation or ordinary slide scrolling/i);
  assert.match(prompt, /data-walkthrough-deck/);
  assert.match(prompt, /walkthrough-content-end/);
  assert.match(prompt, /not any neighborhood content/);
});

test('neighborhood and assembly prompts preserve creator freedom and protocol mappings', () => {
  const deckPlan = plan();
  const neighborhood = genericDeckNeighborhoodPrompt(input, deckPlan, deckPlan.neighborhoods[0]!, 0);
  const assembly = genericDeckAssemblyPrompt(input);
  assert.match(neighborhood, /content moments define the conclusions and coverage that must survive; they are not prescribed slides/i);
  assert.match(neighborhood, /Decide the number and order of slides/);
  assert.match(neighborhood, /data-content-moments/);
  assert.match(neighborhood, /sequence, state, flow, dependency, and data-model diagrams/i);
  assert.match(assembly, /compression pass/);
  assert.match(assembly, /Preserve the opening promise, neighborhood order, every content moment/);
  assert.match(assembly, /No model reviewer follows this assembly/);
  assert.match(assembly, /1440×900, 1280×720, and 1024×768/);
});

test('Socratic prompt teaches toward an approval judgment from the same curriculum', () => {
  const prompt = genericSocraticPrompt(input);
  assert.match(prompt, /self-paced Socratic walkthrough/);
  assert.match(prompt, /reach their own approval judgment/);
  assert.match(prompt, /schemas, APIs, events, state transitions/);
});
