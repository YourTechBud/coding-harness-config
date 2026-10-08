import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReviewerRoute, parseWriterRoute, REVIEWER_ESCALATION_AND_CLOSURE, REVIEWER_ROUTING_INSTRUCTIONS, WRITER_ROUTING_INSTRUCTIONS } from '../src/artifact-routing.js';

test('routing requires an actionable reason and rejects unsupported or ambiguous shapes', () => {
  for (const parse of [parseWriterRoute, parseReviewerRoute]) {
    for (const output of [
      '{}',
      '[]',
      '{"outcome":"human-decision"}',
      '{"outcome":"human-decision","reason":""}',
      '{"outcome":"human-decision","reason":"   "}',
      '{"outcome":"human-decision","reason":3}',
      '{"outcome":"human-decision","reason":"Choose U1.","confidence":1}',
      '{"outcome":"failed","reason":"Not a writing outcome."}',
      'not json',
    ]) assert.throws(() => parse(output), `reject ${output}`);
    assert.deepEqual(parse('Result: {"reason":" Choose U1. ","outcome":"human-decision"}'), { outcome: 'human-decision', reason: 'Choose U1.' });
  }
  assert.throws(() => parseWriterRoute('{"outcome":"complete","reason":"Accepted."}'));
  assert.throws(() => parseReviewerRoute('{"outcome":"ready","reason":"Written."}'));
});

test('a completed revision with a blocking decision is routed before readiness or incompleteness', () => {
  assert.ok(WRITER_ROUTING_INSTRUCTIONS.indexOf('Return "human-decision"') < WRITER_ROUTING_INSTRUCTIONS.indexOf('Return "ready"'));
  assert.match(WRITER_ROUTING_INSTRUCTIONS, /takes precedence even when the file exists/);
  assert.match(WRITER_ROUTING_INSTRUCTIONS, /Ready for review is separate from reviewer acceptance/);
  assert.match(WRITER_ROUTING_INSTRUCTIONS, /nonblocking recorded uncertainty/);
});

test('reviewers escalate a required scope decision even when both agents agree or the section says no escalation', () => {
  assert.match(REVIEWER_ESCALATION_AND_CLOSURE, /Escalate this decision even when you and the writer agree/);
  assert.match(REVIEWER_ROUTING_INSTRUCTIONS, /contradictory "No escalation\."/);
  assert.ok(REVIEWER_ROUTING_INSTRUCTIONS.indexOf('Return "human-decision"') < REVIEWER_ROUTING_INSTRUCTIONS.indexOf('Return "complete"'));
});
