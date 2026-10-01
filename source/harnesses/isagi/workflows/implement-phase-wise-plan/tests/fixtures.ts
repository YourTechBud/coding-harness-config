import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OperationContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import type { PlanPhase } from '../src/judgments.js';
import type { PhaseParameters } from '../src/graphs/phase.js';

export const plannerSessionId = 11;
export const implementer = { agentSessionId: 22, paneId: 32 };

export function destination(worktreePath = '/workspace') {
  return { worktreeId: 1, worktreePath, surfaceId: 1 };
}

export function phases(phaseType: PlanPhase['type'] = 'implementation'): readonly PlanPhase[] {
  return [
    { number: 1, slug: 'phase-01-foundations', type: 'prep' },
    { number: 2, slug: 'phase-02-production-wiring', type: phaseType },
    { number: 3, slug: 'phase-03-docs', type: 'docs' },
    { number: 4, slug: 'phase-04-release', type: 'release' },
  ];
}

export function phaseParameters(input?: {
  readonly autoCommit?: boolean;
  readonly autoReview?: boolean;
  readonly humanInTheLoop?: boolean;
  readonly phaseType?: PlanPhase['type'];
}): PhaseParameters {
  return {
    plannerSessionId,
    options: {
      autoCommit: input?.autoCommit ?? true,
      autoReview: input?.autoReview ?? false,
      humanInTheLoop: input?.humanInTheLoop ?? false,
    },
    entryPlanPath: 'docs/plan.md',
    phases: phases(input?.phaseType),
    phaseIndex: 1,
  };
}

export function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

export function workflowHarness(input?: { readonly worktreePath?: string; readonly conversationHistory?: readonly WorkflowConversationMessage[] }) {
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: string[] = [];
  const spawned: Array<Parameters<OperationContext['spawnAgentSession']>[0]> = [];
  const headless: Array<Parameters<OperationContext['runHeadlessAgent']>[0]> = [];
  const closedPanes: number[] = [];
  let history = input?.conversationHistory ?? [];
  const ctx: OperationContext = {
    destination: destination(input?.worktreePath),
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async (request) => {
      spawned.push(request);
      return { ...implementer, sentAt: '2026-07-10T00:00:00.000Z' };
    },
    sendAgentPrompt: async () => { throw new Error('Prompts run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async () => history,
    runHeadlessAgent: async (request) => {
      headless.push(request);
      return { operationId: `op-${headless.length}` };
    },
    log: async (_level, text) => { logs.push(text); },
    setUiFeedback: async (value) => { feedback.push(value); },
  };
  return {
    ctx,
    feedback,
    logs,
    spawned,
    headless,
    closedPanes,
    setHistory: (next: readonly WorkflowConversationMessage[]) => { history = next; },
  };
}

export function writePlanFixture(worktreePath: string, withDecisionLog = false): void {
  const planDirectory = join(worktreePath, 'scratch/plans/current-plan');
  mkdirSync(planDirectory, { recursive: true });
  writeFileSync(join(planDirectory, 'index.md'), '[Foundations](phase-01-foundations.md)\n');
  writeFileSync(join(planDirectory, 'phase-01-foundations.md'), '---\ntype: prep\n---\n\n# Foundations\n');
  if (withDecisionLog) writeFileSync(join(planDirectory, 'decisions.md'), '# Decisions\n\nPhase 1 complete.\n');
}

export function discoveryResult(completedPhaseCount: number) {
  return {
    planReferenceFound: true as const,
    entryPlanPath: 'scratch/plans/current-plan/index.md',
    decisionLogPath: 'scratch/plans/current-plan/decisions.md',
    phases: [{ number: 1, slug: 'phase-01-foundations', type: 'prep' as const }],
    completedPhaseCount,
  };
}

export function assertAlignmentBullets(prompt: string): void {
  assert.match(prompt, /Ask clarifying questions when the answer materially changes.*do not use the askUserQuestion tool/);
  assert.match(prompt, /Push back when you see a concrete correctness, scope, or complexity problem/);
  assert.match(prompt, /- Flag or highlight major shortcomings or opportunities to simplify logic/);
  assert.match(prompt, /- Clearly state your understanding/);
  assert.match(prompt, /- Run tasks and shell commands in the foreground/);
  assert.match(prompt, /- Explicitly state when alignment is established/);
  assert.match(prompt, /- Begin implementation only when the planner explicitly approves it/);
  assert.equal(prompt.split('\n').filter((line) => line.startsWith('- ')).length, 7);
  assert.doesNotMatch(prompt, /I want you to|my ideas|I explicitly say so/);
}
