import type { OperationContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

export const destination = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };

export function agent(agentSessionId: number, paneId: number | null) {
  return { agentSessionId, paneId };
}

export function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

export function workflowHarness(histories: Record<number, readonly WorkflowConversationMessage[]> = {}) {
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const ctx: OperationContext = {
    destination,
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    sendAgentPrompt: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async (agentSessionId) => histories[agentSessionId] ?? [],
    runHeadlessAgent: async () => { throw new Error('Judgments run in the judgment graph.'); },
    log: async (level, text) => { logs.push({ level, message: text }); },
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, closedPanes, feedback, logs, histories };
}
