import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { EngineeringGuidanceReviewGraph, type EngineeringGuidanceReviewParameters } from './graph.js';

export default defineWorkflow({
  command: () => ({
    title: 'Engineering Guidance Review Loop',
    description: 'Route a code review between a reviewer and fixer until the reviewer closes it.',
    inputs: [
      {
        kind: 'text',
        key: 'context',
        label: 'Review scope, goal, and context',
        placeholder: 'Review the working tree changes relative to HEAD against…',
      },
    ],
  }),
  // The launching agent, when there is one, becomes the fixer.
  parse: (origin, inputs): EngineeringGuidanceReviewParameters => ({
    context: parseContext(inputs.context),
    fixerSessionId: origin.agentSessionId ?? null,
  }),
  graph: EngineeringGuidanceReviewGraph,
});

function parseContext(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error('context must be non-empty free-form text.');
}
