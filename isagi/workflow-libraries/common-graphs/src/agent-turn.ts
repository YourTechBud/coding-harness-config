import {
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  suspend,
  wait,
  type AgentTurnTarget,
  type EdgeDecision,
  type GraphUpdate,
  type NodeEvent,
  type SubgraphNode,
  type WorkflowAgentHarness,
  type WorkflowPromptModifiers,
  type WorkflowUiFeedback,
} from '@yourtechbudstudio/isagi-workflow-sdk';

// One prompt to a new or existing agent session, waited to its end. A turn that fails with a
// harness error can be resubmitted automatically within a budget. Any other failed turn pauses so the
// user can finish the agent by hand; after Continue, the latest turn in the same session answers
// without a new prompt. A session that died cannot be continued, so it is returned to the caller as
// data.

export type AgentTurnSession =
  | { readonly kind: 'spawn'; readonly harness: WorkflowAgentHarness; readonly model?: string; readonly effort?: string }
  /** `paneId` is null for a session the workflow does not own, such as the agent that launched it. */
  | { readonly kind: 'existing'; readonly agentSessionId: number; readonly paneId: number | null };

export type AgentTurnParameters = {
  /** Names the step in feedback, logs, and the inspect view, for example "Deck shell creation". */
  readonly label: string;
  readonly session: AgentTurnSession;
  readonly prompt?: string;
  readonly modifiers?: WorkflowPromptModifiers;
  /** Set before the prompt is sent. */
  readonly feedback?: WorkflowUiFeedback;
  /** How many times a `harness_error` turn resends the same prompt before asking the user. Defaults to 0. */
  readonly resubmitOnHarnessError?: number;
};

export type AgentPane = { readonly agentSessionId: number; readonly paneId: number | null };

/** The pane of an agent this workflow spawned, for closing it. */
export function ownedPane(agent: AgentPane): number {
  if (agent.paneId === null) throw new Error(`Agent session ${agent.agentSessionId} has no pane owned by this workflow.`);
  return agent.paneId;
}

export type AgentTurnOutput =
  | { readonly outcome: 'ended'; readonly agent: AgentPane }
  | { readonly outcome: 'interrupted'; readonly agent: AgentPane; readonly reason: string };

type State = {
  readonly request: AgentTurnParameters;
  readonly agent: AgentPane | null;
  readonly turn: AgentTurnTarget | null;
  readonly resubmits: number;
  readonly stalled: string | null;
  readonly interruption: string | null;
};

export const AgentTurnGraph = createGraph<State, {}, AgentTurnParameters, AgentTurnOutput>({
  key: 'AgentTurn',
  title: 'Agent turn',
  label: (parameters) => parameters.label,
  init: (_destination, request) => ({ request, agent: null, turn: null, resubmits: 0, stalled: null, interruption: null }),
  state: {
    request: reduce.replace<AgentTurnParameters>(),
    agent: reduce.replace<AgentPane | null>(),
    turn: reduce.replace<AgentTurnTarget | null>(),
    resubmits: reduce.replace<number>(),
    stalled: reduce.replace<string | null>(),
    interruption: reduce.replace<string | null>(),
  },
  entry: 'send',
  nodes: {
    send: operation<State, State>(async (ctx, { request }) => {
      if (request.feedback) await ctx.setUiFeedback(request.feedback);
      if (request.session.kind === 'spawn') {
        const { kind: _kind, ...profile } = request.session;
        const spawned = await ctx.spawnAgentSession({ ...profile, prompt: request.prompt, modifiers: request.modifiers });
        return suspend({
          update: { agent: { agentSessionId: spawned.agentSessionId, paneId: spawned.paneId }, turn: { agentSessionId: spawned.agentSessionId, sentAt: spawned.sentAt } },
          wait: wait.agentTurn(spawned),
        });
      }
      const { agentSessionId, paneId } = request.session;
      const sent = await ctx.sendAgentPrompt({ agentSessionId, prompt: request.prompt, modifiers: request.modifiers });
      return suspend({ update: { agent: { agentSessionId, paneId }, turn: sent }, wait: wait.agentTurn(sent) });
    }, { title: 'Send the prompt', label: (state) => state.request.label }),

    resubmit: operation<State, State>(async (ctx, state) => {
      const { label, prompt, modifiers } = state.request;
      const agent = must(state.agent, 'agent');
      const role = label.toLowerCase();
      await ctx.setUiFeedback({ kind: 'warning', phase: `Retrying ${role}`, message: `The ${role} harness turn failed. Resubmitting its previous message.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: agent.agentSessionId, prompt, modifiers });
      await ctx.log('warning', `Resubmitted the previous message after harness_error ${state.resubmits + 1}/${state.request.resubmitOnHarnessError ?? 0} to ${role} session ${agent.agentSessionId}.`);
      return suspend({ update: { turn: sent, resubmits: state.resubmits + 1 }, wait: wait.agentTurn(sent) });
    }, { title: 'Resubmit after a harness error' }),

    askUser: operation<State, State>(async (ctx, state) => {
      const { label } = state.request;
      const { paneId } = must(state.agent, 'agent');
      const where = paneId === null ? 'its pane' : `pane ${paneId}`;
      await ctx.setUiFeedback({ kind: 'warning', phase: `${label} stopped`, message: `Continue the agent in ${where} by hand until it finishes, then select Continue.` });
      await ctx.log('warning', must(state.stalled, 'stalled turn'));
      return suspend({ wait: wait.userContinue(`${label} stopped. Continue the agent by hand, then Continue.`) });
    }, { title: 'Ask the user to finish the agent' }),

    recheck: operation<State, State>(async (_ctx, state) => suspend({ wait: wait.agentTurn(must(state.turn, 'turn')) }), { title: 'Check the latest turn' }),
  },
  edges: {
    afterSend: edge<State, State>({ from: 'send', to: ['ended', 'resubmit', 'askUser', 'interrupted'], choose: routeTurn }),
    afterResubmit: edge<State, State>({ from: 'resubmit', to: ['ended', 'resubmit', 'askUser', 'interrupted'], choose: routeTurn }),
    afterAskUser: edge<State, State>({ from: 'askUser', to: ['recheck'], choose: () => ({ to: 'recheck' }) }),
    afterRecheck: edge<State, State>({ from: 'recheck', to: ['ended', 'resubmit', 'askUser', 'interrupted'], choose: routeTurn }),
  },
  outcomes: {
    ended: outcome({ kind: 'success', title: 'Turn ended', output: (state) => ({ outcome: 'ended', agent: must(state.agent, 'agent') }) }),
    interrupted: outcome({ kind: 'failure', title: 'Agent session ended', output: (state) => ({ outcome: 'interrupted', agent: must(state.agent, 'agent'), reason: must(state.interruption, 'interruption') }) }),
  },
});

function routeTurn(state: State, event: NodeEvent): EdgeDecision<GraphUpdate<State>> {
  const { label } = state.request;
  if (event.kind !== 'agent_turn') throw new Error(`${label} resumed with an unexpected ${event.kind} event.`);
  const { agentSessionId, paneId } = must(state.agent, 'agent');
  const where = paneId === null ? `session ${agentSessionId}` : `pane ${paneId}`;
  if (event.outcome === 'ended') return { to: 'ended', update: { stalled: null } };
  if (event.outcome === 'failed' && event.reason === 'harness_error' && state.resubmits < (state.request.resubmitOnHarnessError ?? 0)) return { to: 'resubmit' };
  if (event.outcome === 'failed') return { to: 'askUser', update: { stalled: `${label} failed in ${where}: ${event.reason}` } };
  return { to: 'interrupted', update: { interruption: `${label} was interrupted in ${where}: ${event.reason}` } };
}

/**
 * Registers an agent turn as a node of a caller's graph. `onResult` receives the turn's typed output;
 * store it and route on it, closing the pane when the caller is done with the agent.
 */
export function agentTurn<ParentState, ParentUpdates>(spec: {
  readonly title: string;
  readonly label?: (state: ParentState) => string;
  readonly parameters: (state: ParentState) => AgentTurnParameters;
  readonly onResult: (state: ParentState, output: AgentTurnOutput) => GraphUpdate<ParentUpdates>;
}): SubgraphNode<ParentState, ParentUpdates, AgentTurnParameters, AgentTurnOutput> {
  return subgraph<ParentState, ParentUpdates, AgentTurnParameters, AgentTurnOutput>({
    graph: AgentTurnGraph,
    title: spec.title,
    ...(spec.label ? { label: spec.label } : {}),
    parameters: spec.parameters,
    onResult: (state, result) => spec.onResult(state, result.output),
  });
}

function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Agent turn state is missing its ${label}.`);
  return value;
}
