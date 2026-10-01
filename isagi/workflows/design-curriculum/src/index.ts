import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { DesignCurriculumGraph, designCurriculumParameters } from './graph.js';

export default defineWorkflow({
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
  parse: (origin, inputs) => designCurriculumParameters(origin.worktreePath, inputs),
  graph: DesignCurriculumGraph,
});
