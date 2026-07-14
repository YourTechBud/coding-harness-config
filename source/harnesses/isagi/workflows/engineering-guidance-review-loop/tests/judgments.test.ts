import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parseReviewRoute,
  reviewRoutingPrompt,
} from '../src/judgments.js';

test('collects every complete assistant message in the latest turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'First review.'),
    message('assistant', 'Old response.'),
    message('user', 'Re-review this.'),
    message('assistant', 'Fix verification: verified.'),
    message('assistant', 'No concerns remain.'),
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }],
    },
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'Fix verification: verified.\n\nNo concerns remain.',
  );
});

test('parses the routing outcomes and rejects extra fields', () => {
  assert.equal(parseReviewRoute('{"outcome":"continue"}'), 'continue');
  assert.equal(parseReviewRoute('{"outcome":"final-fixer"}'), 'final-fixer');
  assert.equal(parseReviewRoute('Result: {"outcome":"human-decision"}'), 'human-decision');
  assert.equal(parseReviewRoute('{"outcome":"complete"}'), 'complete');
  assert.throws(
    () => parseReviewRoute('{"outcome":"continue","confidence":1}'),
    /exactly one field/,
  );
});

test('routing prompt maps every edge without assuming a workflow phase', () => {
  const prompt = reviewRoutingPrompt({ review: 'Nit: rename the helper.' });
  assert.match(prompt, /one or more actual Nit findings/);
  assert.match(prompt, /A Nit is never a disagreement/);
  assert.match(prompt, /every outcome below is valid on every invocation/);
  assert.match(prompt, /before or after a fixer response/);
  assert.doesNotMatch(prompt, /Has the implementer already responded/);
});

test('headless result inspection rejects failed routing operations', () => {
  assert.throws(
    () =>
      completedSingleHeadlessResult({
        kind: 'headless_agent',
        results: [{ opId: 'route-1', status: 'failed', error: 'provider exited' }],
      }),
    /provider exited/,
  );
});

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
