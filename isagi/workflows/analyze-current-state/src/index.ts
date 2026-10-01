import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { AnalyzeCurrentStateGraph, type AnalyzeCurrentStateParameters } from './graph.js';

export default defineWorkflow({
  command: () => ({
    title: 'Analyze Current State',
    description: 'Create and independently review a story-scoped current-state analysis.',
    inputs: [
      {
        kind: 'text',
        key: 'story',
        label: 'Story or story URL',
        placeholder: 'https://github.com/owner/repository/issues/123',
      },
      {
        kind: 'text',
        key: 'artifactPath',
        label: 'Markdown artifact path',
        placeholder: 'scratch/current-state/issue-123.md',
      },
    ],
  }),
  parse: (_origin, inputs): AnalyzeCurrentStateParameters => ({
    story: parseText(inputs.story, 'story'),
    artifactPath: parseText(inputs.artifactPath, 'artifactPath'),
  }),
  graph: AnalyzeCurrentStateGraph,
});

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
