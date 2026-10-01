import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  suspend,
  wait,
  type WorkflowConversationMessage,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import type { JudgmentOutput, JudgmentParameters } from 'isagi-workflow-common-graphs';

import { headlessJudgment } from '../constants.js';
import { setWorkflowStatus } from '../feedback.js';
import { discoverPlanPrompt, normalizeDiscoveryResult, type DiscoveryResult } from '../judgments.js';
import { DiscoveryJudgment, errorText, must, type Failure, type Plan } from './context.js';

export type DiscoveryParameters = { readonly plannerSessionId: number };
export type DiscoveryOutput = { readonly outcome: 'found'; readonly plan: Plan };

type State = {
  readonly repositoryPath: string;
  readonly plannerSessionId: number;
  readonly conversation: string | null;
  readonly discovery: DiscoveryResult | null;
  readonly plan: Plan | null;
  readonly failure: Failure | null;
};

// Finds the plan the planner conversation refers to and how many phases its decision log already
// records. A discovery that cannot be used pauses; Continue reads the conversation again and
// rediscovers, which is what an explicit Retry did before.
export const DiscoveryGraph = createGraph<State, {}, DiscoveryParameters, DiscoveryOutput>({
  key: 'ImplementPhaseWisePlanDiscovery',
  title: 'Discover the plan',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, conversation: null, discovery: null, plan: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    plannerSessionId: reduce.replace<number>(),
    conversation: reduce.replace<string | null>(),
    discovery: reduce.replace<DiscoveryResult | null>(),
    plan: reduce.replace<Plan | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'readConversation',
  nodes: {
    readConversation: operation<State, State>(async (ctx, state) => {
      await setWorkflowStatus(ctx, { kind: 'discovering-plan' });
      const conversation = formatConversationHistory(await ctx.getConversationHistory(state.plannerSessionId));
      if (conversation) return complete({ update: { conversation } });
      return complete({ update: { failure: { message: 'The planner conversation is empty', diagnostic: `planner session ${state.plannerSessionId} has no conversation text to inspect.` } } });
    }, { title: 'Read the planner conversation' }),

    discover: subgraph<State, State, JudgmentParameters, JudgmentOutput<DiscoveryResult>>({
      graph: DiscoveryJudgment,
      title: 'Discover the plan',
      parameters: (state) => ({
        label: 'plan discovery',
        profile: headlessJudgment,
        prompt: discoverPlanPrompt({ worktreePath: state.repositoryPath, plannerSessionId: state.plannerSessionId, plannerConversation: must(state.conversation, 'planner conversation') }),
      }),
      // A rejudge reads the planner conversation again before discovering.
      onResult: (_state, { output }) => (output.outcome === 'judged' ? { discovery: output.route } : { discovery: null, conversation: null }),
    }),

    normalize: operation<State, State>(async (ctx, state) => {
      let normalized;
      try {
        normalized = normalizeDiscoveryResult({ result: must(state.discovery, 'discovery'), worktreePath: state.repositoryPath });
      } catch (error) {
        const message = errorText(error);
        return complete({ update: { failure: { message: `The discovered plan could not be used: ${message}`, diagnostic: `Plan discovery validation failed: ${message}` } } });
      }
      if (!normalized) {
        return complete({ update: { failure: { message: 'No phase-wise plan was found in the planner conversation', diagnostic: 'No phase-wise plan was found during discovery.' } } });
      }
      const nextPhase = normalized.phases[normalized.currentPhaseIndex];
      await setWorkflowStatus(ctx, {
        kind: 'plan-ready',
        entryPlanPath: normalized.entryPlanPath,
        decisionLogPath: normalized.decisionLogPath,
        phaseCount: normalized.phases.length,
        completedPhaseCount: normalized.currentPhaseIndex,
        nextPhase: nextPhase?.number,
      });
      await ctx.log('info', `Plan found at ${normalized.entryPlanPath} with ${normalized.phases.length} phases. Decision log: ${normalized.decisionLogPath}. Completed phases: ${normalized.currentPhaseIndex}. Next phase: ${nextPhase?.number ?? 'none'}.`);
      return complete({ update: { plan: normalized } });
    }, { title: 'Check the discovered plan' }),

    askUser: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'warning', phase: 'plan-discovery', message: `${failure.message}. Resolve it with the planner, then select Continue to discover the plan again.` });
      await ctx.log('error', failure.diagnostic);
      return suspend({ wait: wait.userContinue('Plan discovery failed. Resolve it with the planner, then Continue to discover again.') });
    }, { title: 'Ask the user to fix the plan' }),
  },
  edges: {
    afterReadConversation: edge<State, State>({ from: 'readConversation', to: ['discover', 'askUser'], choose: (state) => ({ to: state.failure ? 'askUser' : 'discover' }) }),
    afterDiscover: edge<State, State>({ from: 'discover', to: ['normalize', 'readConversation'], choose: (state) => ({ to: state.discovery ? 'normalize' : 'readConversation' }) }),
    afterNormalize: edge<State, State>({ from: 'normalize', to: ['found', 'askUser'], choose: (state) => ({ to: state.failure ? 'askUser' : 'found' }) }),
    afterAskUser: edge<State, State>({
      from: 'askUser',
      to: ['readConversation'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Plan discovery resumed with an unexpected ${event.kind} event.`);
        return { to: 'readConversation', update: { failure: null, conversation: null, discovery: null } };
      },
    }),
  },
  outcomes: {
    found: outcome({ kind: 'success', title: 'Plan found', output: (state) => ({ outcome: 'found', plan: must(state.plan, 'plan') }) }),
  },
});

export function formatConversationHistory(history: readonly WorkflowConversationMessage[]): string {
  return history
    .map((message, index) => {
      const text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim();
      if (!text) return '';
      return `Message ${index + 1} (${message.role}):\n${text}`;
    })
    .filter((entry) => entry.length > 0)
    .join('\n\n');
}
