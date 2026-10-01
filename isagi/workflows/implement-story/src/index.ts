import { defineWorkflow } from '@yourtechbudstudio/isagi-workflow-sdk';

import { ImplementStoryGraph } from './graph.js';
import { autoCommitInput, autoReviewInput, defaults, humanInTheLoopInput, parseVariables } from './inputs.js';

export default defineWorkflow({
  command: () => ({
    title: 'Implement Story',
    description: 'Create an implementation plan from a designed story and implement it phase by phase.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state source path', default: defaults.currentStatePath },
      { kind: 'text', key: 'architecturePath', label: 'Architecture source path', default: defaults.architecturePath },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design source path', default: defaults.programDesignPath },
      { kind: 'text', key: 'uiBriefPath', label: 'UI brief path', default: defaults.uiBriefPath },
      { kind: 'text', key: 'planDirectory', label: 'Implementation-plan directory', default: defaults.planDirectory },
      { kind: 'text', key: 'entryPlanPath', label: 'Implementation-plan entry path', default: defaults.entryPlanPath },
      humanInTheLoopInput,
      autoReviewInput,
      autoCommitInput,
    ],
  }),
  parse: (_origin, inputs) => parseVariables(inputs),
  graph: ImplementStoryGraph,
});
