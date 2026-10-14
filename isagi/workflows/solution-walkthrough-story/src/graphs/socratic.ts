import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  suspend,
  wait,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, ownedPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { guide, lessonPlanner } from '../constants.js';
import { assertExpectedFile } from '../contracts.js';
import { lessonPlanExists } from '../curriculum-v3.js';
import { genericLessonPlanPrompt, genericSocraticPrompt } from '../prompts.js';
import { SHOW_ME_MODIFIER, errorText, must, promptInput, type Failed, type Failure, type SocraticCompleted, type WalkthroughContext } from './context.js';

export type SocraticOutput = SocraticCompleted | Failed;

type State = {
  readonly repositoryPath: string;
  readonly context: WalkthroughContext;
  readonly lessonPlanReady: boolean;
  readonly planner: AgentTurnOutput | null;
  readonly turn: AgentTurnOutput | null;
  readonly failure: Failure | null;
};

// A planner sequences the approved curriculum into a lesson plan (reused when one exists), then a
// guide teaches from it with the user until they press Continue.
export const WalkthroughSocraticGraph = createGraph<State, {}, WalkthroughContext, SocraticOutput>({
  key: 'WalkthroughSocratic',
  title: 'Socratic walkthrough',
  init: (destination, context) => ({ repositoryPath: destination.worktreePath, context, lessonPlanReady: false, planner: null, turn: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    context: reduce.replace<WalkthroughContext>(),
    lessonPlanReady: reduce.replace<boolean>(),
    planner: reduce.replace<AgentTurnOutput | null>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'inspectLessonPlan',
  nodes: {
    inspectLessonPlan: operation<State, State>(async (ctx, state) => {
      const { paths } = state.context;
      if (!lessonPlanExists(state.repositoryPath, paths)) return complete();
      await ctx.log('info', `Reusing existing lesson plan ${paths.lessonPlanPath}; lesson planning is skipped.`);
      return complete({ update: { lessonPlanReady: true } });
    }, { title: 'Reuse the approved lesson plan' }),

    planLesson: agentTurn<State, State>({
      title: 'Plan the lesson',
      parameters: (state) => ({
        label: 'Lesson plan',
        session: { kind: 'spawn', ...lessonPlanner },
        prompt: genericLessonPlanPrompt(promptInput(state)),
        feedback: { phase: 'Planning the Socratic walkthrough', message: 'Sequencing the stops, interface cards, calls, and verified facts before the guide starts.' },
      }),
      onResult: (_state, planner) => ({ planner }),
    }),

    readLessonPlan: operation<State, State>(async (ctx, state) => {
      try {
        assertExpectedFile(state.repositoryPath, state.context.paths.lessonPlanPath, 'lesson plan');
      } catch (error) {
        return failStep(ctx, { phase: 'Solution walkthrough failed', message: 'The lesson plan was not written. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.planner, 'planner turn').agent));
      return complete({ update: { lessonPlanReady: true } });
    }, { title: 'Read the lesson plan and close the planner' }),

    startGuide: agentTurn<State, State>({
      title: 'Start the guide',
      parameters: (state) => ({
        label: 'Socratic walkthrough',
        session: { kind: 'spawn', ...guide },
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericSocraticPrompt(promptInput(state)),
        feedback: { phase: 'Starting the Socratic walkthrough', message: 'The guide will teach from the lesson plan and the approved curriculum.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    awaitDiscussion: operation<State, State>(async (ctx) => {
      await ctx.setUiFeedback({ phase: 'Socratic walkthrough in progress', message: 'Continue the discussion in the guide pane. Press workflow Continue when you are finished.' });
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Wait for the discussion to finish' }),

    closeGuide: operation<State, State>(async (ctx, state) => {
      await ctx.closePane(ownedPane(must(state.turn, 'guide turn').agent));
      return complete();
    }, { title: 'Close the guide' }),
  },
  edges: {
    afterInspectLessonPlan: edge<State, State>({
      from: 'inspectLessonPlan',
      to: ['startGuide', 'planLesson'],
      choose: (state) => ({ to: state.lessonPlanReady ? 'startGuide' : 'planLesson' }),
    }),
    afterPlanLesson: edge<State, State>({
      from: 'planLesson',
      to: ['readLessonPlan', 'failed'],
      choose: (state) => {
        const planner = must(state.planner, 'planner turn');
        if (planner.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'Lesson planning failed because its agent session ended.', diagnostic: planner.reason } } };
        return { to: 'readLessonPlan' };
      },
    }),
    afterReadLessonPlan: edge<State, State>({ from: 'readLessonPlan', to: ['startGuide'], choose: () => ({ to: 'startGuide' }) }),
    afterStartGuide: edge<State, State>({
      from: 'startGuide',
      to: ['awaitDiscussion', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'guide turn');
        if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: 'The Socratic guide failed.', diagnostic: turn.reason } } };
        return { to: 'awaitDiscussion' };
      },
    }),
    afterAwaitDiscussion: edge<State, State>({
      from: 'awaitDiscussion',
      to: ['closeGuide'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`The Socratic walkthrough resumed with an unexpected ${event.kind} event.`);
        return { to: 'closeGuide' };
      },
    }),
    afterCloseGuide: edge<State, State>({ from: 'closeGuide', to: ['completed'], choose: () => ({ to: 'completed' }) }),
  },
  outcomes: {
    completed: outcome({ kind: 'success', title: 'Socratic walkthrough completed', output: (state) => ({ outcome: 'socratic-walkthrough-completed', curriculumPath: state.context.paths.curriculumPath }) }),
    failed: outcome({ kind: 'failure', title: 'Socratic walkthrough failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});
