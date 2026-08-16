import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parseReviewerRoute,
  parseWriterRoute,
  reviewerRoutingPrompt,
  writerRoutingPrompt,
} from '../src/judgments.js';
import { PROMPT_FOOTER } from '../src/prompts.js';

test('collects every complete assistant message in the latest turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'Write it.'),
    message('assistant', 'Old response.'),
    message('user', 'Apply the review.'),
    message('assistant', 'Updated the artifact.'),
    message('assistant', 'Pushed back on one finding with evidence.'),
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }],
    },
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'Updated the artifact.\n\nPushed back on one finding with evidence.',
  );
});

test('parses every writer and reviewer route and rejects extra fields', () => {
  assert.equal(parseWriterRoute('{"outcome":"ready"}'), 'ready');
  assert.equal(parseWriterRoute('{"outcome":"failed"}'), 'failed');
  assert.equal(parseReviewerRoute('{"outcome":"complete"}'), 'complete');
  assert.equal(parseReviewerRoute('{"outcome":"revise"}'), 'revise');
  assert.equal(
    parseReviewerRoute('Result: {"outcome":"human-decision"}'),
    'human-decision',
  );
  assert.throws(
    () => parseReviewerRoute('{"outcome":"complete","confidence":1}'),
    /exactly one field/,
  );
});

test('writer judgment uses one phase-independent contract and the required footer', () => {
  const prompt = writerRoutingPrompt({
    writerResponse: 'The artifact is ready.',
    artifactPath: 'scratch/current-state.md',
  });
  assert.match(prompt, /Every outcome is valid on every invocation/);
  assert.match(prompt, /pushes back on others/);
  assert.match(prompt, /"failed"/);
  assert.equal(prompt.endsWith(PROMPT_FOOTER), true);
});

test('reviewer judgment gives explicit escalation precedence and the required footer', () => {
  const prompt = reviewerRoutingPrompt({
    review: '## Human Escalation\n\nEscalation required: choose ownership.',
  });
  assert.ok(prompt.indexOf('Return "human-decision"') < prompt.indexOf('Return "complete"'));
  assert.match(prompt, /held finding/);
  assert.match(prompt, /Optional findings may coexist with completion/);
  assert.match(prompt, /any Blocker or Concern/);
  assert.match(prompt, /No re-review needed/);
  assert.equal(prompt.endsWith(PROMPT_FOOTER), true);
});

test('headless result inspection rejects failed judgments', () => {
  assert.throws(
    () =>
      completedSingleHeadlessResult({
        kind: 'headless_agent',
        results: [{ opId: 'judge-1', status: 'failed', error: 'provider exited' }],
      }),
    /provider exited/,
  );
});

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
