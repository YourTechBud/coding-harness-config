import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parsePlannerRoute,
  parseSlug,
} from '../src/judgments.js';

test('collects every complete assistant message in the latest turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'Create the plan.'),
    message('assistant', 'Old response.'),
    message('user', 'Use the reviewed artifacts.'),
    message('assistant', 'Created the plan.'),
    message('assistant', 'Entry point: scratch/plans/example/index.md'),
    {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }],
    },
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'Created the plan.\n\nEntry point: scratch/plans/example/index.md',
  );
});

test('parses a strict safe slug', () => {
  assert.equal(parseSlug('{"slug":"add-session-recovery"}'), 'add-session-recovery');
  assert.throws(() => parseSlug('{"slug":"Add Session Recovery"}'), /lowercase ASCII/);
  assert.throws(
    () => parseSlug('{"slug":"valid","confidence":1}'),
    /must contain exactly/,
  );
  assert.throws(() => parseSlug(`{"slug":"${'a'.repeat(64)}"}`), /under 64/);
});

test('parses both planner routes and rejects extra fields', () => {
  assert.equal(parsePlannerRoute('{"outcome":"ready"}'), 'ready');
  assert.equal(parsePlannerRoute('Result: {"outcome":"failed"}'), 'failed');
  assert.throws(
    () => parsePlannerRoute('{"outcome":"ready","confidence":1}'),
    /must contain exactly/,
  );
});

test('headless result inspection rejects failed operations', () => {
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
