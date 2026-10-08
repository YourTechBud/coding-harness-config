export type WriterRoute = 'ready' | 'incomplete' | 'human-decision';
export type ReviewerRoute = 'complete' | 'revise' | 'human-decision';
export type ArtifactJudgment<Route> = { readonly outcome: Route; readonly reason: string };

export const WRITER_ROUTING_INSTRUCTIONS = `Return exactly one JSON object with exactly these fields:
{"outcome":"ready","reason":"The writing or revision is complete and ready for review."}

Apply this precedence:
1. Return "human-decision" when the writer identifies a specific unresolved user decision or input that blocks further writing or acceptance. This takes precedence even when the file exists and the writer says it is ready for review. Name the decision in reason. Writer and reviewer agreement does not remove the need for the user's decision.
2. Return "ready" when the artifact file exists and the writer reports completed writing or revisions for review, including an evidence-backed response that applies some findings and pushes back on others. Ready for review is separate from reviewer acceptance. Findings the reviewer can adjudicate and nonblocking recorded uncertainty do not make a completed turn incomplete.
3. Return "incomplete" when the artifact file is missing or the writer reports unfinished writing, only intended future work, or no completed artifact turn. Explain what remains in reason.

Every outcome is valid on every invocation. Return a concise, nonempty reason and no confidence, commentary, markdown, or extra JSON fields.`;

export const REVIEWER_ROUTING_INSTRUCTIONS = `Return exactly one JSON object with exactly these fields:
{"outcome":"revise","reason":"The artifact needs corrections."}

Apply this precedence:
1. Return "human-decision" when the reviewer identifies a specific unresolved decision or input that requires the user before writing or acceptance can proceed, or explicitly escalates a fundamental impasse. Name the decision in reason. A required user decision takes precedence over closure language or a contradictory "No escalation." section. An ordinary disagreement or held finding that the agents can resolve is not a human decision.
2. Return "complete" when the reviewer explicitly closes the loop with "No re-review needed." and does not simultaneously report an open Blocker, Concern, or human decision. Optional findings may coexist with completion.
3. Return "revise" for every other response, including any Blocker or Concern the writer can address, incomplete corrections, held findings, new findings, ambiguous closure language, and requests for another review round.

Every outcome is valid on every invocation. Return a concise, nonempty reason and no confidence, commentary, markdown, or extra JSON fields.`;

export const REVIEWER_ESCALATION_AND_CLOSURE = `Always include a Human Escalation section. When a specific unresolved user decision or input blocks further writing or acceptance, explicitly state "Escalation required:", explain the decision, the recommendation, alternatives, and consequences. Escalate this decision even when you and the writer agree. Also escalate a fundamental impasse when repeated substantive disagreement is unlikely to be resolved by another exchange, explaining both positions. Otherwise state "No escalation." An ordinary disagreement or held finding the agents can resolve is not an escalation.

When no Blocker, Concern, or blocking human decision remains, end with the exact line: No re-review needed.`;

export const WRITER_INPUT_POLICY = `When a specific user decision or input blocks further writing or acceptance, preserve the completed work and clearly state the decision needed, your recommendation, alternatives, and consequences. Distinguish this blocking decision from nonblocking uncertainty and findings the reviewer can adjudicate. Keep scope decisions with the user.`;

export const WRITER_CONTINUATION_INSTRUCTIONS = `Incorporate the decisions and changes from our conversation into the artifact and any affected predecessor artifacts. Preserve completed work and verify the updated artifacts. Then provide a fresh response for the reviewer explaining the incorporated decisions, changes, and any remaining evidence-backed pushback. State whether a specific unresolved user decision still blocks progress. Produce an updated reviewer-facing response rather than repeating an outdated reply.`;

export function parseWriterRoute(output: string): ArtifactJudgment<WriterRoute> {
  return parseJudgment(output, ['ready', 'incomplete', 'human-decision'] as const, 'writer');
}

export function parseReviewerRoute(output: string): ArtifactJudgment<ReviewerRoute> {
  return parseJudgment(output, ['complete', 'revise', 'human-decision'] as const, 'reviewer');
}

function parseJudgment<const Route extends string>(output: string, allowed: readonly Route[], label: string): ArtifactJudgment<Route> {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) throw new Error('Judgment output did not contain a JSON object.');
  const value: unknown = JSON.parse(output.slice(first, last + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} judgment must be a JSON object.`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('outcome') || !keys.includes('reason')) throw new Error(`${label} judgment must contain exactly two fields: outcome and reason.`);
  if (typeof record.outcome !== 'string' || !allowed.includes(record.outcome as Route)) throw new Error(`${label} judgment outcome must be one of: ${allowed.join(', ')}.`);
  if (typeof record.reason !== 'string' || record.reason.trim().length === 0) throw new Error(`${label} judgment reason must be nonempty text.`);
  return { outcome: record.outcome as Route, reason: record.reason.trim() };
}
