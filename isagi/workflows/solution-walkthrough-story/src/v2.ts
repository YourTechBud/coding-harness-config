import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { deckArchitect, deckBuilder, deckReviewRouting, deckVerifier, guide, preparer } from './constants.js';
import {
  artifactFileExists,
  assertExpectedFile,
  readArtifactText,
  readCurriculumV2,
  readDeckPlan,
  readTopicInventoriesV2,
} from './contracts.js';
import { deckReviewPath, legacyDeckReviewPath } from './paths.js';
import {
  completedSingleHeadlessResult,
  deckReviewRoutingPrompt,
  latestAssistantTurnText,
  parseDeckReviewRoute,
  type DeckReviewRoute,
} from './v2-judgments.js';
import {
  architectRevisionPrompt,
  builderRevisionPrompt,
  curriculumPrompt,
  deckArchitecturePrompt,
  deckShellPrompt,
  finalAssemblyPrompt,
  guidedBeatPrompt,
  guidedChapterReviewPrompt,
  presentationGuidePrompt,
  realizationUnitPrompt,
  sourceInventoryPrompt,
  verifierPrompt,
  type V2PromptInput,
} from './v2-prompts.js';
import {
  artifactDescriptors,
  type ArtifactPaths,
  type AudienceProfile,
  type CurriculumV2,
  type DeckPlan,
  type DeliveryMode,
  type Guide,
  type LegacyDeckReview,
  type VisibleAgent,
  type WalkthroughV2Paths,
} from './types.js';

const MAX_REVIEW_ROUNDS = 3;

type ReviewArtifact = string | LegacyDeckReview;

export type V2Stage =
  | { readonly kind: 'start_source_analysis' }
  | { readonly kind: 'await_source_analysis'; readonly agents: readonly VisibleAgent[]; readonly agentIndex: number }
  | { readonly kind: 'start_curriculum_integration' }
  | { readonly kind: 'await_curriculum_integration'; readonly agent: VisibleAgent }
  | { readonly kind: 'start_guided_tutorial'; readonly curriculum: CurriculumV2 }
  | { readonly kind: 'await_guided_beat'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly beatIndex: number; readonly guide: Guide }
  | { readonly kind: 'await_guided_continue'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly beatIndex: number; readonly guide: Guide }
  | { readonly kind: 'send_guided_beat'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly beatIndex: number; readonly guide: Guide }
  | { readonly kind: 'send_chapter_review'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly guide: Guide }
  | { readonly kind: 'await_chapter_review'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly guide: Guide }
  | { readonly kind: 'await_chapter_continue'; readonly curriculum: CurriculumV2; readonly chapterIndex: number; readonly guide: Guide }
  | { readonly kind: 'start_deck_architecture'; readonly curriculum: CurriculumV2 }
  | { readonly kind: 'await_deck_architecture'; readonly curriculum: CurriculumV2; readonly architect: VisibleAgent }
  | { readonly kind: 'start_deck_shell'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent }
  | { readonly kind: 'await_deck_shell'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent }
  | { readonly kind: 'send_realization_unit'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly unitIndex: number }
  | { readonly kind: 'await_realization_unit'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly unitIndex: number }
  | { readonly kind: 'send_final_assembly'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent }
  | { readonly kind: 'await_final_assembly'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent }
  | { readonly kind: 'start_verification'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly round: number }
  | { readonly kind: 'await_verification'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round: number }
  | { readonly kind: 'await_review_routing'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: string; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round: number }
  | { readonly kind: 'await_human_decision'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: string; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round: number }
  | { readonly kind: 'send_architect_revision'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: ReviewArtifact; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round?: number | undefined }
  | { readonly kind: 'await_architect_revision'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: ReviewArtifact; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round?: number | undefined }
  | { readonly kind: 'send_builder_revision'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: ReviewArtifact; readonly architectResponse?: string | undefined; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round?: number | undefined }
  | { readonly kind: 'await_builder_revision'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly review: ReviewArtifact; readonly architectResponse?: string | undefined; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round?: number | undefined }
  | { readonly kind: 'send_reverification'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly architect: VisibleAgent; readonly builder: VisibleAgent; readonly verifier: VisibleAgent; readonly round: number; readonly previousReview?: string | undefined; readonly architectResponse?: string | undefined; readonly builderResponse?: string | undefined }
  | { readonly kind: 'start_presentation_review'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan }
  | { readonly kind: 'await_presentation_guide'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly guide: Guide }
  | { readonly kind: 'await_presentation_continue'; readonly curriculum: CurriculumV2; readonly plan: DeckPlan; readonly guide: Guide };

export type V2State = {
  readonly stateVersion: 2;
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly paths: WalkthroughV2Paths;
  readonly audienceProfile: AudienceProfile;
  readonly deliveryMode: DeliveryMode;
  readonly stage: V2Stage;
};

export async function stepV2(ctx: WorkflowContext, state: V2State, incoming: unknown): Promise<WorkflowResult> {
  const input = promptInput(state);
  switch (state.stage.kind) {
    case 'start_source_analysis': {
      ensureDirectories(state);
      await ctx.setUiFeedback({ phase: 'Analyzing walkthrough sources' });
      const agents: VisibleAgent[] = [];
      for (const { kind } of artifactDescriptors) {
        agents.push(visible(await ctx.spawnAgentSession({ ...preparer, prompt: sourceInventoryPrompt(input, kind) })));
      }
      await ctx.log('info', `Started three visible source analysts in panes ${agents.map(({ paneId }) => paneId).join(', ')}.`);
      return suspend(withStage(state, { kind: 'await_source_analysis', agents, agentIndex: 0 }), wait.agentTurn(at(agents, 0)));
    }
    case 'await_source_analysis': {
      const error = turnError(incoming, 'Source analysis', at(state.stage.agents, state.stage.agentIndex));
      if (error) return failed(ctx, 'Source analysis failed. Analyst panes remain open.', error);
      const next = state.stage.agentIndex + 1;
      if (next < state.stage.agents.length) return suspend(withStage(state, { ...state.stage, agentIndex: next }), wait.agentTurn(at(state.stage.agents, next)));
      try {
        readTopicInventoriesV2(state.repositoryPath, state.sources, state.paths);
        await closeAll(ctx, state.stage.agents, 'source analysts');
        return cont(withStage(state, { kind: 'start_curriculum_integration' }));
      } catch (error) {
        return failed(ctx, 'Source inventories are invalid. Analyst panes remain open.', errorText(error));
      }
    }
    case 'start_curriculum_integration': {
      await ctx.setUiFeedback({ phase: 'Shaping the audience curriculum' });
      const agent = visible(await ctx.spawnAgentSession({ ...preparer, prompt: curriculumPrompt(input) }));
      return suspend(withStage(state, { kind: 'await_curriculum_integration', agent }), wait.agentTurn(agent));
    }
    case 'await_curriculum_integration': {
      const error = turnError(incoming, 'Curriculum integration', state.stage.agent);
      if (error) return failed(ctx, 'Curriculum integration failed. Its pane remains open.', error);
      try {
        const inventories = readTopicInventoriesV2(state.repositoryPath, state.sources, state.paths);
        const curriculum = readCurriculumV2(state.repositoryPath, state.story, state.sources, state.audienceProfile, state.paths, inventories);
        await closeAll(ctx, [state.stage.agent], 'curriculum integrator');
        return cont(withStage(state, state.deliveryMode === 'guided-tutorial' ? { kind: 'start_guided_tutorial', curriculum } : { kind: 'start_deck_architecture', curriculum }));
      } catch (error) {
        return failed(ctx, 'The audience curriculum is invalid. Its pane remains open.', errorText(error));
      }
    }
    case 'start_guided_tutorial': {
      const chapterIndex = 0;
      const beatIndex = 0;
      const chapter = chapterAt(state.stage.curriculum, chapterIndex);
      const beat = beatAt(chapter, beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: beat.title });
      const spawned = await ctx.spawnAgentSession({ ...guide, prompt: guidedBeatPrompt(input, state.stage.curriculum, chapter, beat) });
      const guideSession = visible(spawned);
      return suspend(withStage(state, { kind: 'await_guided_beat', curriculum: state.stage.curriculum, chapterIndex, beatIndex, guide: guideSession }), wait.agentTurn(spawned));
    }
    case 'send_guided_beat': {
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const beat = beatAt(chapter, state.stage.beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: beat.title });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.guide.agentSessionId, prompt: guidedBeatPrompt(input, state.stage.curriculum, chapter, beat) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_guided_beat' }), wait.agentTurn(sent));
    }
    case 'await_guided_beat': {
      const error = guideError(incoming, 'Guided tutorial');
      if (error) return failed(ctx, 'The tutorial guide failed.', error);
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const beat = beatAt(chapter, state.stage.beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: `${beat.title}. Press Continue when this checkpoint is complete.` });
      return suspend(withStage(state, { ...state.stage, kind: 'await_guided_continue' }), wait.userContinue());
    }
    case 'await_guided_continue': {
      if (!workflowEvent.isUserContinue(incoming)) return failed(ctx, 'The tutorial could not advance.', 'Expected user Continue.');
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      if (state.stage.beatIndex + 1 < chapter.beats.length) return cont(withStage(state, { ...state.stage, kind: 'send_guided_beat', beatIndex: state.stage.beatIndex + 1 }));
      return cont(withStage(state, { kind: 'send_chapter_review', curriculum: state.stage.curriculum, chapterIndex: state.stage.chapterIndex, guide: state.stage.guide }));
    }
    case 'send_chapter_review': {
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.guide.agentSessionId, prompt: guidedChapterReviewPrompt(state.stage.curriculum, chapter) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_chapter_review' }), wait.agentTurn(sent));
    }
    case 'await_chapter_review': {
      const error = guideError(incoming, 'Chapter review');
      if (error) return failed(ctx, 'The tutorial guide failed.', error);
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      await ctx.setUiFeedback({ phase: `Reviewing ${chapter.title}`, message: 'Press Continue when you understand this chapter.' });
      return suspend(withStage(state, { ...state.stage, kind: 'await_chapter_continue' }), wait.userContinue());
    }
    case 'await_chapter_continue': {
      if (!workflowEvent.isUserContinue(incoming)) return failed(ctx, 'The tutorial could not advance.', 'Expected user Continue.');
      if (state.stage.chapterIndex + 1 < state.stage.curriculum.chapters.length) return cont(withStage(state, { kind: 'send_guided_beat', curriculum: state.stage.curriculum, chapterIndex: state.stage.chapterIndex + 1, beatIndex: 0, guide: state.stage.guide }));
      await ctx.closePane(state.stage.guide.paneId);
      return done({ outcome: 'guided-tutorial-completed', curriculumPath: state.paths.curriculumPath, chapterCount: state.stage.curriculum.chapters.length, beatCount: beatCount(state.stage.curriculum) });
    }
    case 'start_deck_architecture': {
      await ctx.setUiFeedback({ phase: 'Architecting the walkthrough deck' });
      const architect = visible(await ctx.spawnAgentSession({ ...deckArchitect, prompt: deckArchitecturePrompt(input) }));
      return suspend(withStage(state, { kind: 'await_deck_architecture', curriculum: state.stage.curriculum, architect }), wait.agentTurn(architect));
    }
    case 'await_deck_architecture': {
      const error = turnError(incoming, 'Deck architecture', state.stage.architect);
      if (error) return failed(ctx, 'Deck architecture failed. Its pane remains open.', error);
      try {
        const plan = readDeckPlan(state.repositoryPath, state.paths, state.stage.curriculum);
        return cont(withStage(state, { kind: 'start_deck_shell', curriculum: state.stage.curriculum, plan, architect: state.stage.architect }));
      } catch (error) {
        return failed(ctx, 'The deck plan is invalid. Its pane remains open.', errorText(error));
      }
    }
    case 'start_deck_shell': {
      await ctx.setUiFeedback({ phase: 'Building the deck shell' });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, prompt: deckShellPrompt(input) }));
      return suspend(withStage(state, { kind: 'await_deck_shell', curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder }), wait.agentTurn(builder));
    }
    case 'await_deck_shell': {
      const error = turnError(incoming, 'Deck shell', state.stage.builder);
      if (error) return failed(ctx, 'Deck shell creation failed. Build panes remain open.', error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck');
        return cont(withStage(state, { ...state.stage, kind: 'send_realization_unit', unitIndex: 0 }));
      } catch (error) {
        return failed(ctx, 'The deck shell is missing. Build panes remain open.', errorText(error));
      }
    }
    case 'send_realization_unit': {
      const unit = state.stage.plan.realizationUnits[state.stage.unitIndex];
      if (!unit) return cont(withStage(state, { kind: 'send_final_assembly', curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder }));
      await ctx.setUiFeedback({ phase: 'Building walkthrough slides', message: `Realization unit ${state.stage.unitIndex + 1} of ${state.stage.plan.realizationUnits.length}: ${unit.id}.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: realizationUnitPrompt(input, state.stage.plan, unit) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_realization_unit' }), wait.agentTurn(sent));
    }
    case 'await_realization_unit': {
      const error = turnError(incoming, 'Deck realization', state.stage.builder);
      if (error) return failed(ctx, 'Deck realization failed. Build panes remain open.', error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck');
        return cont(withStage(state, { ...state.stage, kind: 'send_realization_unit', unitIndex: state.stage.unitIndex + 1 }));
      } catch (error) {
        return failed(ctx, 'The walkthrough deck is missing after realization. Build panes remain open.', errorText(error));
      }
    }
    case 'send_final_assembly': {
      await ctx.setUiFeedback({ phase: 'Assembling the unified walkthrough deck' });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: finalAssemblyPrompt(input) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_final_assembly' }), wait.agentTurn(sent));
    }
    case 'await_final_assembly': {
      const error = turnError(incoming, 'Final deck assembly', state.stage.builder);
      if (error) return failed(ctx, 'Final deck assembly failed. Build panes remain open.', error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck');
        return cont(withStage(state, { kind: 'start_verification', curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder, round: 1 }));
      } catch (error) {
        return failed(ctx, 'The assembled deck is missing. Build panes remain open.', errorText(error));
      }
    }
    case 'start_verification': {
      await ctx.setUiFeedback({ phase: 'Verifying the walkthrough deck', message: `Review round ${state.stage.round}.` });
      const verifier = visible(await ctx.spawnAgentSession({ ...deckVerifier, prompt: verifierPrompt(input, state.stage.round) }));
      return suspend(withStage(state, { ...state.stage, kind: 'await_verification', verifier }), wait.agentTurn(verifier));
    }
    case 'send_reverification': {
      await ctx.setUiFeedback({ phase: 'Re-verifying the walkthrough deck', message: `Review round ${state.stage.round}.` });
      const previous = state.stage.previousReview && state.stage.builderResponse
        ? { review: state.stage.previousReview, architectResponse: state.stage.architectResponse, builderResponse: state.stage.builderResponse }
        : undefined;
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.verifier.agentSessionId, prompt: verifierPrompt(input, state.stage.round, previous) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_verification' }), wait.agentTurn(sent));
    }
    case 'await_verification': {
      const error = turnError(incoming, 'Deck verification', state.stage.verifier);
      if (error) return failed(ctx, 'Deck verification failed. Presentation panes remain open.', error);
      try {
        const review = readDeckReviewArtifact(state.repositoryPath, state.paths, state.stage.round);
        return startDeckReviewRouting(ctx, state, { ...state.stage, kind: 'await_review_routing', review });
      } catch (error) {
        return failed(ctx, 'The deck review file is missing. Presentation panes remain open.', errorText(error));
      }
    }
    case 'await_review_routing': {
      let route: DeckReviewRoute;
      try {
        const result = completedSingleHeadlessResult(incoming);
        route = parseDeckReviewRoute(result.output ?? '');
        await ctx.log('info', `Deck review round ${state.stage.round} routing outcome=${route}.`);
      } catch (error) {
        return failed(ctx, 'The deck review could not be routed. Presentation panes remain open.', errorText(error));
      }
      switch (route) {
        case 'complete':
          await closeAll(ctx, [state.stage.architect, state.stage.builder, state.stage.verifier], 'deck architect, builder, and verifier');
          return cont(withStage(state, { kind: 'start_presentation_review', curriculum: state.stage.curriculum, plan: state.stage.plan }));
        case 'human-decision':
          await ctx.setUiFeedback({ kind: 'warning', phase: 'Waiting for your decision', message: `Review ${deckReviewPath(state.paths, state.stage.round)}, resolve the decision with the verifier, then press Continue.` });
          return suspend(withStage(state, { ...state.stage, kind: 'await_human_decision' }), wait.userContinue());
        case 'builder':
        case 'architect-and-builder': {
          if (state.stage.round >= MAX_REVIEW_ROUNDS) return failed(ctx, 'The deck still needs revision after three reviews. Presentation panes remain open.', `Review limit reached at ${deckReviewPath(state.paths, state.stage.round)}.`);
          const common = { curriculum: state.stage.curriculum, plan: state.stage.plan, review: state.stage.review, architect: state.stage.architect, builder: state.stage.builder, verifier: state.stage.verifier, round: state.stage.round };
          return cont(withStage(state, route === 'architect-and-builder' ? { kind: 'send_architect_revision', ...common } : { kind: 'send_builder_revision', ...common }));
        }
        default:
          return assertNever(route);
      }
    }
    case 'await_human_decision': {
      if (!workflowEvent.isUserContinue(incoming)) return failed(ctx, 'The deck review decision could not be resumed.', 'Expected user Continue after a deck review decision.');
      try {
        const resolution = await latestCompleteTurn(ctx, state.stage.verifier, 'verifier');
        const review = `${state.stage.review}\n\n## Human decision follow-up\n\n${resolution}`;
        return startDeckReviewRouting(ctx, state, { ...state.stage, kind: 'await_review_routing', review });
      } catch (error) {
        return failed(ctx, 'No completed decision response was found. Presentation panes remain open.', errorText(error));
      }
    }
    case 'send_architect_revision': {
      const round = reviewRound(state.stage.round, state.stage.review);
      const review = reviewArtifactText(state.stage.review);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.architect.agentSessionId, prompt: architectRevisionPrompt(input, round, review) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_architect_revision' }), wait.agentTurn(sent));
    }
    case 'await_architect_revision': {
      const error = turnError(incoming, 'Architect revision', state.stage.architect);
      if (error) return failed(ctx, 'Deck architecture revision failed. Presentation panes remain open.', error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.architect, 'architect');
        const plan = readDeckPlan(state.repositoryPath, state.paths, state.stage.curriculum);
        return cont(withStage(state, { ...state.stage, kind: 'send_builder_revision', plan, review: reviewArtifactText(state.stage.review), architectResponse: response, round: reviewRound(state.stage.round, state.stage.review) }));
      } catch (error) {
        return failed(ctx, 'The architect revision could not be handed off. Presentation panes remain open.', errorText(error));
      }
    }
    case 'send_builder_revision': {
      const round = reviewRound(state.stage.round, state.stage.review);
      const review = reviewArtifactText(state.stage.review);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: builderRevisionPrompt(input, round, review, state.stage.architectResponse) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_builder_revision' }), wait.agentTurn(sent));
    }
    case 'await_builder_revision': {
      const error = turnError(incoming, 'Builder revision', state.stage.builder);
      if (error) return failed(ctx, 'Deck build revision failed. Presentation panes remain open.', error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.builder, 'builder');
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, 'walkthrough deck');
        const round = reviewRound(state.stage.round, state.stage.review);
        return cont(withStage(state, { kind: 'send_reverification', curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder, verifier: state.stage.verifier, round: round + 1, previousReview: reviewArtifactText(state.stage.review), architectResponse: state.stage.architectResponse, builderResponse: response }));
      } catch (error) {
        return failed(ctx, 'The builder revision could not be handed off. Presentation panes remain open.', errorText(error));
      }
    }
    case 'start_presentation_review': {
      await ctx.setUiFeedback({ phase: 'Reviewing the walkthrough presentation', message: `Open ${state.paths.htmlPath}. Continue ends the walkthrough review.` });
      const spawned = await ctx.spawnAgentSession({ ...guide, prompt: presentationGuidePrompt(input, state.stage.curriculum) });
      const guideSession = visible(spawned);
      return suspend(withStage(state, { kind: 'await_presentation_guide', curriculum: state.stage.curriculum, plan: state.stage.plan, guide: guideSession }), wait.agentTurn(spawned));
    }
    case 'await_presentation_guide': {
      const error = guideError(incoming, 'Presentation guide');
      if (error) return failed(ctx, 'The presentation guide failed.', error);
      await ctx.setUiFeedback({ phase: 'Reviewing the walkthrough presentation', message: `Review ${state.paths.htmlPath} at your own pace. Ask the guide questions, or press Continue when finished.` });
      return suspend(withStage(state, { ...state.stage, kind: 'await_presentation_continue' }), wait.userContinue());
    }
    case 'await_presentation_continue': {
      if (!workflowEvent.isUserContinue(incoming)) return failed(ctx, 'Presentation review could not finish.', 'Expected user Continue.');
      await ctx.closePane(state.stage.guide.paneId);
      return done({ outcome: 'presentation-review-completed', curriculumPath: state.paths.curriculumPath, deckPlanPath: state.paths.deckPlanPath, presentationPath: state.paths.htmlPath, slideCount: state.stage.plan.slides.length });
    }
    default:
      return assertNever(state.stage);
  }
}

function promptInput(state: V2State): V2PromptInput {
  return { repositoryPath: state.repositoryPath, story: state.story, sources: state.sources, paths: state.paths, audienceProfile: state.audienceProfile };
}

function ensureDirectories(state: V2State): void {
  for (const path of [state.paths.reviewDirectory, `${state.paths.reviewDirectory}/.walkthrough/inventories`, state.paths.reviewsDirectory]) mkdirSync(resolve(state.repositoryPath, path), { recursive: true });
}

function visible(input: VisibleAgent): VisibleAgent {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId, sentAt: input.sentAt };
}

function at(agents: readonly VisibleAgent[], index: number): VisibleAgent {
  const agent = agents[index];
  if (!agent) throw new Error(`No visible agent at index ${index}.`);
  return agent;
}

function turnError(incoming: unknown, label: string, agent: VisibleAgent): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) return `${label} failed in pane ${agent.paneId}: ${incoming.reason}`;
  if (!workflowEvent.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${agent.paneId}.`;
  return null;
}

function guideError(incoming: unknown, label: string): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) return `${label} failed: ${incoming.reason}`;
  if (!workflowEvent.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event.`;
  return null;
}

async function startDeckReviewRouting(
  ctx: WorkflowContext,
  state: V2State,
  stage: Extract<V2Stage, { readonly kind: 'await_review_routing' }>,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Routing deck review', message: `Review round ${stage.round}.` });
  const op = await ctx.runHeadlessAgent({ ...deckReviewRouting, prompt: deckReviewRoutingPrompt(stage.review) });
  await ctx.log('info', `Started deck review routing judgment ${op.opId} for round ${stage.round}.`);
  return suspend(withStage(state, stage), wait.headlessAgent(op));
}

function readDeckReviewArtifact(repositoryPath: string, paths: WalkthroughV2Paths, round: number): string {
  const markdownPath = deckReviewPath(paths, round);
  if (artifactFileExists(repositoryPath, markdownPath)) return readArtifactText(repositoryPath, markdownPath);
  const legacyPath = legacyDeckReviewPath(paths, round);
  if (artifactFileExists(repositoryPath, legacyPath)) return readArtifactText(repositoryPath, legacyPath);
  assertExpectedFile(repositoryPath, markdownPath, 'deck review');
  return '';
}

async function latestCompleteTurn(ctx: WorkflowContext, agent: VisibleAgent, label: string): Promise<string> {
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (!text) throw new Error(`${label} session ${agent.agentSessionId} has no complete assistant turn to hand off.`);
  return text;
}

function reviewArtifactText(review: ReviewArtifact): string {
  return typeof review === 'string' ? review : JSON.stringify(review, null, 2);
}

function reviewRound(round: number | undefined, review: ReviewArtifact): number {
  return round ?? (typeof review === 'string' ? 1 : review.round);
}

async function closeAll(ctx: WorkflowContext, agents: readonly VisibleAgent[], label: string): Promise<void> {
  for (const agent of agents) await ctx.closePane(agent.paneId);
  await ctx.log('info', `Closed ${label} panes ${agents.map(({ paneId }) => paneId).join(', ')}.`);
}

async function failed(ctx: WorkflowContext, message: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Story walkthrough failed', message });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function chapterAt(curriculum: CurriculumV2, index: number) {
  const chapter = curriculum.chapters[index];
  if (!chapter) throw new Error(`No curriculum chapter at index ${index}.`);
  return chapter;
}

function beatAt(chapter: CurriculumV2['chapters'][number], index: number) {
  const beat = chapter.beats[index];
  if (!beat) throw new Error(`No curriculum beat at index ${index} in ${chapter.id}.`);
  return beat;
}

function beatCount(curriculum: CurriculumV2): number {
  return curriculum.chapters.reduce((count, chapter) => count + chapter.beats.length, 0);
}

function withStage(state: V2State, stage: V2Stage): V2State {
  return { ...state, stage };
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported v2 workflow stage: ${String(value)}`);
}
