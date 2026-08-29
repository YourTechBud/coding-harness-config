import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { walkthroughPaths } from './paths.js';
import {
  deliveryModes,
  familiarityLevels,
  technicalDepthLevels,
  type ArtifactPaths,
  type DeliveryMode,
  type Familiarity,
  type TechnicalDepth,
} from './types.js';
import { step, type State } from './workflow.js';

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
  readonly reviewDirectory?: unknown;
  readonly familiarity?: unknown;
  readonly technicalDepth?: unknown;
  readonly deliveryMechanism?: unknown;
  readonly presentationMode?: unknown;
  readonly deliveryMode?: unknown;
};

const deliveryMechanisms = ['presentation', 'socratic-walkthrough'] as const;
type DeliveryMechanism = (typeof deliveryMechanisms)[number];

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Solution Walkthrough Story',
    description: 'Prepare and interactively guide the user through a designed story solution.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state source path', default: 'scratch/story/design/current-state.md' },
      { kind: 'text', key: 'architecturePath', label: 'Architecture source path', default: 'scratch/story/design/architecture.md' },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design source path', default: 'scratch/story/design/program-design.md' },
      { kind: 'text', key: 'reviewDirectory', label: 'Walkthrough output directory', default: 'scratch/story/walkthrough' },
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
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 2,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      sources: parsed.sources,
      paths: walkthroughPaths(parsed.reviewDirectory),
      audienceProfile: {
        familiarity: parsed.familiarity,
        technicalDepth: parsed.technicalDepth,
      },
      deliveryMode: parsed.deliveryMode,
      stage: { kind: 'start_source_analysis' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Walk through story stage=${state.stage.kind}.`);
    return step(ctx, state, incoming);
  },
});

function parseVariables(variables: Variables): {
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly reviewDirectory: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMode: DeliveryMode;
} {
  return {
    story: parseText(variables.story, 'story'),
    sources: {
      currentStatePath: parsePath(variables.currentStatePath, 'currentStatePath', 'scratch/story/design/current-state.md'),
      architecturePath: parsePath(variables.architecturePath, 'architecturePath', 'scratch/story/design/architecture.md'),
      programDesignPath: parsePath(variables.programDesignPath, 'programDesignPath', 'scratch/story/design/program-design.md'),
    },
    reviewDirectory: parsePath(variables.reviewDirectory, 'reviewDirectory', 'scratch/story/walkthrough'),
    familiarity: parseEnum(variables.familiarity, 'familiarity', familiarityLevels, 'new'),
    technicalDepth: parseEnum(variables.technicalDepth, 'technicalDepth', technicalDepthLevels, 'system-design'),
    deliveryMode: parseDeliveryMechanism(variables.deliveryMechanism, variables.presentationMode, variables.deliveryMode),
  };
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}

function parsePath(value: unknown, key: string, fallback: string): string {
  if (value === undefined) return fallback;
  return parseText(value, key);
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

function parseDeliveryMechanism(value: unknown, legacyPresentationMode: unknown, legacyDeliveryMode: unknown): DeliveryMode {
  if (value !== undefined) return deliveryModeFor(parseEnum(value, 'deliveryMechanism', deliveryMechanisms, 'presentation'));
  if (legacyPresentationMode !== undefined) {
    if (typeof legacyPresentationMode === 'boolean') return legacyPresentationMode ? 'presentation-first' : 'guided-tutorial';
    throw new Error('presentationMode must be a boolean.');
  }
  return parseEnum(legacyDeliveryMode, 'deliveryMode', deliveryModes, 'presentation-first');
}

function deliveryModeFor(deliveryMechanism: DeliveryMechanism): DeliveryMode {
  return deliveryMechanism === 'presentation' ? 'presentation-first' : 'guided-tutorial';
}
