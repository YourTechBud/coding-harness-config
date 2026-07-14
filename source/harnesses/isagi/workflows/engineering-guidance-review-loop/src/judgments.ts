import {
  event as workflowEvent,
  type WorkflowConversationMessage,
  type WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

export type ReviewRoute = 'complete' | 'continue' | 'final-fixer' | 'human-decision';

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

export function reviewRoutingPrompt(input: { readonly review: string }): string {
  return `You are an unattended routing judgment for an Isagi engineering-guidance review loop.

Classify the reviewer's latest complete response into exactly one outgoing workflow edge. Map the response itself, not the workflow stage you expect the reviewer to be in. Agents may skip ahead, repeat work, or surface a decision earlier than expected; every outcome below is valid on every invocation.

Reviewer response:
${input.review}

Return exactly one JSON object with exactly this field:
{"outcome":"continue"}

Apply this precedence:
1. Return "final-fixer" when the reviewer explicitly says no re-review is needed (or clearly closes the review loop) but reports one or more actual Nit findings. The fixer gets one final discretionary turn and the workflow then ends without another review.
2. Return "complete" when the reviewer explicitly says the review loop is complete and no re-review or follow-up round is needed, with no Nit findings to hand off. Accept a clear equivalent of the canonical closure line, but do not infer completion from a lack of findings alone.
3. Return "human-decision" when the reviewer explicitly flags an active disagreement that requires the user to decide before the loop continues. This can happen before or after a fixer response; do not reject it because it appeared earlier than expected.
4. Return "continue" for every other response, including Blockers, Concerns, incomplete fixes, new findings, ordinary feedback, questions, Nits without an explicit closure signal, and ambiguous closure language.

A Nit is never a disagreement. Do not treat an empty Nit section or a passing mention of the severity definition as an actual Nit finding. An Architectural Reflection is not a disagreement by itself. Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function completedSingleHeadlessResult(event: unknown): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(event);
  if (!results) throw new Error('Workflow resumed with a non-headless routing event.');
  if (results.length !== 1) {
    throw new Error(`Expected exactly one routing result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== 'completed') {
    const detail = result?.error ? `: ${result.error}` : '';
    throw new Error(`Routing judgment did not complete${detail}.`);
  }
  return result;
}

export function parseReviewRoute(output: string): ReviewRoute {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Routing result must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'outcome') {
    throw new Error('Routing result must contain exactly one field: outcome.');
  }
  if (
    record.outcome !== 'complete' &&
    record.outcome !== 'continue' &&
    record.outcome !== 'final-fixer' &&
    record.outcome !== 'human-decision'
  ) {
    throw new Error('Routing outcome must be complete, continue, final-fixer, or human-decision.');
  }
  return record.outcome;
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
    throw new Error('Routing output did not contain a JSON object.');
  }
  return output.slice(first, last + 1);
}
