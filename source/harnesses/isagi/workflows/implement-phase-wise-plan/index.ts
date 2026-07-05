import { basename } from 'node:path';

import {
  cont,
  defineWorkflow,
  done,
  fail,
  suspend,
  type WorkflowConversationMessage,
  type WorkflowContext,
  type WorkflowResult,
} from '@isagi/workflow-sdk';

import {
  headlessJudgment,
  implementerFrontend,
  implementerGeneric,
  type ImplementerProfile,
} from './constants.js';
import {
  type AwaitingJudgment,
  type PlannerPassKind,
  classifyPhaseUiIntensityPrompt,
  completedSingleHeadlessResult,
  didImplementerFinishPhasePrompt,
  didPlannerApproveImplementationPrompt,
  didPlannerRaiseSevereFlagPrompt,
  discoverPlanPrompt,
  doesImplementerNeedClarificationPrompt,
  latestAssistantText,
  normalizeDiscoveryResult,
  parsePhaseUiIntensityResult,
  parseDiscoveryResult,
  parseImplementerClarificationResult,
  parseImplementerFinishedResult,
  parsePlannerApprovalResult,
  parsePlannerSevereFlagResult,
} from './judgments.js';

type State = {
  readonly stateVersion: 1;
  readonly phase:
    | 'discover_plan_start'
    | 'confirm_plan_start'
    | 'classify_phase'
    | 'await_headless'
    | 'spawn_implementer'
    | 'await_implementer_turn'
    | 'await_planner_turn'
    | 'pause_for_user'
    | 'close_phase_pane'
    | 'next_phase'
    | 'done';
  readonly humanInTheLoop: boolean;
  readonly plannerSessionId: number;
  readonly plannerHarnessSessionId?: string | undefined;
  readonly currentPhase: number;
  readonly entryPlanPath?: string | undefined;
  readonly decisionLogPath?: string | undefined;
  readonly phaseCount?: number | undefined;
  readonly completedPhaseCount?: number | undefined;
  readonly implementerProfile?: ImplementerProfile | undefined;
  readonly implementer?: ImplementerState | undefined;
  readonly plannerPassKind?: PlannerPassKind | undefined;
  readonly awaiting?: AwaitingJudgment | undefined;
  readonly pauseReason?: PauseReason | undefined;
  readonly implementationRequested?: boolean | undefined;
};

type ImplementerState = {
  readonly agentSessionId: number;
  readonly harnessSessionId: string;
  readonly paneId: number;
  readonly seededAt: string;
};

type PauseReason =
  | { readonly kind: 'severe_flag'; readonly plannerPassKind: PlannerPassKind }
  | { readonly kind: 'implementation_incomplete' }
  | { readonly kind: 'phase_review' };

type Variables = {
  readonly humanInTheLoop?: unknown;
};

const humanInTheLoopInput = {
  kind: 'select' as const,
  key: 'humanInTheLoop',
  label: 'Human in the loop',
  options: [
    { value: 'yes', label: 'Yes, pause after each phase' },
    { value: 'no', label: 'No, run through phases' },
  ],
  default: 'yes',
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Implement Phase-wise Plan',
    description: 'Route a phase-wise plan through a fresh implementer per phase.',
    inputs: [humanInTheLoopInput],
  }),
  validate: (launchCtx, variables) => {
    if (launchCtx.agentSessionId === null || launchCtx.agentSessionId === undefined) {
      throw new Error('Start this workflow from the planner agent pane.');
    }
    parseHumanInTheLoop(variables.humanInTheLoop);
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 1,
    phase: 'discover_plan_start',
    humanInTheLoop: parseHumanInTheLoop(variables.humanInTheLoop) === 'yes',
    plannerSessionId: launchCtx.agentSessionId as number,
    currentPhase: 0,
  }),
  step: async (ctx, state, event) => {
    await logTransition(ctx, state);

    if (state.phase === 'discover_plan_start') {
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message: 'Finding phase-wise plan',
      });
      await ctx.log(
        'info',
        `Starting plan discovery for planner session ${state.plannerSessionId}.`,
      );
      const plannerHarnessSessionId = await ctx.getHarnessSessionId(state.plannerSessionId);
      const plannerConversation = await conversationHistoryTextOrFail(ctx, {
        agentSessionId: state.plannerSessionId,
        harnessSessionId: plannerHarnessSessionId,
        label: 'planner',
      });
      if (!plannerConversation.ok) return plannerConversation.result;
      return startHeadlessJudgment(ctx, { ...state, plannerHarnessSessionId } satisfies State, {
        awaiting: { kind: 'discoverPlan' },
        prompt: discoverPlanPrompt({
          worktreePath: ctx.worktreePath,
          plannerSessionId: state.plannerSessionId,
          plannerConversation: plannerConversation.text,
        }),
      });
    }

    if (state.phase === 'confirm_plan_start') {
      if (!isUserContinueEvent(event)) {
        await ctx.setUiFeedback({
          kind: 'error',
          phase: state.phase,
          message: 'Workflow setup failed',
        });
        await ctx.log('error', 'Workflow resumed from plan confirmation with an invalid event.');
        return fail('Workflow resumed from plan confirmation with an invalid event.');
      }
      const phaseCount = requirePhaseCount(state);
      if (state.currentPhase > phaseCount) {
        await ctx.setUiFeedback({
          kind: 'info',
          phase: state.phase,
          message: 'Workflow complete',
        });
        await ctx.log(
          'info',
          `Plan confirmation accepted. Decision log already contains decisions for all ${phaseCount} phases; no implementation phase remains.`,
        );
        return cont({
          ...state,
          phase: 'done',
          awaiting: undefined,
          implementerProfile: undefined,
          pauseReason: undefined,
        } satisfies State);
      }
      await ctx.log(
        'info',
        `Plan confirmation accepted. Starting phase ${state.currentPhase}/${phaseCount}.`,
      );
      return startPhaseUiClassification(ctx, {
        ...state,
        phase: 'classify_phase',
        awaiting: undefined,
      } satisfies State);
    }

    if (state.phase === 'classify_phase') {
      return startPhaseUiClassification(ctx, state);
    }

    if (state.phase === 'await_headless') {
      return handleHeadlessResult(ctx, state, event);
    }

    if (state.phase === 'spawn_implementer') {
      const phaseCount = requirePhaseCount(state);
      const entryPlanPath = requireEntryPlanPath(state);
      const implementerProfile = requireImplementerProfile(state);
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message: `Phase ${state.currentPhase}: implementer reviewing plan`,
      });
      const prompt = implementationTemplate({
        phaseNumber: state.currentPhase,
        entryPlanPath,
        plannerOutput: '',
      });
      const implementer = await ctx.spawnSession({
        harness: implementerProfile.harness,
        model: implementerProfile.model,
        effort: implementerProfile.effort,
        prompt,
      });
      await ctx.log(
        'info',
        `Spawned ${implementerProfile.kind} implementer for phase ${state.currentPhase}/${phaseCount}: harness=${implementerProfile.harness}, model=${implementerProfile.model}, effort=${implementerProfile.effort}, agentSessionId=${implementer.agentSessionId}, harnessSessionId=${implementer.harnessSessionId}, paneId=${implementer.paneId}.`,
      );
      return suspend(
        {
          ...state,
          phase: 'await_implementer_turn',
          implementer,
          implementationRequested: false,
          plannerPassKind: undefined,
          pauseReason: undefined,
          awaiting: undefined,
        } satisfies State,
        turnWait(implementer),
      );
    }

    if (state.phase === 'await_implementer_turn') {
      const turn = await requireEndedTurn(ctx, state, event);
      if (!turn.ok) return turn.result;
      const implementerText = await latestImplementerTextOrFail(ctx, state);
      if (!implementerText.ok) return implementerText.result;
      const context = state.implementationRequested ? 'implementation' : 'exploration';
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message:
          context === 'implementation'
            ? `Phase ${state.currentPhase}: checking completion`
            : `Phase ${state.currentPhase}: checking implementer output`,
      });
      return startHeadlessJudgment(ctx, state, {
        awaiting: { kind: 'didImplementerFinishPhase', context },
        prompt: didImplementerFinishPhasePrompt({
          phaseNumber: state.currentPhase,
          phaseCount: requirePhaseCount(state),
          entryPlanPath: requireEntryPlanPath(state),
          context,
          latestImplementerText: implementerText.text,
        }),
      });
    }

    if (state.phase === 'await_planner_turn') {
      const turn = await requireEndedTurn(ctx, state, event);
      if (!turn.ok) return turn.result;
      const plannerText = await latestTextOrFail(ctx, {
        agentSessionId: state.plannerSessionId,
        harnessSessionId: requirePlannerHarnessSessionId(state),
        label: 'planner',
      });
      if (!plannerText.ok) return plannerText.result;
      const plannerPassKind = state.plannerPassKind;
      if (!plannerPassKind) {
        await ctx.setUiFeedback({
          kind: 'error',
          phase: state.phase,
          message: 'Workflow setup failed',
        });
        await ctx.log('error', 'Planner turn completed without plannerPassKind in state.');
        return fail('Planner turn completed without plannerPassKind in state.');
      }
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message: `Phase ${state.currentPhase}: checking planner flags`,
      });
      return startHeadlessJudgment(ctx, state, {
        awaiting: { kind: 'didPlannerRaiseSevereFlag', plannerPassKind },
        prompt: didPlannerRaiseSevereFlagPrompt({
          phaseNumber: state.currentPhase,
          phaseCount: requirePhaseCount(state),
          plannerPassKind,
          latestPlannerText: plannerText.text,
        }),
      });
    }

    if (state.phase === 'pause_for_user') {
      if (!isUserContinueEvent(event)) {
        await ctx.setUiFeedback({
          kind: 'error',
          phase: state.phase,
          message: 'Workflow setup failed',
        });
        await ctx.log('error', `Workflow resumed from user pause with an invalid event.`);
        return fail('Workflow resumed from user pause with an invalid event.');
      }
      if (!state.pauseReason) {
        await ctx.setUiFeedback({
          kind: 'error',
          phase: state.phase,
          message: 'Workflow setup failed',
        });
        await ctx.log('error', `Workflow resumed from user pause without a pause reason.`);
        return fail('Workflow resumed from user pause without a pause reason.');
      }
      if (state.pauseReason.kind === 'severe_flag') {
        const plannerText = await latestTextOrFail(ctx, {
          agentSessionId: state.plannerSessionId,
          harnessSessionId: requirePlannerHarnessSessionId(state),
          label: 'planner',
        });
        if (!plannerText.ok) return plannerText.result;
        await ctx.setUiFeedback({
          kind: 'info',
          phase: state.phase,
          message: `Phase ${state.currentPhase}: checking planner flags`,
        });
        return startHeadlessJudgment(ctx, state, {
          awaiting: {
            kind: 'didPlannerRaiseSevereFlag',
            plannerPassKind: state.pauseReason.plannerPassKind,
          },
          prompt: didPlannerRaiseSevereFlagPrompt({
            phaseNumber: state.currentPhase,
            phaseCount: requirePhaseCount(state),
            plannerPassKind: state.pauseReason.plannerPassKind,
            latestPlannerText: plannerText.text,
          }),
          patch: { pauseReason: undefined },
        });
      }
      if (state.pauseReason.kind === 'implementation_incomplete') {
        const implementerText = await latestImplementerTextOrFail(ctx, state);
        if (!implementerText.ok) return implementerText.result;
        await ctx.setUiFeedback({
          kind: 'info',
          phase: state.phase,
          message: `Phase ${state.currentPhase}: checking completion`,
        });
        return startHeadlessJudgment(ctx, state, {
          awaiting: {
            kind: 'didImplementerFinishPhase',
            context: 'implementation',
          },
          prompt: didImplementerFinishPhasePrompt({
            phaseNumber: state.currentPhase,
            phaseCount: requirePhaseCount(state),
            entryPlanPath: requireEntryPlanPath(state),
            context: 'implementation',
            latestImplementerText: implementerText.text,
          }),
          patch: { pauseReason: undefined },
        });
      }
      await ctx.log('info', `Human review completed for phase ${state.currentPhase}.`);
      return cont({
        ...state,
        phase: 'close_phase_pane',
        pauseReason: undefined,
      } satisfies State);
    }

    if (state.phase === 'close_phase_pane') {
      const phaseCount = requirePhaseCount(state);
      if (state.currentPhase >= phaseCount) {
        await ctx.setUiFeedback({
          kind: 'info',
          phase: state.phase,
          message: 'Workflow complete',
        });
        await ctx.log(
          'info',
          `Workflow complete after phase ${state.currentPhase}/${phaseCount}. Final implementer pane remains open.`,
        );
        return cont({ ...state, phase: 'done' } satisfies State);
      }
      const implementer = requireImplementer(state);
      await ctx.log(
        'info',
        `Closing implementer pane ${implementer.paneId} for completed phase ${state.currentPhase}.`,
      );
      await ctx.closePane(implementer.paneId);
      await ctx.log(
        'info',
        `Closed implementer pane ${implementer.paneId} for completed phase ${state.currentPhase}.`,
      );
      return cont({ ...state, phase: 'next_phase' } satisfies State);
    }

    if (state.phase === 'next_phase') {
      return cont({
        ...state,
        phase: 'classify_phase',
        currentPhase: state.currentPhase + 1,
        implementerProfile: undefined,
        implementer: undefined,
        implementationRequested: false,
        plannerPassKind: undefined,
        pauseReason: undefined,
        awaiting: undefined,
      } satisfies State);
    }

    if (state.phase === 'done') {
      return done({
        entryPlanPath: state.entryPlanPath,
        decisionLogPath: state.decisionLogPath,
        phaseCount: state.phaseCount,
        completedPhaseCount: state.completedPhaseCount,
        nextPhaseToImplement: state.currentPhase,
        finalImplementerPaneId: state.implementer?.paneId,
      });
    }

    return fail(`Unsupported workflow phase ${(state as { readonly phase: string }).phase}.`);
  },
});

async function handleHeadlessResult(
  ctx: WorkflowContext,
  state: State,
  event: unknown,
): Promise<WorkflowResult> {
  if (!state.awaiting) {
    await ctx.setUiFeedback({
      kind: 'error',
      phase: state.phase,
      message: 'Workflow setup failed',
    });
    await ctx.log('error', 'Workflow resumed without a pending headless judgment.');
    return fail('Workflow resumed without a pending headless judgment.');
  }
  try {
    const result = completedSingleHeadlessResult(event);
    const rawOutput = result.output ?? '';
    if (state.awaiting.kind === 'discoverPlan') {
      const parsed = parseDiscoveryResult(rawOutput);
      await ctx.log('info', `Parsed discoverPlan result: ${JSON.stringify(parsed)}.`);
      const normalized = normalizeDiscoveryResult({
        result: parsed,
        worktreePath: ctx.worktreePath,
      });
      if (!normalized) {
        await ctx.setUiFeedback({
          kind: 'error',
          phase: state.phase,
          message: 'Workflow setup failed',
        });
        await ctx.log('error', 'No phase-wise plan was found during discovery.');
        return fail('No phase-wise plan was found. Make sure the focused agent wrote one first.');
      }
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message: 'Plan found',
      });
      await ctx.log(
        'info',
        `Plan found at ${normalized.entryPlanPath} with ${normalized.phaseCount} phases.\nDecision log: ${normalized.decisionLogPath}.\nCompleted phases: ${normalized.completedPhaseCount}.\nNext phase to implement: ${normalized.nextPhaseToImplement}.`,
      );
      return startPlanStartConfirmation(ctx, {
        ...state,
        awaiting: undefined,
        entryPlanPath: normalized.entryPlanPath,
        decisionLogPath: normalized.decisionLogPath,
        phaseCount: normalized.phaseCount,
        completedPhaseCount: normalized.completedPhaseCount,
        currentPhase: normalized.nextPhaseToImplement,
      } satisfies State);
    }

    if (state.awaiting.kind === 'classifyPhaseUiIntensity') {
      const parsed = parsePhaseUiIntensityResult(rawOutput);
      const implementerProfile = parsed.frontendHeavy ? implementerFrontend : implementerGeneric;
      await ctx.setUiFeedback({
        kind: 'info',
        phase: state.phase,
        message:
          implementerProfile.kind === 'frontend'
            ? `Phase ${state.currentPhase}: frontend implementer selected`
            : `Phase ${state.currentPhase}: generic implementer selected`,
      });
      await ctx.log(
        'info',
        `Parsed classifyPhaseUiIntensity result for phase ${state.currentPhase}: ${JSON.stringify(parsed)}. Selected ${implementerProfile.kind} implementer profile.`,
      );
      return cont({
        ...state,
        phase: 'spawn_implementer',
        awaiting: undefined,
        implementerProfile,
      } satisfies State);
    }

    if (state.awaiting.kind === 'didImplementerFinishPhase') {
      const parsed = parseImplementerFinishedResult(rawOutput);
      await ctx.log(
        'info',
        `Parsed didImplementerFinishPhase result for phase ${state.currentPhase}: ${JSON.stringify(parsed)}.`,
      );
      if (parsed.phaseFinished) {
        if (!state.implementationRequested) {
          await ctx.log(
            'info',
            `Implementer completed phase ${state.currentPhase} before normal implementation request; accepting early completion.`,
          );
        }
        return completePhase(ctx, state);
      }
      if (state.implementationRequested) {
        await ctx.setUiFeedback({
          kind: 'warning',
          phase: state.phase,
          message: `Phase ${state.currentPhase}: waiting for you`,
        });
        await ctx.log(
          'warning',
          `Implementation was requested for phase ${state.currentPhase}, but completion judgment returned false. Pausing for user resolution.`,
        );
        return suspend(
          {
            ...state,
            phase: 'pause_for_user',
            awaiting: undefined,
            pauseReason: { kind: 'implementation_incomplete' },
          } satisfies State,
          { kind: 'user_continue' },
        );
      }
      const implementerText = await latestImplementerTextOrFail(ctx, state);
      if (!implementerText.ok) return implementerText.result;
      return startHeadlessJudgment(ctx, state, {
        awaiting: { kind: 'doesImplementerNeedClarification' },
        prompt: doesImplementerNeedClarificationPrompt({
          phaseNumber: state.currentPhase,
          phaseCount: requirePhaseCount(state),
          entryPlanPath: requireEntryPlanPath(state),
          latestImplementerText: implementerText.text,
        }),
      });
    }

    if (state.awaiting.kind === 'doesImplementerNeedClarification') {
      const parsed = parseImplementerClarificationResult(rawOutput);
      await ctx.log(
        'info',
        `Parsed doesImplementerNeedClarification result for phase ${state.currentPhase}: ${JSON.stringify(parsed)}.`,
      );
      return routeToPlanner(ctx, state, parsed.needsClarification ? 'clarification' : 'final');
    }

    if (state.awaiting.kind === 'didPlannerRaiseSevereFlag') {
      const parsed = parsePlannerSevereFlagResult(rawOutput);
      await ctx.log(
        'info',
        `Parsed didPlannerRaiseSevereFlag result for phase ${state.currentPhase}: ${JSON.stringify(parsed)}.`,
      );
      if (parsed.severeFlag) {
        await ctx.setUiFeedback({
          kind: 'warning',
          phase: state.phase,
          message: `Phase ${state.currentPhase}: waiting for you`,
        });
        await ctx.log(
          'warning',
          `Planner raised a severe flag for phase ${state.currentPhase}; pausing for user resolution.`,
        );
        return suspend(
          {
            ...state,
            phase: 'pause_for_user',
            awaiting: undefined,
            pauseReason: {
              kind: 'severe_flag',
              plannerPassKind: state.awaiting.plannerPassKind,
            },
          } satisfies State,
          { kind: 'user_continue' },
        );
      }
      if (state.awaiting.plannerPassKind === 'clarification') {
        return routePlannerClarificationToImplementer(ctx, state);
      }
      return startPlannerApprovalAudit(ctx, state);
    }

    const parsed = parsePlannerApprovalResult(rawOutput);
    await ctx.log(
      parsed.approved ? 'info' : 'warning',
      parsed.approved
        ? `Planner explicitly approved implementation for phase ${state.currentPhase}.`
        : `Planner did not explicitly approve implementation for phase ${state.currentPhase}; continuing because approval is audit-only.`,
    );
    return requestImplementation(ctx, state, { plannerApproved: parsed.approved });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rawOutput =
      event &&
      typeof event === 'object' &&
      Array.isArray((event as { readonly results?: unknown }).results)
        ? ((
            event as {
              readonly results: readonly { readonly output?: unknown }[];
            }
          ).results[0]?.output ?? '')
        : '';
    await ctx.setUiFeedback({
      kind: 'error',
      phase: state.phase,
      message: 'Workflow setup failed',
    });
    await ctx.log('error', `${state.awaiting.kind} failed: ${message}`);
    if (typeof rawOutput === 'string' && rawOutput.length > 0) {
      await ctx.log('error', `Raw ${state.awaiting.kind} output: ${rawOutput}`);
    }
    return fail(`${state.awaiting.kind} failed: ${message}`);
  }
}

async function routeToPlanner(
  ctx: WorkflowContext,
  state: State,
  plannerPassKind: PlannerPassKind,
): Promise<WorkflowResult> {
  const implementer = requireImplementer(state);
  const implementerText = await latestImplementerTextOrFail(ctx, state);
  if (!implementerText.ok) return implementerText.result;
  await ctx.setUiFeedback({
    kind: 'info',
    phase: state.phase,
    message:
      plannerPassKind === 'clarification'
        ? `Phase ${state.currentPhase}: asking planner`
        : `Phase ${state.currentPhase}: requesting final planner pass`,
  });
  const injectedAt = new Date().toISOString();
  const plannerHarnessSessionId = await ctx.getHarnessSessionId(state.plannerSessionId);
  await ctx.log(
    'info',
    `Injecting ${plannerPassKind} planner pass for phase ${state.currentPhase} into planner session ${state.plannerSessionId}.`,
  );
  await ctx.inject(
    state.plannerSessionId,
    plannerTemplate({
      phaseNumber: state.currentPhase,
      workerOutput: implementerText.text,
    }),
  );
  return suspend(
    {
      ...state,
      phase: 'await_planner_turn',
      implementer,
      plannerHarnessSessionId,
      plannerPassKind,
      awaiting: undefined,
    } satisfies State,
    {
      kind: 'turn',
      agentSessionId: state.plannerSessionId,
      harnessSessionId: plannerHarnessSessionId,
      afterT: injectedAt,
    },
  );
}

async function routePlannerClarificationToImplementer(
  ctx: WorkflowContext,
  state: State,
): Promise<WorkflowResult> {
  const implementer = requireImplementer(state);
  const plannerText = await latestTextOrFail(ctx, {
    agentSessionId: state.plannerSessionId,
    harnessSessionId: requirePlannerHarnessSessionId(state),
    label: 'planner',
  });
  if (!plannerText.ok) return plannerText.result;
  const injectedAt = new Date().toISOString();
  await ctx.log(
    'info',
    `Sending templated planner clarification for phase ${state.currentPhase} into implementer session ${implementer.agentSessionId}.`,
  );
  const implementerHarnessSessionId = await ctx.getHarnessSessionId(implementer.agentSessionId);
  const pinnedImplementer = {
    ...implementer,
    harnessSessionId: implementerHarnessSessionId,
  } satisfies ImplementerState;
  await ctx.inject(
    implementer.agentSessionId,
    implementationTemplate({
      phaseNumber: state.currentPhase,
      entryPlanPath: requireEntryPlanPath(state),
      plannerOutput: plannerText.text,
    }),
  );
  await ctx.setUiFeedback({
    kind: 'info',
    phase: state.phase,
    message: `Phase ${state.currentPhase}: implementer reviewing plan`,
  });
  return suspend(
    {
      ...state,
      phase: 'await_implementer_turn',
      implementer: pinnedImplementer,
      awaiting: undefined,
      pauseReason: undefined,
    } satisfies State,
    {
      kind: 'turn',
      agentSessionId: pinnedImplementer.agentSessionId,
      harnessSessionId: pinnedImplementer.harnessSessionId,
      afterT: injectedAt,
    },
  );
}

async function startPlannerApprovalAudit(
  ctx: WorkflowContext,
  state: State,
): Promise<WorkflowResult> {
  const plannerText = await latestTextOrFail(ctx, {
    agentSessionId: state.plannerSessionId,
    harnessSessionId: requirePlannerHarnessSessionId(state),
    label: 'planner',
  });
  if (!plannerText.ok) return plannerText.result;
  return startHeadlessJudgment(ctx, state, {
    awaiting: { kind: 'didPlannerApproveImplementation' },
    prompt: didPlannerApproveImplementationPrompt({
      phaseNumber: state.currentPhase,
      phaseCount: requirePhaseCount(state),
      latestPlannerText: plannerText.text,
    }),
  });
}

async function requestImplementation(
  ctx: WorkflowContext,
  state: State,
  input: { readonly plannerApproved: boolean },
): Promise<WorkflowResult> {
  const implementer = requireImplementer(state);
  const plannerText = await latestTextOrFail(ctx, {
    agentSessionId: state.plannerSessionId,
    harnessSessionId: requirePlannerHarnessSessionId(state),
    label: 'planner',
  });
  if (!plannerText.ok) return plannerText.result;
  const injectedAt = new Date().toISOString();
  await ctx.setUiFeedback({
    kind: 'info',
    phase: state.phase,
    message: `Phase ${state.currentPhase}: implementing`,
  });
  await ctx.log(
    'info',
    input.plannerApproved
      ? `Raw-pasting approved final planner response for phase ${state.currentPhase} into implementer session ${implementer.agentSessionId}.`
      : `Sending templated final planner response for phase ${state.currentPhase} into implementer session ${implementer.agentSessionId}.`,
  );
  const implementerHarnessSessionId = await ctx.getHarnessSessionId(implementer.agentSessionId);
  const pinnedImplementer = {
    ...implementer,
    harnessSessionId: implementerHarnessSessionId,
  } satisfies ImplementerState;
  await ctx.inject(
    implementer.agentSessionId,
    input.plannerApproved
      ? plannerText.text
      : implementationTemplate({
          phaseNumber: state.currentPhase,
          entryPlanPath: requireEntryPlanPath(state),
          plannerOutput: plannerText.text,
        }),
  );
  return suspend(
    {
      ...state,
      phase: 'await_implementer_turn',
      implementer: pinnedImplementer,
      awaiting: undefined,
      implementationRequested: true,
    } satisfies State,
    {
      kind: 'turn',
      agentSessionId: pinnedImplementer.agentSessionId,
      harnessSessionId: pinnedImplementer.harnessSessionId,
      afterT: injectedAt,
    },
  );
}

async function completePhase(ctx: WorkflowContext, state: State): Promise<WorkflowResult> {
  await ctx.setUiFeedback({
    kind: 'info',
    phase: state.phase,
    message: `Phase ${state.currentPhase} complete`,
  });
  await ctx.log('info', `Phase ${state.currentPhase}/${requirePhaseCount(state)} complete.`);
  if (state.humanInTheLoop) {
    await ctx.setUiFeedback({
      kind: 'info',
      phase: state.phase,
      message: `Phase ${state.currentPhase}: ready for review`,
    });
    await ctx.log(
      'info',
      `Waiting for human review before closing or advancing phase ${state.currentPhase}.`,
    );
    return suspend(
      {
        ...state,
        phase: 'pause_for_user',
        awaiting: undefined,
        pauseReason: { kind: 'phase_review' },
      } satisfies State,
      { kind: 'user_continue' },
    );
  }
  return cont({
    ...state,
    phase: 'close_phase_pane',
    awaiting: undefined,
    pauseReason: undefined,
  } satisfies State);
}

async function startPlanStartConfirmation(
  ctx: WorkflowContext,
  state: State,
): Promise<WorkflowResult> {
  const phaseCount = requirePhaseCount(state);
  const entryPlanPath = requireEntryPlanPath(state);
  const decisionLogPath = requireDecisionLogPath(state);
  const completedPhaseCount = requireCompletedPhaseCount(state);
  const nextPhase =
    state.currentPhase > phaseCount
      ? 'no remaining phase'
      : `phase ${state.currentPhase} of ${phaseCount}`;
  await ctx.setUiFeedback({
    kind: 'info',
    phase: 'confirm_plan_start',
    message: [
      `Plan: ${basename(entryPlanPath)}`,
      `Decision log: ${basename(decisionLogPath)}`,
      `Phases: ${phaseCount}`,
      `Completed: ${completedPhaseCount}`,
      `Next: ${nextPhase}`,
    ].join('\n\n'),
  });
  await ctx.log(
    'info',
    `Waiting for plan discovery confirmation. entryPlanPath=${entryPlanPath}, decisionLogPath=${decisionLogPath}, phaseCount=${phaseCount}, completedPhaseCount=${completedPhaseCount}, next=${nextPhase}.`,
  );
  return suspend(
    {
      ...state,
      phase: 'confirm_plan_start',
      awaiting: undefined,
      implementerProfile: undefined,
      implementer: undefined,
      implementationRequested: false,
      plannerPassKind: undefined,
      pauseReason: undefined,
    } satisfies State,
    { kind: 'user_continue' },
  );
}

async function startPhaseUiClassification(
  ctx: WorkflowContext,
  state: State,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({
    kind: 'info',
    phase: state.phase,
    message: `Phase ${state.currentPhase}: classifying implementation shape`,
  });
  return startHeadlessJudgment(ctx, state, {
    awaiting: { kind: 'classifyPhaseUiIntensity' },
    prompt: classifyPhaseUiIntensityPrompt({
      phaseNumber: state.currentPhase,
      phaseCount: requirePhaseCount(state),
      entryPlanPath: requireEntryPlanPath(state),
    }),
  });
}

async function startHeadlessJudgment(
  ctx: WorkflowContext,
  state: State,
  input: {
    readonly awaiting: AwaitingJudgment;
    readonly prompt: string;
    readonly patch?: Partial<State> | undefined;
  },
): Promise<WorkflowResult> {
  await ctx.log(
    'info',
    `Starting ${input.awaiting.kind} headless judgment for phase ${state.currentPhase}.`,
  );
  const op = await ctx.runHeadlessPrompt({
    harness: headlessJudgment.harness,
    model: headlessJudgment.model,
    effort: headlessJudgment.effort,
    prompt: input.prompt,
  });
  await ctx.log('info', `Started ${input.awaiting.kind} headless judgment op ${op.opId}.`);
  return suspend(
    {
      ...state,
      ...input.patch,
      phase: 'await_headless',
      awaiting: input.awaiting,
    } satisfies State,
    { kind: 'headless', ops: [op] },
  );
}

async function requireEndedTurn(
  ctx: WorkflowContext,
  state: State,
  event: unknown,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly result: WorkflowResult }> {
  const payload = event as { readonly outcome?: unknown; readonly reason?: unknown } | undefined;
  if (payload?.outcome === 'ended') return { ok: true };
  await ctx.setUiFeedback({
    kind: 'error',
    phase: state.phase,
    message: 'Workflow setup failed',
  });
  if (payload?.outcome === 'failed') {
    const reason = typeof payload.reason === 'string' ? payload.reason : 'unknown';
    await ctx.log('error', `Turn failed while workflow waited in ${state.phase}: ${reason}.`);
    return {
      ok: false,
      result: fail(`Turn failed while workflow waited in ${state.phase}.`),
    };
  }
  await ctx.log('error', `Workflow expected a turn completion event while in ${state.phase}.`);
  return {
    ok: false,
    result: fail(`Workflow expected a turn completion event while in ${state.phase}.`),
  };
}

async function latestImplementerTextOrFail(ctx: WorkflowContext, state: State) {
  const implementer = requireImplementer(state);
  return latestTextOrFail(ctx, {
    agentSessionId: implementer.agentSessionId,
    harnessSessionId: implementer.harnessSessionId,
    label: 'implementer',
  });
}

async function latestTextOrFail(
  ctx: WorkflowContext,
  input: {
    readonly agentSessionId: number;
    readonly harnessSessionId: string;
    readonly label: 'planner' | 'implementer';
  },
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await conversationHistoryOrFail(ctx, input);
  if (!history.ok) return history;
  const text = latestAssistantText(history.history);
  if (text) return { ok: true, text };
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'conversation_history',
    message: 'Workflow setup failed',
  });
  await ctx.log(
    'error',
    `${input.label} session ${input.agentSessionId} has no assistant response to inspect.`,
  );
  return {
    ok: false,
    result: fail(`${input.label} session ${input.agentSessionId} has no assistant response.`),
  };
}

async function conversationHistoryTextOrFail(
  ctx: WorkflowContext,
  input: {
    readonly agentSessionId: number;
    readonly harnessSessionId: string;
    readonly label: 'planner' | 'implementer';
  },
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await conversationHistoryOrFail(ctx, input);
  if (!history.ok) return history;
  const text = formatConversationHistory(history.history);
  if (text) return { ok: true, text };
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'conversation_history',
    message: 'Workflow setup failed',
  });
  await ctx.log(
    'error',
    `${input.label} session ${input.agentSessionId} has no conversation text to inspect.`,
  );
  return {
    ok: false,
    result: fail(`${input.label} session ${input.agentSessionId} has no conversation text.`),
  };
}

async function conversationHistoryOrFail(
  ctx: WorkflowContext,
  input: {
    readonly agentSessionId: number;
    readonly harnessSessionId: string;
    readonly label: 'planner' | 'implementer';
  },
): Promise<
  | { readonly ok: true; readonly history: readonly WorkflowConversationMessage[] }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await ctx.getConversationHistory({
    agentSessionId: input.agentSessionId,
    harnessSessionId: input.harnessSessionId,
  });
  return { ok: true, history };
}

function formatConversationHistory(history: readonly WorkflowConversationMessage[]) {
  return history
    .map((message, index) => {
      const text = message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim();
      if (!text) return '';
      return `Message ${index + 1} (${message.role}):\n${text}`;
    })
    .filter((entry) => entry.length > 0)
    .join('\n\n');
}

function implementationTemplate(input: {
  readonly phaseNumber: number;
  readonly entryPlanPath: string;
  readonly plannerOutput: string;
}) {
  return `Implement the phase ${input.phaseNumber} in ${input.entryPlanPath}.

${input.plannerOutput}

I want you to:

- Ask clarifying questions till we have shared understanding and complete alignment on what needs to be done. Do not use the askUserQuestion tool.
- Pushback on my ideas.
- Try to flag or highlight major shortcomings or opportunities to simplify logic.
- Clearly state your understanding
- Let me know once we have alignment to begin implementation
- Never start implementing unless I explicitly say so.`;
}

function plannerTemplate(input: { readonly phaseNumber: number; readonly workerOutput: string }) {
  return `I am implementing phase ${input.phaseNumber}. Make sure that I am aligned.

${input.workerOutput}

I want you to:

- Pushback on my understanding.
- Answer my questions. Make sure the answers are grounded in our current conversation, ADRs, and guidance.
- Feel free to refactor or update the phase scope if pushbacks make sense, are easy to implement, or simplify the logic. Remind me to document the same in the decision log instead of modifying the plan file.
- Flag major questions or decisions which were not covered by our conversation which can impact our architecture in a severe way to me. Make sure to include all necessary context so I can understand why it's a flag and how to address it. Explicitly mention "no flags" if we are good.
- Always mention the nuances and considerations that I may be missing to make sure I have deep understanding.
- Try to keep fallback logic to a minimum. Introduce new fallback logic only if absolutely necessary
- Only approve implementation once I have no clarifying questions in my most recent message.`;
}

function turnWait(implementer: ImplementerState) {
  return {
    kind: 'turn' as const,
    agentSessionId: implementer.agentSessionId,
    harnessSessionId: implementer.harnessSessionId,
    afterT: implementer.seededAt,
  };
}

function requireImplementer(state: State): ImplementerState {
  if (!state.implementer) {
    throw new Error(`Workflow phase ${state.phase} requires an implementer session.`);
  }
  return state.implementer;
}

function requirePlannerHarnessSessionId(state: State): string {
  if (!state.plannerHarnessSessionId) {
    throw new Error(`Workflow phase ${state.phase} requires plannerHarnessSessionId.`);
  }
  return state.plannerHarnessSessionId;
}

function requirePhaseCount(state: State): number {
  if (!state.phaseCount) {
    throw new Error(`Workflow phase ${state.phase} requires phaseCount.`);
  }
  return state.phaseCount;
}

function requireEntryPlanPath(state: State): string {
  if (!state.entryPlanPath) {
    throw new Error(`Workflow phase ${state.phase} requires entryPlanPath.`);
  }
  return state.entryPlanPath;
}

function requireDecisionLogPath(state: State): string {
  if (!state.decisionLogPath) {
    throw new Error(`Workflow phase ${state.phase} requires decisionLogPath.`);
  }
  return state.decisionLogPath;
}

function requireCompletedPhaseCount(state: State): number {
  if (state.completedPhaseCount === undefined) {
    throw new Error(`Workflow phase ${state.phase} requires completedPhaseCount.`);
  }
  return state.completedPhaseCount;
}

function requireImplementerProfile(state: State): ImplementerProfile {
  if (!state.implementerProfile) {
    throw new Error(`Workflow phase ${state.phase} requires implementerProfile.`);
  }
  return state.implementerProfile;
}

function isUserContinueEvent(event: unknown) {
  return Boolean(
    event &&
    typeof event === 'object' &&
    (event as { readonly kind?: unknown }).kind === 'user_continue',
  );
}

function parseHumanInTheLoop(value: unknown): 'yes' | 'no' {
  if (value === undefined) return 'yes';
  if (value === 'yes' || value === 'no') return value;
  throw new Error('Human in the loop must be yes or no.');
}

async function logTransition(ctx: WorkflowContext, state: State) {
  await ctx.log(
    'debug',
    `Workflow step phase=${state.phase}, currentPhase=${state.currentPhase}, phaseCount=${state.phaseCount ?? 'unknown'}, completedPhaseCount=${state.completedPhaseCount ?? 'unknown'}, decisionLogPath=${state.decisionLogPath ?? 'unknown'}, implementerProfile=${state.implementerProfile?.kind ?? 'none'}, awaiting=${state.awaiting?.kind ?? 'none'}, pauseReason=${state.pauseReason?.kind ?? 'none'}.`,
  );
}
