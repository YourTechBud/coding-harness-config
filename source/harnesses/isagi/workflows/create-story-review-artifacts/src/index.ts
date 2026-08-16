import { existsSync, statSync } from 'node:fs';
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

import { reviewer } from './constants.js';
import { architecturePrompt, currentStatePrompt, programDesignPrompt } from './prompts.js';

type ReviewAgent = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type ReviewArtifacts = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

type Sources = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

type Stage =
  | { readonly kind: 'spawn_current_state' }
  | { readonly kind: 'await_current_state'; readonly agent: ReviewAgent }
  | { readonly kind: 'send_architecture'; readonly agent: ReviewAgent }
  | { readonly kind: 'await_architecture'; readonly agent: ReviewAgent }
  | { readonly kind: 'send_program_design'; readonly agent: ReviewAgent }
  | { readonly kind: 'await_program_design'; readonly agent: ReviewAgent };

type State = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: Sources;
  readonly reviewDirectory: string;
  readonly artifacts: ReviewArtifacts;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
  readonly reviewDirectory?: unknown;
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Create Story Review Artifacts',
    description: 'Create three linked HTML artifacts for reviewing a planned story.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state source path' },
      { kind: 'text', key: 'architecturePath', label: 'Architecture source path' },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design source path' },
      { kind: 'text', key: 'reviewDirectory', label: 'Review output directory' },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      sources: parsed.sources,
      reviewDirectory: parsed.reviewDirectory,
      artifacts: reviewArtifacts(parsed.reviewDirectory),
      stage: { kind: 'spawn_current_state' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Create story review artifacts stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'spawn_current_state': {
        await ctx.setUiFeedback({ phase: 'Creating current-state review' });
        const spawned = await ctx.spawnAgentSession({
          harness: reviewer.harness,
          model: reviewer.model,
          effort: reviewer.effort,
          modifiers: [{ kind: 'skill', name: 'show-me' }],
          prompt: currentStatePrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.currentStatePath,
            outputPath: state.artifacts.currentStatePath,
            architectureOutputPath: state.artifacts.architecturePath,
          }),
        });
        const agent = agentFromSpawn(spawned);
        await ctx.log(
          'info',
          `Spawned story review agent in pane ${agent.paneId}: harness=${reviewer.harness}, model=${reviewer.model}, effort=${reviewer.effort}, agentSessionId=${agent.agentSessionId}.`,
        );
        return suspend(
          withStage(state, { kind: 'await_current_state', agent }),
          wait.agentTurn(spawned),
        );
      }

      case 'await_current_state': {
        const turnError = agentTurnError(incoming, 'Current-state review');
        if (turnError) return failWorkflow(ctx, 'Current-state review failed', turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.currentStatePath,
        );
        if (fileError) return failWorkflow(ctx, 'Current-state review is missing', fileError);
        return cont(
          withStage(state, { kind: 'send_architecture', agent: state.stage.agent }),
        );
      }

      case 'send_architecture': {
        await ctx.setUiFeedback({ phase: 'Creating architecture review' });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.agent.agentSessionId,
          modifiers: [{ kind: 'skill', name: 'show-me' }],
          prompt: architecturePrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.architecturePath,
            outputPath: state.artifacts.architecturePath,
            programDesignOutputPath: state.artifacts.programDesignPath,
          }),
        });
        return suspend(
          withStage(state, { kind: 'await_architecture', agent: state.stage.agent }),
          wait.agentTurn(sent),
        );
      }

      case 'await_architecture': {
        const turnError = agentTurnError(incoming, 'Architecture review');
        if (turnError) return failWorkflow(ctx, 'Architecture review failed', turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.architecturePath,
        );
        if (fileError) return failWorkflow(ctx, 'Architecture review is missing', fileError);
        return cont(
          withStage(state, { kind: 'send_program_design', agent: state.stage.agent }),
        );
      }

      case 'send_program_design': {
        await ctx.setUiFeedback({ phase: 'Creating program-design review' });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.agent.agentSessionId,
          modifiers: [{ kind: 'skill', name: 'show-me' }],
          prompt: programDesignPrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.programDesignPath,
            outputPath: state.artifacts.programDesignPath,
          }),
        });
        return suspend(
          withStage(state, { kind: 'await_program_design', agent: state.stage.agent }),
          wait.agentTurn(sent),
        );
      }

      case 'await_program_design': {
        const turnError = agentTurnError(incoming, 'Program-design review');
        if (turnError) return failWorkflow(ctx, 'Program-design review failed', turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.programDesignPath,
        );
        if (fileError) return failWorkflow(ctx, 'Program-design review is missing', fileError);
        await ctx.closePane(state.stage.agent.paneId);
        await ctx.setUiFeedback({
          phase: 'Story review artifacts ready',
          message: `Start with ${state.artifacts.currentStatePath}.`,
        });
        await ctx.log(
          'info',
          `Created story review artifacts in ${state.reviewDirectory} and closed pane ${state.stage.agent.paneId}.`,
        );
        return done({
          outcome: 'story-review-artifacts-created',
          reviewDirectory: state.reviewDirectory,
          artifacts: state.artifacts,
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function parseVariables(variables: Variables): {
  readonly story: string;
  readonly sources: Sources;
  readonly reviewDirectory: string;
} {
  return {
    story: parseText(variables.story, 'story'),
    sources: {
      currentStatePath: parseText(variables.currentStatePath, 'currentStatePath'),
      architecturePath: parseText(variables.architecturePath, 'architecturePath'),
      programDesignPath: parseText(variables.programDesignPath, 'programDesignPath'),
    },
    reviewDirectory: parseText(variables.reviewDirectory, 'reviewDirectory'),
  };
}

function reviewArtifacts(reviewDirectory: string): ReviewArtifacts {
  return {
    currentStatePath: `${reviewDirectory}/current-state.html`,
    architecturePath: `${reviewDirectory}/architecture.html`,
    programDesignPath: `${reviewDirectory}/program-design.html`,
  };
}

function agentTurnError(incoming: unknown, label: string): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed: ${incoming.reason}`;
  }
  if (!workflowEvent.isAgentTurnEnded(incoming)) {
    return `${label} wait resumed with an unexpected event.`;
  }
  return null;
}

function artifactFileError(repositoryPath: string, artifactPath: string): string | null {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return `Expected review artifact ${artifactPath} was not created.`;
  }
  return null;
}

async function failWorkflow(
  ctx: WorkflowContext,
  userMessage: string,
  diagnostic: string,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'Story review artifact creation failed',
    message: userMessage,
  });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function agentFromSpawn(input: {
  readonly agentSessionId: number;
  readonly paneId: number;
}): ReviewAgent {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
