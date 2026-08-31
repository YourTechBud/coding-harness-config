import {
  cont,
  done,
  event as workflowEvent,
  fail,
  suspend,
  wait,
  type WorkflowContext,
  type WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { deckArchitect, deckBuilder, guide } from './constants.js';
import {
  deckPlanExists,
  inspectPlanningArtifacts,
  readArchitectedDeckPlan,
  readGenericCurriculumBundle,
  removePlanningArtifacts,
  type ArchitectedDeckPlan,
} from './curriculum-v3.js';
import { assertExpectedFile, validatePresentation } from './contracts.js';
import {
  genericDeckArchitecturePrompt,
  genericDeckAssemblyPrompt,
  genericDeckNeighborhoodPrompt,
  genericDeckShellPrompt,
  genericSocraticPrompt,
  type PromptInput,
} from './prompts.js';
import type {
  ArtifactPaths,
  AudienceProfile,
  DeliveryMechanism,
  VisibleAgent,
  WalkthroughPaths,
} from './types.js';

const SHOW_ME_MODIFIER = [{ kind: 'skill', name: 'show-me' }] as const;

export type Stage =
  | { readonly kind: 'start_curriculum_workflow' }
  | { readonly kind: 'await_curriculum_workflow'; readonly runId: number }
  | { readonly kind: 'start_presentation' }
  | { readonly kind: 'start_deck_architecture' }
  | { readonly kind: 'await_deck_architecture'; readonly architect: VisibleAgent }
  | { readonly kind: 'start_deck_shell'; readonly plan: ArchitectedDeckPlan }
  | { readonly kind: 'await_deck_shell'; readonly plan: ArchitectedDeckPlan; readonly builder: VisibleAgent }
  | { readonly kind: 'start_neighborhood'; readonly plan: ArchitectedDeckPlan; readonly neighborhoodIndex: number }
  | { readonly kind: 'await_neighborhood'; readonly plan: ArchitectedDeckPlan; readonly neighborhoodIndex: number; readonly builder: VisibleAgent }
  | { readonly kind: 'start_presentation_assembly'; readonly plan: ArchitectedDeckPlan }
  | { readonly kind: 'await_presentation_assembly'; readonly plan: ArchitectedDeckPlan; readonly builder: VisibleAgent }
  | { readonly kind: 'start_socratic_walkthrough' }
  | { readonly kind: 'await_socratic_walkthrough'; readonly guide: VisibleAgent }
  | { readonly kind: 'await_socratic_completion'; readonly guide: VisibleAgent };

export type State = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly paths: WalkthroughPaths;
  readonly audienceProfile: AudienceProfile;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly stage: Stage;
};

export async function step(ctx: WorkflowContext, state: State, incoming: unknown): Promise<WorkflowResult> {
  const input = promptInput(state);
  switch (state.stage.kind) {
    case 'start_curriculum_workflow': {
      let reusableArtifacts;
      try {
        reusableArtifacts = inspectPlanningArtifacts(state.repositoryPath, state.paths);
      } catch (error) {
        try {
          const removed = removePlanningArtifacts(state.repositoryPath, state.paths);
          await ctx.log('warning', `Reset walkthrough planning artifacts after deterministic validation failed: ${errorText(error)} Removed: ${removed.join(', ') || 'none'}.`);
          reusableArtifacts = { curriculum: false, deckPlan: false };
        } catch (removalError) {
          return failed(ctx, 'Invalid walkthrough planning artifacts could not be reset.', errorText(removalError));
        }
      }

      if (reusableArtifacts.curriculum) {
        const deckMessage = state.deliveryMechanism === 'presentation'
          ? reusableArtifacts.deckPlan ? 'The approved deck plan will also be reused.' : 'A new deck plan will be created.'
          : 'Continuing directly to Socratic learning.';
        await ctx.log('info', `Reusing existing curriculum ${state.paths.curriculumPath}; curriculum design is skipped.`);
        await ctx.setUiFeedback({ phase: 'Reusing the approved curriculum', message: deckMessage });
        return cont(withStage(state, nextDeliveryStage(state.deliveryMechanism)));
      }

      await ctx.setUiFeedback({ phase: 'Designing the walkthrough curriculum', message: 'Creating the analysis and curriculum before continuing to the selected delivery mode.' });
      const runId = await ctx.startWorkflow('design-curriculum', {
        sources: [
          { id: 'current-state', path: state.sources.currentStatePath, description: 'The current-state map and evidence the proposal changes.' },
          { id: 'architecture', path: state.sources.architecturePath, description: 'The proposed architecture and its consequential decisions.' },
          { id: 'program-design', path: state.sources.programDesignPath, description: 'The proposed program design and exact changed contracts.' },
        ],
        learningGoal: 'Understand the current-state map, proposed architecture, and program design well enough to approve or reject the proposed solution.',
        audienceFamiliarity: curriculumFamiliarity(state.audienceProfile),
        audienceDepth: curriculumDepth(state.audienceProfile),
        teachingBrief: 'Establish enough of the current-state map to evaluate the proposal. Connect architecture and program realization wherever teaching them together preserves context. Keep exact changed contracts available as reference material needed for approval. Choose the final storyline from the actual sources when a different grouping is clearer.',
        outputDirectory: state.paths.walkthroughDirectory,
      });
      await ctx.log('info', `Started design-curriculum child workflow ${runId}.`);
      return suspend(withStage(state, { kind: 'await_curriculum_workflow', runId }), wait.workflow(runId));
    }

    case 'await_curriculum_workflow': {
      try {
        completedCurriculumResult(incoming, state.stage.runId, state.paths);
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
        return cont(withStage(state, nextDeliveryStage(state.deliveryMechanism)));
      } catch (error) {
        return failed(ctx, 'The curriculum workflow did not complete successfully.', errorText(error));
      }
    }

    case 'start_presentation': {
      let bundle;
      try {
        bundle = readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, 'Presentation creation cannot start because the curriculum is invalid.', errorText(error));
      }

      if (!deckPlanExists(state.repositoryPath, state.paths)) {
        return cont(withStage(state, { kind: 'start_deck_architecture' }));
      }

      try {
        const plan = readArchitectedDeckPlan(state.repositoryPath, state.paths, bundle);
        await ctx.log('info', `Reusing existing deck plan ${state.paths.deckPlanPath}; deck architecture is skipped.`);
        await ctx.setUiFeedback({ phase: 'Reusing the approved deck plan', message: `Rebuilding ${state.paths.htmlPath} neighborhood by neighborhood.` });
        return cont(withStage(state, { kind: 'start_deck_shell', plan }));
      } catch (error) {
        return failed(ctx, 'The existing deck plan cannot be reused.', errorText(error));
      }
    }

    case 'start_deck_architecture': {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, 'Deck architecture cannot start because the curriculum is invalid.', errorText(error));
      }

      await ctx.setUiFeedback({ phase: 'Architecting the presentation', message: 'Planning the narrative, audience conclusions, and complete coverage before visual construction.' });
      const architect = visible(await ctx.spawnAgentSession({ ...deckArchitect, prompt: genericDeckArchitecturePrompt(input) }));
      return suspend(withStage(state, { kind: 'await_deck_architecture', architect }), wait.agentTurn(architect));
    }

    case 'await_deck_architecture': {
      const turnFailure = turnError(incoming, 'Deck architecture', state.stage.architect);
      if (turnFailure) return failed(ctx, 'Deck architecture failed. Its pane remains open.', turnFailure);
      try {
        const bundle = readGenericCurriculumBundle(state.repositoryPath, state.paths);
        const plan = readArchitectedDeckPlan(state.repositoryPath, state.paths, bundle);
        await ctx.closePane(state.stage.architect.paneId);
        return cont(withStage(state, { kind: 'start_deck_shell', plan }));
      } catch (error) {
        return failed(ctx, 'The deck architecture plan is invalid. Its pane remains open.', errorText(error));
      }
    }

    case 'start_deck_shell': {
      await ctx.setUiFeedback({ phase: 'Establishing the presentation design', message: 'Creating the shared presentation environment and opening slide.' });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, prompt: genericDeckShellPrompt(input) }));
      return suspend(withStage(state, { kind: 'await_deck_shell', plan: state.stage.plan, builder }), wait.agentTurn(builder));
    }

    case 'await_deck_shell': {
      const turnFailure = turnError(incoming, 'Deck shell creation', state.stage.builder);
      if (turnFailure) return failed(ctx, 'Deck shell creation failed. Its pane remains open.', turnFailure);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck shell');
        await ctx.closePane(state.stage.builder.paneId);
        return cont(withStage(state, { kind: 'start_neighborhood', plan: state.stage.plan, neighborhoodIndex: 0 }));
      } catch (error) {
        return failed(ctx, 'The deck shell is missing. Its pane remains open.', errorText(error));
      }
    }

    case 'start_neighborhood': {
      const neighborhood = neighborhoodAt(state.stage.plan, state.stage.neighborhoodIndex);
      await ctx.setUiFeedback({ phase: `Creating ${neighborhood.title}`, message: `Neighborhood ${state.stage.neighborhoodIndex + 1} of ${state.stage.plan.neighborhoods.length} in a fresh Show Me session.` });
      const builder = visible(await ctx.spawnAgentSession({
        ...deckBuilder,
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericDeckNeighborhoodPrompt(input, state.stage.plan, neighborhood, state.stage.neighborhoodIndex),
      }));
      return suspend(withStage(state, { ...state.stage, kind: 'await_neighborhood', builder }), wait.agentTurn(builder));
    }

    case 'await_neighborhood': {
      const turnFailure = turnError(incoming, 'Neighborhood construction', state.stage.builder);
      if (turnFailure) return failed(ctx, 'Neighborhood construction failed. Its pane remains open.', turnFailure);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck');
        await ctx.closePane(state.stage.builder.paneId);
        if (state.stage.neighborhoodIndex + 1 < state.stage.plan.neighborhoods.length) {
          return cont(withStage(state, {
            kind: 'start_neighborhood',
            plan: state.stage.plan,
            neighborhoodIndex: state.stage.neighborhoodIndex + 1,
          }));
        }
        return cont(withStage(state, { kind: 'start_presentation_assembly', plan: state.stage.plan }));
      } catch (error) {
        return failed(ctx, 'The walkthrough deck is missing after neighborhood construction. Its pane remains open.', errorText(error));
      }
    }

    case 'start_presentation_assembly': {
      await ctx.setUiFeedback({ phase: 'Assembling the walkthrough presentation', message: 'Making the neighborhood work feel like one polished presentation.' });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, modifiers: SHOW_ME_MODIFIER, prompt: genericDeckAssemblyPrompt(input) }));
      return suspend(withStage(state, { kind: 'await_presentation_assembly', plan: state.stage.plan, builder }), wait.agentTurn(builder));
    }

    case 'await_presentation_assembly': {
      const turnFailure = turnError(incoming, 'Final deck assembly', state.stage.builder);
      if (turnFailure) return failed(ctx, 'Final deck assembly failed. Its pane remains open.', turnFailure);
      try {
        const metrics = validatePresentation(state.repositoryPath, state.paths.htmlPath, state.stage.plan);
        await ctx.closePane(state.stage.builder.paneId);
        await ctx.setUiFeedback({ phase: 'Walkthrough presentation created', message: `Open ${state.paths.htmlPath}.` });
        return done({
          outcome: 'presentation-created',
          curriculumPath: state.paths.curriculumPath,
          deckPlanPath: state.paths.deckPlanPath,
          presentationPath: state.paths.htmlPath,
          ...metrics,
        });
      } catch (error) {
        return failed(ctx, 'The assembled walkthrough deck does not satisfy the presentation contract. Its pane remains open.', errorText(error));
      }
    }

    case 'start_socratic_walkthrough': {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, 'Socratic learning cannot start because the curriculum is invalid.', errorText(error));
      }

      await ctx.setUiFeedback({ phase: 'Starting the Socratic walkthrough', message: 'The guide will use the approved curriculum and grounded coverage analysis.' });
      const spawned = visible(await ctx.spawnAgentSession({ ...guide, modifiers: SHOW_ME_MODIFIER, prompt: genericSocraticPrompt(input) }));
      return suspend(withStage(state, { kind: 'await_socratic_walkthrough', guide: spawned }), wait.agentTurn(spawned));
    }

    case 'await_socratic_walkthrough': {
      const turnFailure = turnError(incoming, 'Socratic walkthrough', state.stage.guide);
      if (turnFailure) return failed(ctx, 'The Socratic guide failed.', turnFailure);
      await ctx.setUiFeedback({ phase: 'Socratic walkthrough in progress', message: 'Continue the discussion in the guide pane. Press workflow Continue when you are finished.' });
      return suspend(withStage(state, { kind: 'await_socratic_completion', guide: state.stage.guide }), wait.userContinue());
    }

    case 'await_socratic_completion': {
      if (!workflowEvent.isUserContinue(incoming)) {
        return failed(ctx, 'The Socratic walkthrough could not finish.', 'Expected user Continue.');
      }
      await ctx.closePane(state.stage.guide.paneId);
      return done({ outcome: 'socratic-walkthrough-completed', curriculumPath: state.paths.curriculumPath });
    }

    default:
      return assertNever(state.stage);
  }
}

function nextDeliveryStage(deliveryMechanism: DeliveryMechanism): Stage {
  return deliveryMechanism === 'presentation' ? { kind: 'start_presentation' } : { kind: 'start_socratic_walkthrough' };
}

function promptInput(state: State): PromptInput {
  return {
    repositoryPath: state.repositoryPath,
    story: state.story,
    sources: state.sources,
    paths: state.paths,
    audienceProfile: state.audienceProfile,
  };
}

function visible(input: VisibleAgent): VisibleAgent {
  return input;
}

function turnError(incoming: unknown, label: string, agent: VisibleAgent): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) return `${label} failed in pane ${agent.paneId}: ${incoming.reason}`;
  if (!workflowEvent.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${agent.paneId}.`;
  return null;
}

function neighborhoodAt(plan: ArchitectedDeckPlan, index: number): ArchitectedDeckPlan['neighborhoods'][number] {
  const neighborhood = plan.neighborhoods[index];
  if (!neighborhood) throw new Error(`No deck neighborhood exists at index ${index}.`);
  return neighborhood;
}

function curriculumFamiliarity(profile: AudienceProfile): string {
  return profile.familiarity === 'new'
    ? 'The audience is new to this codebase and needs the essential context required to evaluate the proposal.'
    : 'The audience is familiar with this codebase; emphasize consequential changes and include context only when it changes evaluation of the proposal.';
}

function curriculumDepth(profile: AudienceProfile): string {
  switch (profile.technicalDepth) {
    case 'product':
      return 'Explain behavior, user and operational consequences, and tradeoffs while keeping exact technical evidence available for inspection.';
    case 'system-design':
      return 'Explain system boundaries, ownership, flows, state changes, tradeoffs, and the consequential contracts needed to evaluate the design.';
    case 'implementation':
      return 'Explain system intent together with implementation mechanics, exact changed contracts, failure behavior, and migration consequences.';
  }
}

function completedCurriculumResult(incoming: unknown, runId: number, paths: WalkthroughPaths): void {
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results || results.length !== 1 || results[0]?.runId !== runId) {
    throw new Error(`Expected completion result for design-curriculum workflow run ${runId}.`);
  }
  const joined = results[0];
  if (joined.status !== 'done') throw new Error(`Design-curriculum workflow run ${runId} failed: ${errorText(joined.error)}`);
  if (!joined.result || typeof joined.result !== 'object' || Array.isArray(joined.result)) {
    throw new Error(`Design-curriculum workflow run ${runId} returned no result object.`);
  }
  const result = joined.result as Record<string, unknown>;
  if (
    result.outcome !== 'curriculum-created'
    || result.analysisPath !== paths.curriculumAnalysisPath
    || result.curriculumPath !== paths.curriculumPath
  ) {
    throw new Error(`Design-curriculum workflow run ${runId} returned an invalid result.`);
  }
}

async function failed(ctx: WorkflowContext, message: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Solution walkthrough failed', message });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function errorText(value: unknown): string {
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

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow stage: ${JSON.stringify(value)}`);
}
