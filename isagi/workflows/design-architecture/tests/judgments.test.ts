import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
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
    message('assistant', 'Updated the architecture.'),
    message('assistant', 'Pushed back on one finding with evidence.'),
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }],
    },
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'Updated the architecture.\n\nPushed back on one finding with evidence.',
  );
});

test('parses writer and reviewer decisions with an explanation', () => {
  assert.deepEqual(parseWriterRoute('{"outcome":"ready","reason":"Done."}'), { outcome: 'ready', reason: 'Done.' });
  assert.deepEqual(parseWriterRoute('{"outcome":"incomplete","reason":"Writing remains."}'), { outcome: 'incomplete', reason: 'Writing remains.' });
  assert.deepEqual(parseWriterRoute('{"outcome":"human-decision","reason":"Choose U1."}'), { outcome: 'human-decision', reason: 'Choose U1.' });
  assert.deepEqual(parseReviewerRoute('{"outcome":"complete","reason":"Accepted."}'), { outcome: 'complete', reason: 'Accepted.' });
  assert.deepEqual(parseReviewerRoute('{"outcome":"revise","reason":"Correct the owner."}'), { outcome: 'revise', reason: 'Correct the owner.' });
  assert.deepEqual(parseReviewerRoute('Result: {"outcome":"human-decision","reason":"Choose U1."}'), { outcome: 'human-decision', reason: 'Choose U1.' });
});

test('writer judgment uses one phase-independent contract and the required footer', () => {
  const prompt = writerRoutingPrompt({
    writerResponse: 'The architecture is ready.',
    artifactPath: 'scratch/architecture.md',
    artifactExists: true,
  });
  assert.match(prompt, /Every outcome is valid on every invocation/);
  assert.match(prompt, /pushes back on others/);
  assert.match(prompt, /"incomplete"/);
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

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
