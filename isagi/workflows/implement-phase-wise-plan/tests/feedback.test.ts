import assert from 'node:assert/strict';
import test from 'node:test';

import { renderWorkflowStatus } from '../src/feedback.js';

test('severe flag feedback is an actionable warning', () => {
  assert.deepEqual(renderWorkflowStatus({ kind: 'severe-flag', phase: 2 }), {
    kind: 'warning',
    phase: 'human-intervention',
    message:
      'Phase 2 paused — the planner raised a severe flag.\n\nResolve it in the planner pane, then Continue. The latest planner response will be sent to the implementer verbatim.',
  });
});

test('review and draft commit statuses describe the post-phase work', () => {
  assert.deepEqual(renderWorkflowStatus({ kind: 'auto-review', phase: 2, phaseCount: 4 }), {
    kind: 'info',
    phase: 'phase-auto-review',
    message: 'Reviewing phase 2 of 4',
  });
  assert.deepEqual(renderWorkflowStatus({ kind: 'draft-commit', phase: 2, phaseCount: 4 }), {
    kind: 'info',
    phase: 'phase-draft-commit',
    message: 'Creating a draft commit for phase 2 of 4',
  });
});

test('classifier activity is represented by business-facing alignment feedback', () => {
  assert.deepEqual(renderWorkflowStatus({ kind: 'planner-reviewing', phase: 3, phaseCount: 5 }), {
    kind: 'info',
    phase: 'phase-alignment',
    message: 'Planner reviewing phase 3 of 5',
  });
});
