import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { parseInputs, type Variables } from './inputs.js';
import { step, type State } from './workflow.js';

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Design Curriculum',
    description: 'Create a focused curriculum from one or more Markdown sources.',
    inputs: [
      { kind: 'text', key: 'sources', label: 'Markdown source paths, one per line', placeholder: 'docs/source-one.md\ndocs/source-two.md' },
      { kind: 'text', key: 'learningGoal', label: 'What should the audience understand or be able to decide?' },
      { kind: 'text', key: 'audienceFamiliarity', label: 'Describe what the audience already knows', default: 'The audience is new to the subject and needs essential context.' },
      { kind: 'text', key: 'audienceDepth', label: 'Describe the depth of understanding needed', default: 'The audience needs enough depth to understand and make the decision described by the learning goal.' },
      { kind: 'text', key: 'teachingBrief', label: 'Optional teaching guidance', default: 'Choose the clearest storyline for this audience and learning goal.' },
      { kind: 'text', key: 'outputDirectory', label: 'Curriculum output directory', default: 'scratch/story/curriculum' },
    ],
  }),
  validate: (launchCtx, variables) => {
    parseInputs(launchCtx.worktreePath, variables);
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 1,
    input: parseInputs(launchCtx.worktreePath, variables),
    stage: { kind: 'start_analysis' },
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Design curriculum stage=${state.stage.kind}.`);
    return step(ctx, state, incoming);
  },
});
