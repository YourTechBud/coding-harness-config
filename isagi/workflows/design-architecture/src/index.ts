import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { DesignArchitectureGraph, type DesignArchitectureParameters } from './graph.js';

export default defineWorkflow({
  command: () => ({
    title: 'Design Architecture',
    description: 'Create and independently review a story-scoped target architecture.',
    inputs: [
      {
        kind: 'text',
        key: 'story',
        label: 'Story or story URL',
        placeholder: 'https://github.com/owner/repository/issues/123',
      },
      {
        kind: 'text',
        key: 'currentStatePath',
        label: 'Current-state analysis path',
        placeholder: 'scratch/current-state/issue-123.md',
      },
      {
        kind: 'text',
        key: 'artifactPath',
        label: 'Architecture artifact path',
        placeholder: 'scratch/architecture/issue-123.md',
      },
    ],
  }),
  parse: (_origin, inputs): DesignArchitectureParameters => ({
    story: parseText(inputs.story, 'story'),
    currentStatePath: parseText(inputs.currentStatePath, 'currentStatePath'),
    artifactPath: parseText(inputs.artifactPath, 'artifactPath'),
  }),
  graph: DesignArchitectureGraph,
});

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
