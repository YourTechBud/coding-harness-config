import type { PresentationMetrics } from '../contracts.js';
import type { PromptInput } from '../prompts.js';

// What every walkthrough graph knows about the story. The repository path is the run's destination.
export type WalkthroughContext = Omit<PromptInput, 'repositoryPath'>;

export type Failure = { readonly message: string; readonly diagnostic: string };
export type Failed = { readonly outcome: 'failed'; readonly failure: Failure };

export type PresentationCreated = {
  readonly outcome: 'presentation-created';
  readonly curriculumPath: string;
  readonly deckPlanPath: string;
  readonly presentationPath: string;
} & PresentationMetrics;

export type SocraticCompleted = {
  readonly outcome: 'socratic-walkthrough-completed';
  readonly curriculumPath: string;
};

export const SHOW_ME_MODIFIER = [{ kind: 'skill', name: 'show-me' }] as const;

export function promptInput(state: { readonly repositoryPath: string; readonly context: WalkthroughContext }): PromptInput {
  return { repositoryPath: state.repositoryPath, ...state.context };
}

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Solution walkthrough state is missing its ${label}.`);
  return value;
}

export function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.reason !== undefined) return errorText(record.reason);
    if (record.message !== undefined) return errorText(record.message);
    if (record.error !== undefined) return errorText(record.error);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
