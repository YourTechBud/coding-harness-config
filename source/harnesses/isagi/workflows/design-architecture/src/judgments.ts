import {
  event as workflowEvent,
  type WorkflowConversationMessage,
  type WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { withPromptFooter } from './prompts.js';

export type WriterRoute = 'failed' | 'ready';
export type ReviewerRoute = 'complete' | 'revise' | 'human-decision';

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

export function writerRoutingPrompt(input: {
  readonly writerResponse: string;
  readonly artifactPath: string;
}): string {
  return withPromptFooter(`You are an unattended routing judgment for an architecture writer.

Architecture artifact path: ${input.artifactPath}

Writer response:
${input.writerResponse}

Return exactly one JSON object with exactly this field:
{"outcome":"ready"}

Return "ready" when the writer reports that it completed the requested writing or revision turn and the architecture artifact is ready for review. A response that applies some findings and pushes back on others is ready when that work is complete. Return "failed" when the writer reports that it did not create or finish the artifact, says work remains, only describes intended future work, asks for input instead of completing the artifact, or otherwise does not report a completed artifact turn.

Every outcome is valid on every invocation. Return no confidence, commentary, markdown, or extra JSON fields.`);
}

export function reviewerRoutingPrompt(input: { readonly review: string }): string {
  return withPromptFooter(`You are an unattended routing judgment for an architecture reviewer.

Reviewer response:
${input.review}

Return exactly one JSON object with exactly this field:
{"outcome":"revise"}

Apply this precedence:
1. Return "human-decision" when the Human Escalation section explicitly states "Escalation required:" and identifies a decision for the human. An ordinary disagreement, held finding, or "No escalation." is not a human decision.
2. Return "complete" when the reviewer explicitly closes the loop with "No re-review needed." and does not simultaneously report an open Blocker, Concern, or human decision. Optional findings may coexist with completion.
3. Return "revise" for every other response, including any Blocker or Concern, incomplete corrections, held findings, new findings, ambiguous closure language, and requests for another review round.

Every outcome is valid on every invocation. Return no confidence, commentary, markdown, or extra JSON fields.`);
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

export function parseWriterRoute(output: string): WriterRoute {
  return parseOutcome(output, ['failed', 'ready'] as const, 'writer');
}

export function parseReviewerRoute(output: string): ReviewerRoute {
  return parseOutcome(
    output,
    ['complete', 'revise', 'human-decision'] as const,
    'reviewer',
  );
}

function parseOutcome<const Outcome extends string>(
  output: string,
  allowed: readonly Outcome[],
  label: string,
): Outcome {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} judgment must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'outcome') {
    throw new Error(`${label} judgment must contain exactly one field: outcome.`);
  }
  if (typeof record.outcome !== 'string' || !allowed.includes(record.outcome as Outcome)) {
    throw new Error(`${label} judgment outcome must be one of: ${allowed.join(', ')}.`);
  }
  return record.outcome as Outcome;
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
