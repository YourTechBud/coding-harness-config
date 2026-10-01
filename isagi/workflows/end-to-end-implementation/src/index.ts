import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { EndToEndImplementationGraph, type EndToEndImplementationParameters } from './graph.js';
import { deliveryMechanisms, familiarityLevels, pullRequestChoices, technicalDepthLevels } from './graphs/context.js';

type Variables = {
  readonly story?: unknown;
  readonly familiarity?: unknown;
  readonly technicalDepth?: unknown;
  readonly deliveryMechanism?: unknown;
  readonly submitPullRequest?: unknown;
};

export default defineWorkflow({
  command: () => ({
    title: 'End-to-End Implementation',
    description: 'Design, walk through, and implement one story, with optional pull-request submission.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      {
        kind: 'select',
        key: 'familiarity',
        label: 'Codebase familiarity',
        options: [
          { value: 'new', label: 'New to this codebase' },
          { value: 'familiar', label: 'Familiar with this codebase' },
        ],
        default: 'new',
      },
      {
        kind: 'select',
        key: 'technicalDepth',
        label: 'Technical depth',
        options: [
          { value: 'product', label: 'Product overview' },
          { value: 'system-design', label: 'System design' },
          { value: 'implementation', label: 'Implementation detail' },
        ],
        default: 'system-design',
      },
      {
        kind: 'select',
        key: 'deliveryMechanism',
        label: 'Walkthrough delivery mechanism?',
        options: [
          { value: 'presentation', label: 'Presentation' },
          { value: 'socratic-walkthrough', label: 'Socratic walkthrough' },
        ],
        default: 'presentation',
      },
      {
        kind: 'select',
        key: 'submitPullRequest',
        label: 'Submit pull request?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        default: 'yes',
      },
    ],
  }),
  parse: (_origin, inputs) => parseVariables(inputs),
  graph: EndToEndImplementationGraph,
});

function parseVariables(variables: Variables): EndToEndImplementationParameters {
  return {
    story: parseStory(variables.story),
    familiarity: parseEnum(variables.familiarity, 'familiarity', familiarityLevels, 'new'),
    technicalDepth: parseEnum(variables.technicalDepth, 'technicalDepth', technicalDepthLevels, 'system-design'),
    deliveryMechanism: parseEnum(variables.deliveryMechanism, 'deliveryMechanism', deliveryMechanisms, 'presentation'),
    submitPullRequest: parseEnum(variables.submitPullRequest, 'submitPullRequest', pullRequestChoices, 'yes'),
  };
}

function parseStory(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error('story must be non-empty text.');
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  key: string,
  options: T,
  fallback: T[number],
): T[number] {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate === 'string' && options.includes(candidate)) return candidate;
  throw new Error(`${key} must be one of ${options.join(', ')}.`);
}
