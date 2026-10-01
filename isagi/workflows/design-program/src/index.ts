import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { DesignProgramGraph, type DesignProgramParameters } from './graph.js';

export default defineWorkflow({
  command: () => ({
    title: 'Design Program',
    description: 'Create and independently review a story-scoped program design.',
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
        key: 'architecturePath',
        label: 'Architecture path',
        placeholder: 'scratch/architecture/issue-123.md',
      },
      {
        kind: 'text',
        key: 'artifactPath',
        label: 'Program-design artifact path',
        placeholder: 'scratch/program-design/issue-123.md',
      },
    ],
  }),
  parse: (_origin, inputs): DesignProgramParameters => ({
    story: parseText(inputs.story, 'story'),
    currentStatePath: parseText(inputs.currentStatePath, 'currentStatePath'),
    architecturePath: parseText(inputs.architecturePath, 'architecturePath'),
    artifactPath: parseText(inputs.artifactPath, 'artifactPath'),
  }),
  graph: DesignProgramGraph,
});

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
