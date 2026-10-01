import assert from 'node:assert/strict';

import {
  isWorkflowBranded,
  type GraphDefinition,
  type NodeEvent,
  type OperationContext,
  type OperationResult,
  type SubgraphResult,
  type WorkflowDestination,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import type { AgentPane, AgentTurnOutput } from './agent-turn.js';

// Mirrors the runtime's routing order for one node visit: the node's update is reduced first, the
// edge chooses on that state, and the edge's update is reduced last.

type AnyGraph = GraphDefinition<any, any, any, any>;

export type Visit<State> = {
  readonly result: OperationResult<unknown>;
  readonly to: string;
  readonly state: State;
};

export const destination: WorkflowDestination = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 1 };

export async function visit<State>(graph: AnyGraph, nodeId: string, ctx: OperationContext, state: State, event?: NodeEvent): Promise<Visit<State>> {
  const node = graph.nodes[nodeId];
  assert.ok(node && isWorkflowBranded(node, 'operation-node'), `${nodeId} is an operation node`);
  const result = await node.run(ctx, state);
  const delivered: NodeEvent | undefined = result.type === 'complete' ? { kind: 'immediate' } : event;
  if (!delivered) throw new Error(`${nodeId} suspended on ${result.type === 'suspend' ? result.wait.kind : 'nothing'}; pass the event it waits for.`);
  return { result, ...route(graph, nodeId, apply(graph, state, result.update), delivered) };
}

/** The graph a subgraph node invokes, for reaching phase graphs that a factory keeps private. */
export function subgraphOf(graph: AnyGraph, nodeId: string): AnyGraph {
  const node = graph.nodes[nodeId];
  assert.ok(node && isWorkflowBranded(node, 'subgraph-node'), `${nodeId} is a subgraph node`);
  return node.graph;
}

/** The child parameters a subgraph node maps from `state`, typed as the child's parameters. */
export function subgraphParameters<Parameters>(graph: AnyGraph, nodeId: string, state: unknown): Parameters {
  const node = graph.nodes[nodeId];
  assert.ok(node && isWorkflowBranded(node, 'subgraph-node'), `${nodeId} is a subgraph node`);
  return node.parameters(state) as Parameters;
}

export function visitSubgraph<State>(graph: AnyGraph, nodeId: string, state: State, result: SubgraphResult<unknown>): { readonly to: string; readonly state: State } {
  const node = graph.nodes[nodeId];
  assert.ok(node && isWorkflowBranded(node, 'subgraph-node'), `${nodeId} is a subgraph node`);
  return route(graph, nodeId, apply(graph, state, node.onResult(state, result)), { kind: 'subgraph', result });
}

export function route<State>(graph: AnyGraph, from: string, state: State, event: NodeEvent): { readonly to: string; readonly state: State } {
  const edges = Object.values(graph.edges).filter((candidate) => candidate.from === from);
  assert.equal(edges.length, 1, `${from} has exactly one edge`);
  const decision = edges[0]!.choose(state, event);
  assert.ok(edges[0]!.to.includes(decision.to), `${from} routed to undeclared ${decision.to}`);
  return { to: decision.to, state: apply(graph, state, decision.update) };
}

export function apply<State>(graph: AnyGraph, state: State, update: unknown): State {
  if (update === undefined) return state;
  const next = { ...state } as Record<string, unknown>;
  for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
    assert.notEqual(value, undefined, `update field ${key} is undefined`);
    const field = graph.state[key];
    assert.ok(field, `update names unknown field ${key}`);
    next[key] = field.reduce(next[key], value);
  }
  return next as State;
}

export function assertDestinationsDeclared(graph: AnyGraph): void {
  const declared = new Set([...Object.keys(graph.nodes), ...Object.keys(graph.outcomes)]);
  for (const candidate of Object.values(graph.edges)) {
    for (const target of candidate.to) assert.ok(declared.has(target), `${candidate.from} declares unknown ${target}`);
  }
  for (const nodeId of Object.keys(graph.nodes)) {
    assert.equal(Object.values(graph.edges).filter((candidate) => candidate.from === nodeId).length, 1, `${nodeId} has exactly one edge`);
  }
}

export function ended(): NodeEvent {
  return { kind: 'agent_turn', outcome: 'ended', recordedAt: '2026-08-30T00:00:00.000Z' };
}

export function turnFailed(reason = 'model error'): NodeEvent {
  return { kind: 'agent_turn', outcome: 'failed', recordedAt: '2026-08-30T00:00:00.000Z', reason };
}

export function sessionDied(): NodeEvent {
  return { kind: 'agent_turn', outcome: 'interrupted', recordedAt: '2026-08-30T00:00:00.000Z', reason: 'session_died' };
}

export function agentTurnEnded(agent: AgentPane): SubgraphResult<AgentTurnOutput> {
  return { outcomeId: 'ended', outcomeKind: 'success', output: { outcome: 'ended', agent } };
}

export function agentTurnInterrupted(agent: AgentPane, reason = 'Agent turn was interrupted: session_died'): SubgraphResult<AgentTurnOutput> {
  return { outcomeId: 'interrupted', outcomeKind: 'failure', output: { outcome: 'interrupted', agent, reason } };
}

export function headlessCompleted(operationId: string, output: string): NodeEvent {
  return { kind: 'headless_agent', results: [{ operationId, status: 'completed', output }] };
}

export function headlessFailed(operationId: string, error = 'judge crashed'): NodeEvent {
  return { kind: 'headless_agent', results: [{ operationId, status: 'failed', error }] };
}

export function judged<Route>(route: Route): SubgraphResult<{ readonly outcome: 'judged'; readonly route: Route }> {
  return { outcomeId: 'judged', outcomeKind: 'success', output: { outcome: 'judged', route } };
}

export function rejudged(): SubgraphResult<{ readonly outcome: 'rejudge' }> {
  return { outcomeId: 'rejudge', outcomeKind: 'success', output: { outcome: 'rejudge' } };
}
