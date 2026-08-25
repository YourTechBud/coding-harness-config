import {
  event as workflowEvent,
  type WorkflowConversationMessage,
  type WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

export type DeckReviewRoute =
  | 'complete'
  | 'builder'
  | 'architect-and-builder'
  | 'human-decision';

export function deckReviewRoutingPrompt(review: string): string {
  return `You are an unattended routing judgment for an Isagi walkthrough deck review.

Classify the complete review below into exactly one outgoing workflow edge. Judge the review's meaning rather than its formatting. Every outcome is valid on every round.

Review:
${review}

Return exactly one JSON object with exactly this field:
{"outcome":"complete"}

Apply this precedence:
1. Return "human-decision" when the review explicitly identifies a product, narrative, scope, or tradeoff decision that only the user can make. An explicit human decision takes precedence over every other outcome.
2. Return "architect-and-builder" when any required finding needs the curriculum or deck plan changed, including slide purpose, ordering, content responsibility, narrative structure, or realization boundaries. This also wins when architect and builder work are both required.
3. Return "builder" when required findings remain but the current curriculum and deck plan are sufficient, so the HTML presentation can be corrected directly.
4. Return "complete" when no required findings remain. Suggestions alone do not require another revision round.

Treat blockers and concerns as required findings. Use the finding evidence, responsibility, required outcome, prior-finding verification, human-decision section, and conclusion together; do not route from one word in isolation. Do not include confidence, commentary, Markdown, or extra JSON fields.`;
}

export function completedSingleHeadlessResult(incoming: unknown): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(incoming);
  if (!results) throw new Error('Workflow resumed with a non-headless deck-review routing event.');
  if (results.length !== 1) throw new Error(`Expected exactly one deck-review routing result, received ${results.length}.`);
  const result = results[0];
  if (!result || result.status !== 'completed') {
    const detail = result?.error ? `: ${result.error}` : '';
    throw new Error(`Deck-review routing judgment did not complete${detail}.`);
  }
  return result;
}

export function parseDeckReviewRoute(output: string): DeckReviewRoute {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Deck-review routing result must be a JSON object.');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'outcome') throw new Error('Deck-review routing result must contain exactly one field: outcome.');
  if (record.outcome !== 'complete' && record.outcome !== 'builder' && record.outcome !== 'architect-and-builder' && record.outcome !== 'human-decision') {
    throw new Error('Deck-review routing outcome must be complete, builder, architect-and-builder, or human-decision.');
  }
  return record.outcome;
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

function extractJsonObject(output: string): string {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) throw new Error('Deck-review routing output did not contain a JSON object.');
  return output.slice(first, last + 1);
}
