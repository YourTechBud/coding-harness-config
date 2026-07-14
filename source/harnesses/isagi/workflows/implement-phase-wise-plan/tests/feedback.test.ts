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

test('classifier activity is represented by business-facing alignment feedback', () => {
  assert.deepEqual(renderWorkflowStatus({ kind: 'planner-reviewing', phase: 3, phaseCount: 5 }), {
    kind: 'info',
    phase: 'phase-alignment',
    message: 'Planner reviewing phase 3 of 5',
  });
});
