import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cont,
  defineWorkflow,
  done,
  event as workflowEvent,
  fail,
  suspend,
  wait,
  type WorkflowContext,
  type WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { guide, pageBuilder, preparer, type AgentProfile } from './constants.js';
import {
  readCurriculum,
  readTopicInventories,
  validateHtmlArtifacts,
  validatePresentationSpecifications,
} from './contracts.js';
import { walkthroughV2Paths } from './paths.js';
import {
  curriculumIntegrationPrompt,
  htmlRealizationPrompt,
  liveTopicPrompt,
  phaseComprehensionPrompt,
  presentationDesignPrompt,
  topicDiscoveryPrompt,
} from './prompts.js';
import {
  artifactDescriptors,
  deliveryModes,
  familiarityLevels,
  pathFor,
  technicalDepthLevels,
  type ArtifactKind,
  type ArtifactPaths,
  type Curriculum,
  type Guide,
  type DeliveryMode,
  type Familiarity,
  type ReviewPaths,
  type TechnicalDepth,
  type VisibleAgent,
} from './types.js';
import { stepV2, type V2State } from './v2.js';

type LegacyStage =
  | { readonly kind: 'start_topic_discovery' }
  | {
      readonly kind: 'await_topic_discovery_turn';
      readonly agents: readonly VisibleAgent[];
      readonly agentIndex: number;
    }
  // Compatibility for runs suspended by the first headless implementation.
  | { readonly kind: 'await_topic_discovery'; readonly opIds: readonly string[] }
  | { readonly kind: 'start_curriculum_integration' }
  | { readonly kind: 'await_curriculum_integration_turn'; readonly agent: VisibleAgent }
  // Compatibility for runs suspended by the first headless implementation.
  | { readonly kind: 'await_curriculum_integration'; readonly opIds: readonly string[] }
  | { readonly kind: 'start_presentation_design'; readonly curriculum: Curriculum }
  | {
      readonly kind: 'await_presentation_design_turn';
      readonly curriculum: Curriculum;
      readonly agents: readonly VisibleAgent[];
      readonly agentIndex: number;
    }
  // Compatibility for runs suspended by the first headless implementation.
  | {
      readonly kind: 'await_presentation_design';
      readonly curriculum: Curriculum;
      readonly opIds: readonly string[];
    }
  | { readonly kind: 'start_html_realization'; readonly curriculum: Curriculum }
  | {
      readonly kind: 'await_html_realization_turn';
      readonly curriculum: Curriculum;
      readonly agents: readonly VisibleAgent[];
      readonly agentIndex: number;
    }
  // Compatibility for runs suspended by the first headless implementation.
  | {
      readonly kind: 'await_html_realization';
      readonly curriculum: Curriculum;
      readonly opIds: readonly string[];
    }
  | { readonly kind: 'start_walkthrough'; readonly curriculum: Curriculum }
  | {
      readonly kind: 'await_topic_turn';
      readonly curriculum: Curriculum;
      readonly topicIndex: number;
      readonly guide: Guide;
    }
  | {
      readonly kind: 'await_topic_continue';
      readonly curriculum: Curriculum;
      readonly topicIndex: number;
      readonly guide: Guide;
    }
  | {
      readonly kind: 'send_topic';
      readonly curriculum: Curriculum;
      readonly topicIndex: number;
      readonly guide: Guide;
    }
  | {
      readonly kind: 'send_phase_comprehension';
      readonly curriculum: Curriculum;
      readonly artifact: ArtifactKind;
      readonly nextTopicIndex: number | null;
      readonly guide: Guide;
    }
  | {
      readonly kind: 'await_phase_comprehension_turn';
      readonly curriculum: Curriculum;
      readonly artifact: ArtifactKind;
      readonly nextTopicIndex: number | null;
      readonly guide: Guide;
    }
  | {
      readonly kind: 'await_phase_comprehension_continue';
      readonly curriculum: Curriculum;
      readonly artifact: ArtifactKind;
      readonly nextTopicIndex: number | null;
      readonly guide: Guide;
    };

type LegacyState = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly review: ReviewPaths;
  readonly stage: LegacyStage;
};

type State = LegacyState | V2State;

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
  readonly reviewDirectory?: unknown;
  readonly familiarity?: unknown;
  readonly technicalDepth?: unknown;
  readonly deliveryMode?: unknown;
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Solution Walkthrough Story',
    description: 'Prepare and interactively guide the user through a designed story solution.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state source path', default: 'scratch/story/design/current-state.md' },
      { kind: 'text', key: 'architecturePath', label: 'Architecture source path', default: 'scratch/story/design/architecture.md' },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design source path', default: 'scratch/story/design/program-design.md' },
      { kind: 'text', key: 'reviewDirectory', label: 'Walkthrough output directory', default: 'scratch/story/walkthrough' },
      {
        kind: 'select',
        key: 'familiarity',
        label: 'Codebase familiarity',
        options: [
          { value: 'new', label: 'New to this codebase' },
          { value: 'familiar', label: 'Familiar with this codebase' },
        ],
        default: 'new',
      },
      {
        kind: 'select',
        key: 'technicalDepth',
        label: 'Technical depth',
        options: [
          { value: 'product', label: 'Product overview' },
          { value: 'system-design', label: 'System design' },
          { value: 'implementation', label: 'Implementation detail' },
        ],
        default: 'system-design',
      },
      {
        kind: 'select',
        key: 'deliveryMode',
        label: 'Delivery mode',
        options: [
          { value: 'presentation-first', label: 'Presentation first' },
          { value: 'guided-tutorial', label: 'Guided tutorial' },
        ],
        default: 'presentation-first',
      },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 2,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      sources: parsed.sources,
      paths: walkthroughV2Paths(parsed.reviewDirectory),
      audienceProfile: {
        familiarity: parsed.familiarity,
        technicalDepth: parsed.technicalDepth,
      },
      deliveryMode: parsed.deliveryMode,
      stage: { kind: 'start_source_analysis' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Walk through story stage=${state.stage.kind}.`);
    if (state.stateVersion === 2) return stepV2(ctx, state, incoming);
    const promptInput = sharedPromptInput(state);

    switch (state.stage.kind) {
      case 'start_topic_discovery': {
        ensurePreparationDirectories(state);
        await ctx.setUiFeedback({ phase: 'Discovering walkthrough topics' });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => topicDiscoveryPrompt(promptInput, kind),
        );
        await logVisibleLaunches(ctx, 'topic discovery', agents);
        return suspend(
          withStage(state, { kind: 'await_topic_discovery_turn', agents, agentIndex: 0 }),
          wait.agentTurn(visibleAgentAt(agents, 0, 'topic discovery')),
        );
      }

      case 'await_topic_discovery_turn': {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          'topic discovery',
        );
        const error = visibleTurnError(incoming, 'Topic discovery', current);
        if (error) {
          return failWorkflow(
            ctx,
            'Walkthrough topic discovery failed. Preparation panes remain open for inspection.',
            error,
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return suspend(
            withStage(state, {
              kind: 'await_topic_discovery_turn',
              agents: state.stage.agents,
              agentIndex: nextIndex,
            }),
            wait.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, 'topic discovery')),
          );
        }
        try {
          readTopicInventories(state.repositoryPath, state.sources, state.review);
          await closePreparationPanes(ctx, 'topic discovery', state.stage.agents);
          return cont(withStage(state, { kind: 'start_curriculum_integration' }));
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough topic inventories are invalid. Preparation panes remain open for inspection.',
            `Topic inventory validation failed; preparation panes were preserved: ${errorText(error)}`,
          );
        }
      }

      case 'await_topic_discovery': {
        const error = headlessResultError(incoming, state.stage.opIds, 'Topic discovery');
        if (error) return failWorkflow(ctx, 'Walkthrough topic discovery failed', error);
        try {
          readTopicInventories(state.repositoryPath, state.sources, state.review);
          return cont(withStage(state, { kind: 'start_curriculum_integration' }));
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough topic inventories are invalid',
            `Topic inventory validation failed: ${errorText(error)}`,
          );
        }
      }

      case 'start_curriculum_integration': {
        await ctx.setUiFeedback({ phase: 'Sequencing the story walkthrough' });
        const spawned = await ctx.spawnAgentSession({
          ...preparer,
          prompt: curriculumIntegrationPrompt(promptInput),
        });
        const agent = visibleAgentFromSpawn(spawned);
        await logVisibleLaunches(ctx, 'curriculum integration', [agent]);
        return suspend(
          withStage(state, { kind: 'await_curriculum_integration_turn', agent }),
          wait.agentTurn(agent),
        );
      }

      case 'await_curriculum_integration_turn': {
        const error = visibleTurnError(incoming, 'Curriculum integration', state.stage.agent);
        if (error) {
          return failWorkflow(
            ctx,
            'Walkthrough sequencing failed. The preparation pane remains open for inspection.',
            error,
          );
        }
        try {
          const inventories = readTopicInventories(state.repositoryPath, state.sources, state.review);
          const curriculum = readCurriculum(
            state.repositoryPath,
            state.sources,
            state.review,
            inventories,
          );
          await closePreparationPanes(ctx, 'curriculum integration', [state.stage.agent]);
          return cont(withStage(state, { kind: 'start_presentation_design', curriculum }));
        } catch (error) {
          return failWorkflow(
            ctx,
            'The walkthrough manifest is invalid. The preparation pane remains open for inspection.',
            `Walkthrough manifest validation failed; preparation pane was preserved: ${errorText(error)}`,
          );
        }
      }

      case 'await_curriculum_integration': {
        const error = headlessResultError(incoming, state.stage.opIds, 'Curriculum integration');
        if (error) return failWorkflow(ctx, 'Walkthrough sequencing failed', error);
        try {
          const inventories = readTopicInventories(state.repositoryPath, state.sources, state.review);
          const curriculum = readCurriculum(
            state.repositoryPath,
            state.sources,
            state.review,
            inventories,
          );
          return cont(withStage(state, { kind: 'start_presentation_design', curriculum }));
        } catch (error) {
          return failWorkflow(
            ctx,
            'The walkthrough manifest is invalid',
            `Walkthrough manifest validation failed: ${errorText(error)}`,
          );
        }
      }

      case 'start_presentation_design': {
        await ctx.setUiFeedback({ phase: 'Designing walkthrough presentations' });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => presentationDesignPrompt(promptInput, kind),
        );
        await logVisibleLaunches(ctx, 'presentation design', agents);
        return suspend(
          withStage(state, {
            kind: 'await_presentation_design_turn',
            curriculum: state.stage.curriculum,
            agents,
            agentIndex: 0,
          }),
          wait.agentTurn(visibleAgentAt(agents, 0, 'presentation design')),
        );
      }

      case 'await_presentation_design_turn': {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          'presentation design',
        );
        const error = visibleTurnError(incoming, 'Presentation design', current);
        if (error) {
          return failWorkflow(
            ctx,
            'Walkthrough presentation design failed. Preparation panes remain open for inspection.',
            error,
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return suspend(
            withStage(state, {
              kind: 'await_presentation_design_turn',
              curriculum: state.stage.curriculum,
              agents: state.stage.agents,
              agentIndex: nextIndex,
            }),
            wait.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, 'presentation design')),
          );
        }
        try {
          validatePresentationSpecifications(
            state.repositoryPath,
            state.review,
            state.stage.curriculum,
          );
          await closePreparationPanes(ctx, 'presentation design', state.stage.agents);
          return cont(
            withStage(state, {
              kind: 'start_html_realization',
              curriculum: state.stage.curriculum,
            }),
          );
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough presentation specifications are invalid. Preparation panes remain open for inspection.',
            `Presentation specification validation failed; preparation panes were preserved: ${errorText(error)}`,
          );
        }
      }

      case 'await_presentation_design': {
        const error = headlessResultError(incoming, state.stage.opIds, 'Presentation design');
        if (error) return failWorkflow(ctx, 'Walkthrough presentation design failed', error);
        try {
          validatePresentationSpecifications(
            state.repositoryPath,
            state.review,
            state.stage.curriculum,
          );
          return cont(
            withStage(state, {
              kind: 'start_html_realization',
              curriculum: state.stage.curriculum,
            }),
          );
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough presentation specifications are invalid',
            `Presentation specification validation failed: ${errorText(error)}`,
          );
        }
      }

      case 'start_html_realization': {
        await ctx.setUiFeedback({ phase: 'Rendering walkthrough presentations' });
        const agents = await launchArtifactAgents(
          ctx,
          pageBuilder,
          (kind) => htmlRealizationPrompt(promptInput, kind),
        );
        await logVisibleLaunches(ctx, 'HTML realization', agents);
        return suspend(
          withStage(state, {
            kind: 'await_html_realization_turn',
            curriculum: state.stage.curriculum,
            agents,
            agentIndex: 0,
          }),
          wait.agentTurn(visibleAgentAt(agents, 0, 'HTML realization')),
        );
      }

      case 'await_html_realization_turn': {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          'HTML realization',
        );
        const error = visibleTurnError(incoming, 'HTML realization', current);
        if (error) {
          return failWorkflow(
            ctx,
            'Walkthrough HTML creation failed. Preparation panes remain open for inspection.',
            error,
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return suspend(
            withStage(state, {
              kind: 'await_html_realization_turn',
              curriculum: state.stage.curriculum,
              agents: state.stage.agents,
              agentIndex: nextIndex,
            }),
            wait.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, 'HTML realization')),
          );
        }
        try {
          validateHtmlArtifacts(state.repositoryPath, state.review, state.stage.curriculum);
          await closePreparationPanes(ctx, 'HTML realization', state.stage.agents);
          return cont(
            withStage(state, { kind: 'start_walkthrough', curriculum: state.stage.curriculum }),
          );
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough HTML artifacts are invalid. Preparation panes remain open for inspection.',
            `HTML artifact validation failed; preparation panes were preserved: ${errorText(error)}`,
          );
        }
      }

      case 'await_html_realization': {
        const error = headlessResultError(incoming, state.stage.opIds, 'HTML realization');
        if (error) return failWorkflow(ctx, 'Walkthrough HTML creation failed', error);
        try {
          validateHtmlArtifacts(state.repositoryPath, state.review, state.stage.curriculum);
          return cont(
            withStage(state, { kind: 'start_walkthrough', curriculum: state.stage.curriculum }),
          );
        } catch (error) {
          return failWorkflow(
            ctx,
            'Walkthrough HTML artifacts are invalid',
            `HTML artifact validation failed: ${errorText(error)}`,
          );
        }
      }

      case 'start_walkthrough': {
        const topic = topicAt(state.stage.curriculum, 0);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Preparing topic 1 of ${state.stage.curriculum.topics.length}: ${topic.title}.`,
        });
        const spawned = await ctx.spawnAgentSession({
          ...guide,
          prompt: liveTopicPrompt({
            ...promptInput,
            curriculum: state.stage.curriculum,
            topic,
          }),
        });
        const guideSession = guideFromSpawn(spawned);
        await ctx.log(
          'info',
          `Spawned walkthrough guide in pane ${guideSession.paneId}: harness=${guide.harness}, model=${guide.model}, effort=${guide.effort}, agentSessionId=${guideSession.agentSessionId}.`,
        );
        return suspend(
          withStage(state, {
            kind: 'await_topic_turn',
            curriculum: state.stage.curriculum,
            topicIndex: 0,
            guide: guideSession,
          }),
          wait.agentTurn(spawned),
        );
      }

      case 'await_topic_turn': {
        const error = guideTurnError(
          incoming,
          `Walkthrough topic ${state.stage.topicIndex + 1}`,
        );
        if (error) return failWorkflow(ctx, 'The walkthrough guide failed', error);
        const topic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Topic ${state.stage.topicIndex + 1} of ${state.stage.curriculum.topics.length}: ${topic.title}. Continue the Socratic dialogue in the guide pane and press Continue when this checkpoint is complete. Browser support: ${pathFor(state.review.htmlPaths, topic.artifact)}#${topic.browserAnchor}`,
        });
        return suspend(
          withStage(state, {
            kind: 'await_topic_continue',
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.topicIndex,
            guide: state.stage.guide,
          }),
          wait.userContinue(),
        );
      }

      case 'await_topic_continue': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'The walkthrough could not advance',
            `Topic ${state.stage.topicIndex + 1} wait resumed with an unexpected event.`,
          );
        }
        const currentTopic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        const nextIndex = state.stage.topicIndex + 1;
        const nextTopic = state.stage.curriculum.topics[nextIndex];
        if (!nextTopic || nextTopic.artifact !== currentTopic.artifact) {
          return cont(
            withStage(state, {
              kind: 'send_phase_comprehension',
              curriculum: state.stage.curriculum,
              artifact: currentTopic.artifact,
              nextTopicIndex: nextTopic ? nextIndex : null,
              guide: state.stage.guide,
            }),
          );
        }
        return cont(
          withStage(state, {
            kind: 'send_topic',
            curriculum: state.stage.curriculum,
            topicIndex: nextIndex,
            guide: state.stage.guide,
          }),
        );
      }

      case 'send_topic': {
        const topic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Preparing topic ${state.stage.topicIndex + 1} of ${state.stage.curriculum.topics.length}: ${topic.title}.`,
        });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.guide.agentSessionId,
          prompt: liveTopicPrompt({
            ...promptInput,
            curriculum: state.stage.curriculum,
            topic,
          }),
        });
        return suspend(
          withStage(state, {
            kind: 'await_topic_turn',
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.topicIndex,
            guide: state.stage.guide,
          }),
          wait.agentTurn(sent),
        );
      }

      case 'send_phase_comprehension': {
        await ctx.setUiFeedback({
          phase: comprehensionPhase(state.stage.artifact),
          message: `Preparing the ${artifactLabel(state.stage.artifact)} comprehension dialogue.`,
        });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.guide.agentSessionId,
          prompt: phaseComprehensionPrompt({
            ...promptInput,
            artifact: state.stage.artifact,
            curriculum: state.stage.curriculum,
          }),
        });
        return suspend(
          withStage(state, {
            kind: 'await_phase_comprehension_turn',
            curriculum: state.stage.curriculum,
            artifact: state.stage.artifact,
            nextTopicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide,
          }),
          wait.agentTurn(sent),
        );
      }

      case 'await_phase_comprehension_turn': {
        const error = guideTurnError(
          incoming,
          `${artifactLabel(state.stage.artifact)} comprehension dialogue`,
        );
        if (error) return failWorkflow(ctx, 'The walkthrough guide failed', error);
        await ctx.setUiFeedback({
          phase: comprehensionPhase(state.stage.artifact),
          message: `Review the completed ${artifactLabel(state.stage.artifact)} phase in the guide pane and press Continue when you are satisfied with your understanding.`,
        });
        return suspend(
          withStage(state, {
            kind: 'await_phase_comprehension_continue',
            curriculum: state.stage.curriculum,
            artifact: state.stage.artifact,
            nextTopicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide,
          }),
          wait.userContinue(),
        );
      }

      case 'await_phase_comprehension_continue': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'The walkthrough could not advance',
            `${artifactLabel(state.stage.artifact)} comprehension wait resumed with an unexpected event.`,
          );
        }
        if (state.stage.nextTopicIndex === null) {
          return finishWalkthrough(ctx, state, state.stage.curriculum, state.stage.guide);
        }
        return cont(
          withStage(state, {
            kind: 'send_topic',
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide,
          }),
        );
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function parseVariables(variables: Variables): {
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly reviewDirectory: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMode: DeliveryMode;
} {
  return {
    story: parseText(variables.story, 'story'),
    sources: {
      currentStatePath: parsePath(variables.currentStatePath, 'currentStatePath', 'scratch/story/design/current-state.md'),
      architecturePath: parsePath(variables.architecturePath, 'architecturePath', 'scratch/story/design/architecture.md'),
      programDesignPath: parsePath(variables.programDesignPath, 'programDesignPath', 'scratch/story/design/program-design.md'),
    },
    reviewDirectory: parsePath(variables.reviewDirectory, 'reviewDirectory', 'scratch/story/walkthrough'),
    familiarity: parseEnum(variables.familiarity, 'familiarity', familiarityLevels, 'new'),
    technicalDepth: parseEnum(variables.technicalDepth, 'technicalDepth', technicalDepthLevels, 'system-design'),
    deliveryMode: parseEnum(variables.deliveryMode, 'deliveryMode', deliveryModes, 'presentation-first'),
  };
}

function ensurePreparationDirectories(state: LegacyState): void {
  for (const path of [
    state.review.reviewDirectory,
    `${state.review.reviewDirectory}/.walkthrough/inventories`,
    `${state.review.reviewDirectory}/.walkthrough/presentations`,
  ]) {
    mkdirSync(resolve(state.repositoryPath, path), { recursive: true });
  }
}

async function launchArtifactAgents(
  ctx: WorkflowContext,
  profile: AgentProfile,
  prompt: (kind: (typeof artifactDescriptors)[number]['kind']) => string,
): Promise<readonly VisibleAgent[]> {
  const agents: VisibleAgent[] = [];
  for (const descriptor of artifactDescriptors) {
    agents.push(
      visibleAgentFromSpawn(
        await ctx.spawnAgentSession({
          ...profile,
          prompt: prompt(descriptor.kind),
        }),
      ),
    );
  }
  return agents;
}

function headlessResultError(
  incoming: unknown,
  expectedOpIds: readonly string[],
  label: string,
): string | null {
  const results = workflowEvent.getHeadlessAgentResults(incoming);
  if (!results) return `${label} wait resumed with a non-headless event.`;
  if (results.length !== expectedOpIds.length) {
    return `${label} expected ${expectedOpIds.length} results, received ${results.length}.`;
  }
  for (const expectedOpId of expectedOpIds) {
    const result = results.find((candidate) => candidate.opId === expectedOpId);
    if (!result) return `${label} returned no result for operation ${expectedOpId}.`;
    if (result.status !== 'completed') {
      return `${label} operation ${expectedOpId} failed: ${result.error ?? 'unknown error'}`;
    }
  }
  return null;
}

function guideTurnError(incoming: unknown, label: string): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed: ${incoming.reason}`;
  }
  if (!workflowEvent.isAgentTurnEnded(incoming)) {
    return `${label} wait resumed with an unexpected event.`;
  }
  return null;
}

function visibleTurnError(
  incoming: unknown,
  label: string,
  agent: VisibleAgent,
): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed in pane ${agent.paneId}: ${incoming.reason}. The preparation panes were preserved for inspection.`;
  }
  if (!workflowEvent.isAgentTurnEnded(incoming)) {
    return `${label} wait for pane ${agent.paneId} resumed with an unexpected event. The preparation panes were preserved for inspection.`;
  }
  return null;
}

async function finishWalkthrough(
  ctx: WorkflowContext,
  state: LegacyState,
  curriculum: Curriculum,
  guideSession: Guide,
): Promise<WorkflowResult> {
  await ctx.closePane(guideSession.paneId);
  await ctx.setUiFeedback({
    phase: 'Story walkthrough complete',
    message: `Completed ${curriculum.topics.length} walkthrough topics.`,
  });
  await ctx.log(
    'info',
    `Completed ${curriculum.topics.length} walkthrough topics and closed guide pane ${guideSession.paneId}.`,
  );
  return done({
    outcome: 'story-walkthrough-completed',
    reviewDirectory: state.review.reviewDirectory,
    manifestPath: state.review.manifestPath,
    completedTopicCount: curriculum.topics.length,
    artifacts: state.review.htmlPaths,
  });
}

function topicAt(curriculum: Curriculum, index: number) {
  const topic = curriculum.topics[index];
  if (!topic) throw new Error(`Walkthrough curriculum has no topic at index ${index}.`);
  return topic;
}

function topicPhase(kind: (typeof artifactDescriptors)[number]['kind']): string {
  switch (kind) {
    case 'current-state':
      return 'Walking through current state';
    case 'architecture':
      return 'Walking through architecture';
    case 'program-design':
      return 'Walking through program design';
  }
}

function comprehensionPhase(kind: ArtifactKind): string {
  return `Reviewing ${artifactLabel(kind)} comprehension`;
}

function artifactLabel(kind: ArtifactKind): string {
  switch (kind) {
    case 'current-state':
      return 'current state';
    case 'architecture':
      return 'architecture';
    case 'program-design':
      return 'program design';
  }
}

function sharedPromptInput(state: LegacyState) {
  return {
    repositoryPath: state.repositoryPath,
    story: state.story,
    sources: state.sources,
    review: state.review,
  };
}

async function logVisibleLaunches(
  ctx: WorkflowContext,
  label: string,
  agents: readonly VisibleAgent[],
): Promise<void> {
  await ctx.log(
    'info',
    `Started visible ${label} agents in panes ${agents.map((agent) => agent.paneId).join(', ')}.`,
  );
}

async function closePreparationPanes(
  ctx: WorkflowContext,
  label: string,
  agents: readonly VisibleAgent[],
): Promise<void> {
  for (const agent of agents) await ctx.closePane(agent.paneId);
  await ctx.log(
    'info',
    `Validated ${label} artifacts and closed panes ${agents.map((agent) => agent.paneId).join(', ')}.`,
  );
}

async function failWorkflow(
  ctx: WorkflowContext,
  userMessage: string,
  diagnostic: string,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'Story walkthrough failed',
    message: userMessage,
  });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function guideFromSpawn(input: { readonly agentSessionId: number; readonly paneId: number }): Guide {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function visibleAgentFromSpawn(input: VisibleAgent): VisibleAgent {
  return {
    agentSessionId: input.agentSessionId,
    paneId: input.paneId,
    sentAt: input.sentAt,
  };
}

function visibleAgentAt(
  agents: readonly VisibleAgent[],
  index: number,
  label: string,
): VisibleAgent {
  const agent = agents[index];
  if (!agent) throw new Error(`${label} has no visible agent at index ${index}.`);
  return agent;
}

function withStage(state: LegacyState, stage: LegacyStage): LegacyState {
  return { ...state, stage } satisfies LegacyState;
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}

function parsePath(value: unknown, key: string, fallback: string): string {
  if (value === undefined) return fallback;
  return parseText(value, key);
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  key: string,
  options: T,
  fallback: T[number],
): T[number] {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate === 'string' && options.includes(candidate)) return candidate;
  throw new Error(`${key} must be one of ${options.join(', ')}.`);
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
