import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  latestAssistantTurnText,
  parsePlannerRoute,
} from '../src/judgments.js';

test('collects every complete assistant message in the latest turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'Create the plan.'),
    message('assistant', 'Old response.'),
    message('user', 'Use the reviewed artifacts.'),
    message('assistant', 'Created the plan.'),
    message('assistant', 'Entry point: scratch/story/implementation/index.md'),
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }],
    },
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'Created the plan.\n\nEntry point: scratch/story/implementation/index.md',
  );
});

test('parses both planner routes and rejects extra fields', () => {
  assert.equal(parsePlannerRoute('{"outcome":"ready"}'), 'ready');
  assert.equal(parsePlannerRoute('Result: {"outcome":"failed"}'), 'failed');
  assert.throws(
    () => parsePlannerRoute('{"outcome":"ready","confidence":1}'),
    /must contain exactly/,
  );
});

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
