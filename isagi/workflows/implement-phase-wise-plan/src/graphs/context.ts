import { createJudgmentGraph, type AgentPane } from 'isagi-workflow-common-graphs';

import {
  parseDiscoveryResult,
  parseImplementerOutcomeResult,
  parsePhaseImplementationKindResult,
  parsePlannerOutcomeResult,
  type ImplementerOutcome,
  type PlanPhase,
  type PlannerOutcome,
} from '../judgments.js';

export type Options = {
  readonly autoCommit: boolean;
  readonly autoReview: boolean;
  readonly humanInTheLoop: boolean;
};

export type Plan = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phases: readonly PlanPhase[];
  readonly currentPhaseIndex: number;
};

export type Failure = { readonly message: string; readonly diagnostic: string };
export type Failed = { readonly outcome: 'failed'; readonly failure: Failure };

export type ImplementerActivity = 'alignment' | 'confirmation' | 'implementation';
export type CompletionCheckpoint = 'before-review' | 'after-review';
export type TurnPurpose = ImplementerActivity | CompletionCheckpoint;

export type ImplementerExchanged = { readonly outcome: 'exchanged'; readonly implementer: AgentPane; readonly implementerTurn: string; readonly result: ImplementerOutcome };
export type PlannerExchanged = { readonly outcome: 'exchanged'; readonly plannerTurn: string; readonly result: Exclude<PlannerOutcome, 'severe-flag'> | 'severe-flag-resolved' };

// One judgment graph per parser, keyed for this workflow.
export const DiscoveryJudgment = createJudgmentGraph({ key: 'ImplementPhaseWisePlanDiscoveryJudgment', title: 'Discover the plan', parse: parseDiscoveryResult });
export const ImplementerKindJudgment = createJudgmentGraph({ key: 'ImplementPhaseWisePlanImplementerKind', title: 'Classify the implementer', parse: (output) => parsePhaseImplementationKindResult(output).implementationKind });
export const ImplementerOutcomeJudgment = createJudgmentGraph({ key: 'ImplementPhaseWisePlanImplementerOutcome', title: 'Classify the implementer turn', parse: (output) => parseImplementerOutcomeResult(output).outcome });
export const PlannerOutcomeJudgment = createJudgmentGraph({ key: 'ImplementPhaseWisePlanPlannerOutcome', title: 'Classify the planner turn', parse: (output) => parsePlannerOutcomeResult(output).outcome });

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Implement phase-wise plan state is missing its ${label}.`);
  return value;
}

export function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
