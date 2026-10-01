import type { OperationContext } from '@yourtechbudstudio/isagi-workflow-sdk';
import { createJudgmentGraph, failStep } from 'isagi-workflow-common-graphs';

import { latestAssistantTurnText, parseReviewRoute } from '../judgments.js';

export type Failure = { readonly message: string; readonly diagnostic: string };
export type Failed = { readonly outcome: 'failed'; readonly failure: Failure };

export const ReviewRoutingGraph = createJudgmentGraph({
  key: 'EngineeringGuidanceReviewRouting',
  title: 'Route the review',
  parse: parseReviewRoute,
});

/** The latest complete assistant turn of a session. A missing turn fails the step so Retry reads it again. */
export async function readLatestTurn(ctx: OperationContext, agentSessionId: number, role: 'reviewer' | 'fixer'): Promise<string> {
  const text = latestAssistantTurnText(await ctx.getConversationHistory(agentSessionId));
  if (text) return text;
  return failStep(ctx, { phase: 'Review loop failed', message: `No ${role} response was found` }, `${role} session ${agentSessionId} has no complete assistant turn to inspect.`);
}

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Engineering guidance review state is missing its ${label}.`);
  return value;
}
