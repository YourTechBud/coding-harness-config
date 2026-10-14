import assert from 'node:assert/strict';
import test from 'node:test';

import {
  genericDeckArchitecturePrompt,
  genericDeckAssemblyPrompt,
  genericDeckNeighborhoodPrompt,
  genericDeckShellPrompt,
  genericLessonPlanPrompt,
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

test('lesson plan sequences lean stops with interface cards, call triage, and a verified fact sheet', () => {
  const prompt = genericLessonPlanPrompt(input);
  assert.match(prompt, /Audience: new to this codebase; wants system-design depth\./);
  assert.match(prompt, /about five to eight stops/);
  assert.match(prompt, /Interface card: .*Include it whatever the audience depth/);
  assert.match(prompt, /Your calls are choices with at least two viable options/);
  assert.match(prompt, /Fact sheet\./);
  assert.match(prompt, /Write only review\/\.walkthrough\/lesson-plan\.md/);
  assert.match(prompt, /Work unattended/);
});

test('Socratic guide teaches from the lesson plan toward the review calls at a whiteboard pace', () => {
  const prompt = genericSocraticPrompt(input);
  assert.match(prompt, /Lesson plan: review\/\.walkthrough\/lesson-plan\.md/);
  assert.match(prompt, /made the real review calls on it/);
  assert.match(prompt, /Always show the interface layer, whatever the audience depth/);
  assert.match(prompt, /say continue and I'll record my recommendation as your leaning/);
  assert.match(prompt, /Show only the rows that changed/);
  assert.match(prompt, /State at most two such choices in a message/);
  assert.doesNotMatch(prompt, /Work unattended/);
});
