import {
  event as workflowEvent,
  type WorkflowConversationMessage,
  type WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

export type PlannerRoute = 'failed' | 'ready';

export function latestAssistantTurnText(
  history: readonly WorkflowConversationMessage[],
): string | null {
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

export function completedSingleHeadlessResult(event: unknown): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(event);
  if (!results) throw new Error('Workflow resumed with a non-headless judgment event.');
  if (results.length !== 1) {
    throw new Error(`Expected exactly one judgment result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== 'completed') {
    const detail = result?.error ? `: ${result.error}` : '';
    throw new Error(`Judgment did not complete${detail}.`);
  }
  return result;
}

export function parsePlannerRoute(output: string): PlannerRoute {
  const record = parseExactObject(output, ['outcome'], 'planner judgment');
  if (record.outcome !== 'ready' && record.outcome !== 'failed') {
    throw new Error('planner judgment outcome must be one of: failed, ready.');
  }
  return record.outcome;
}

function parseExactObject(
  output: string,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key, index) => keys[index] !== key)
  ) {
    throw new Error(`${label} must contain exactly: ${expectedKeys.join(', ')}.`);
  }
  return record;
}

function completeMessageText(message: WorkflowConversationMessage): string {
  return message.parts
    .filter((part) => part.type === 'text' && part.state !== 'streaming')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function extractJsonObject(output: string): string {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('Judgment output did not contain a JSON object.');
  }
  return output.slice(first, last + 1);
}
