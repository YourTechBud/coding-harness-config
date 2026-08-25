import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  completedSingleHeadlessResult,
  deckReviewRoutingPrompt,
  latestAssistantTurnText,
  parseDeckReviewRoute,
} from '../src/judgments.js';

test('parses every deck review route and rejects additional machine fields', () => {
  assert.equal(parseDeckReviewRoute('{"outcome":"complete"}'), 'complete');
  assert.equal(parseDeckReviewRoute('{"outcome":"builder"}'), 'builder');
  assert.equal(parseDeckReviewRoute('Result: {"outcome":"architect-and-builder"}'), 'architect-and-builder');
  assert.equal(parseDeckReviewRoute('{"outcome":"human-decision"}'), 'human-decision');
  assert.throws(() => parseDeckReviewRoute('{"outcome":"complete","confidence":1}'), /exactly one field/);
});

test('routing prompt defines all four cases and their precedence', () => {
  const prompt = deckReviewRoutingPrompt('# Review\n\nSuggestion: polish the footer.');
  assert.match(prompt, /every outcome is valid on every round/i);
  assert.match(prompt, /Return "human-decision"/);
  assert.match(prompt, /Return "architect-and-builder"/);
  assert.match(prompt, /Return "builder"/);
  assert.match(prompt, /Return "complete"/);
  assert.match(prompt, /Suggestions alone do not require another revision round/);
  assert.ok(prompt.indexOf('Return "human-decision"') < prompt.indexOf('Return "architect-and-builder"'));
  assert.ok(prompt.indexOf('Return "architect-and-builder"') < prompt.indexOf('Return "builder"'));
  assert.ok(prompt.indexOf('Return "builder"') < prompt.indexOf('Return "complete"'));
});

test('collects every complete assistant message in the latest revision turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'Apply the review.'),
    message('assistant', 'Changed the slide hierarchy.'),
    message('assistant', 'Declined the color suggestion as optional.'),
    { role: 'assistant', parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }] },
  ];
  assert.equal(latestAssistantTurnText(history), 'Changed the slide hierarchy.\n\nDeclined the color suggestion as optional.');
});

test('headless result inspection rejects failed routing judgments', () => {
  assert.throws(() => completedSingleHeadlessResult({
    kind: 'headless_agent',
    results: [{ opId: 'route-1', status: 'failed', error: 'provider exited' }],
  }), /provider exited/);
});

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
