import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { latestAssistantTurnText, parseUiReadiness, uiReadinessJudgmentPrompt } from '../src/judgments.js';

test('collects every complete assistant message in the latest turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'Explore the UI.'),
    message('assistant', 'Old response.'),
    message('user', 'Is anything open?'),
    message('assistant', 'One decision is open.'),
    message('assistant', 'Choose the empty-state layout.'),
    { role: 'assistant', parts: [{ type: 'text', text: 'Still streaming.', state: 'streaming' }] },
  ];
  assert.equal(latestAssistantTurnText(history), 'One decision is open.\n\nChoose the empty-state layout.');
  assert.equal(latestAssistantTurnText([message('user', 'Is anything open?')]), null);
});

test('parses UI readiness with its reason and rejects anything else', () => {
  assert.deepEqual(parseUiReadiness('{"outcome":"ready","reason":"Nothing is open."}'), { outcome: 'ready', reason: 'Nothing is open.' });
  assert.deepEqual(parseUiReadiness('Result: {"outcome":"pending","reason":" Choose a layout. "}'), { outcome: 'pending', reason: 'Choose a layout.' });
  assert.throws(() => parseUiReadiness('{"outcome":"done","reason":"Finished."}'), /ready, pending/);
  assert.throws(() => parseUiReadiness('{"outcome":"ready","reason":""}'), /nonempty/);
  assert.throws(() => parseUiReadiness('{"outcome":"ready","reason":"Done.","extra":1}'), /exactly two fields/);
  assert.throws(() => parseUiReadiness('No JSON here.'), /JSON object/);
});

test('UI readiness judgment carries the agent response and leaves document updates out of open items', () => {
  const prompt = uiReadinessJudgmentPrompt('Nothing is open.');
  assert.match(prompt, /Agent response:\nNothing is open\./);
  assert.match(prompt, /Updates to the design documents or the UI brief are not open items/);
});

function message(role: WorkflowConversationMessage['role'], text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
