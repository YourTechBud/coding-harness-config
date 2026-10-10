import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

export type UiReadiness = { readonly outcome: 'ready' | 'pending'; readonly reason: string };

export function uiReadinessJudgmentPrompt(response: string): string {
  return `You are an unattended routing judgment for a UI design session. The agent was asked whether anything is still open before the design documents are updated and the UI brief is written.

Agent response:
${response}

Return exactly one JSON object with exactly these fields:
{"outcome":"pending","reason":"The user has not chosen between the two empty-state layouts."}

Return "pending" when the agent names anything still open for the user, such as an unmade decision, an unsettled UI piece, or an unanswered question, and name the open items in reason. Return "ready" when the agent reports that nothing is open. Updates to the design documents or the UI brief are not open items.

Return a concise, nonempty reason and no commentary, markdown, or extra JSON fields.`;
}

export function parseUiReadiness(output: string): UiReadiness {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) throw new Error('UI readiness judgment did not contain a JSON object.');
  const value: unknown = JSON.parse(output.slice(first, last + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('UI readiness judgment must be a JSON object.');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('outcome') || !keys.includes('reason')) throw new Error('UI readiness judgment must contain exactly two fields: outcome and reason.');
  if (record.outcome !== 'ready' && record.outcome !== 'pending') throw new Error('UI readiness judgment outcome must be one of: ready, pending.');
  if (typeof record.reason !== 'string' || record.reason.trim().length === 0) throw new Error('UI readiness judgment reason must be nonempty text.');
  return { outcome: record.outcome, reason: record.reason.trim() };
}

export function latestAssistantTurnText(history: readonly WorkflowConversationMessage[]): string | null {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant' && completeMessageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;

  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') {
      precedingUserIndex = index;
      break;
    }
  }

  const turn = history
    .slice(precedingUserIndex + 1, finalAssistantIndex + 1)
    .filter((message) => message.role === 'assistant')
    .map(completeMessageText)
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
  return turn.length > 0 ? turn : null;
}

function completeMessageText(message: WorkflowConversationMessage): string {
  return message.parts
    .filter((part) => part.type === 'text' && part.state !== 'streaming')
    .map((part) => part.text)
    .join('\n')
    .trim();
}
