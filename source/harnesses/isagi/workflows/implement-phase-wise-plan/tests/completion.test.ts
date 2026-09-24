import assert from 'node:assert/strict';
import test from 'node:test';

import { completionReportPrompt } from '../src/completion.js';
import { renderWorkflowStatus } from '../src/feedback.js';

const phase = { phaseNumber: 2, phaseCount: 4, entryPlanPath: 'plans/index.md' };

test('pre-review prompt checks the whole phase and reports remaining work to the planner', () => {
  const prompt = completionReportPrompt({ ...phase, checkpoint: 'before-review', autoReview: true });
  assert.match(prompt, /phase 2 of 4 in plans\/index.md/);
  assert.match(prompt, /entire agreed phase scope/);
  assert.match(prompt, /current understanding and the necessary questions for the planner/);
  assert.match(prompt, /reporting only; do not implement changes/);
  assert.match(prompt, /human verification separately/);
});

for (const autoReview of [false, true]) {
  test(`final prompt separates outstanding work and verification with review=${autoReview}`, () => {
    const prompt = completionReportPrompt({ ...phase, checkpoint: 'after-review', autoReview });
    assert.match(prompt, autoReview ? /^Automatic review has completed/ : /^Automatic review is disabled/);
    assert.match(prompt, /## Anything left in the phase/);
    assert.match(prompt, /## Anything the human needs to verify/);
    assert.match(prompt, /previously identified checks that have not been completed/);
    assert.match(prompt, /Any question or request for planner confirmation returns to the planner.*including non-blocking questions/);
    assert.match(prompt, /Repeat checks only when changes or unresolved failures make that evidence stale/);
    assert.match(prompt, /reporting only; do not implement changes/);
  });
}

test('completion feedback distinguishes both gates', () => {
  assert.deepEqual(renderWorkflowStatus({ kind: 'completion-check', phase: 2, phaseCount: 4, checkpoint: 'before-review' }), {
    kind: 'info', phase: 'phase-completeness', message: 'Checking phase 2 of 4: remaining implementation work.',
  });
  assert.deepEqual(renderWorkflowStatus({ kind: 'completion-check', phase: 2, phaseCount: 4, checkpoint: 'after-review' }), {
    kind: 'info', phase: 'phase-final-check', message: 'Checking phase 2 of 4: remaining work and required human verification.',
  });
});
