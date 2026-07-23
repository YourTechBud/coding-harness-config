import {
  cont,
  defineWorkflow,
  done,
  event as workflowEvent,
  fail,
  suspend,
  wait,
  type WorkflowConversationMessage,
  type WorkflowContext,
  type WorkflowResult,
} from "@yourtechbudstudio/isagi-workflow-sdk";

import {
  commitAgent,
  headlessJudgment,
  implementerGeneric,
  implementerProseHeavy,
  implementerUiHeavy,
  type ImplementerKind,
  type ImplementerProfile,
} from "./constants.js";
import {
  commitPrompt,
  completedSingleCommitResult,
  parseCommitResult,
} from "./commit.js";
import { setWorkflowStatus } from "./feedback.js";
import {
  classifyImplementerOutcomePrompt,
  classifyPhaseImplementationKindPrompt,
  classifyPlannerOutcomePrompt,
  completedSingleHeadlessJudgmentResult,
  discoverPlanPrompt,
  latestAssistantTurnText,
  normalizeDiscoveryResult,
  parseDiscoveryResult,
  parseImplementerOutcomeResult,
  parsePhaseImplementationKindResult,
  parsePlannerOutcomeResult,
  type NormalizedDiscoveryResult,
  type PlanPhase,
  type PlannerOutcome,
} from "./judgments.js";

type CommonState = {
  readonly stateVersion: 5;
  readonly options: {
    readonly autoCommit: boolean;
    readonly autoReview: boolean;
    readonly humanInTheLoop: boolean;
  };
  readonly plannerSessionId: number;
};

type DiscoveryState = CommonState & {
  readonly stage:
    | { readonly kind: "discover-plan" }
    | { readonly kind: "await-plan-discovery" };
};

type PlanContext = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phases: readonly PlanPhase[];
  readonly currentPhaseIndex: number;
};

type Implementer = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type ImplementerActivity = "alignment" | "implementation";

type ActiveStage =
  | { readonly kind: "confirm-plan" }
  | { readonly kind: "select-implementer" }
  | { readonly kind: "await-implementer-selection" }
  | {
      readonly kind: "spawn-implementer";
      readonly profile: ImplementerProfile;
    }
  | {
      readonly kind: "await-implementer-turn";
      readonly implementer: Implementer;
      readonly activity: ImplementerActivity;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-implementer-outcome";
      readonly implementer: Implementer;
      readonly implementerTurn: string;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-planner-turn";
      readonly implementer: Implementer;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-planner-outcome";
      readonly implementer: Implementer;
      readonly plannerTurn: string;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-severe-flag-resolution";
      readonly implementer: Implementer;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-auto-review";
      readonly implementer: Implementer;
      readonly runId: number;
      // Optional so version-5 runs already awaiting review remain resumable.
      readonly requiresHumanVerification?: boolean | undefined;
    }
  | {
      readonly kind: "await-human-completion";
      readonly implementer: Implementer;
    }
  | {
      readonly kind: "start-commit";
      readonly implementer: Implementer;
    }
  | {
      readonly kind: "await-commit";
      readonly implementer: Implementer;
    }
  | {
      readonly kind: "advance-phase";
      readonly implementer: Implementer;
    }
  | {
      readonly kind: "done";
      readonly finalImplementer?: Implementer | undefined;
    };

type ActiveState = CommonState & {
  readonly plan: PlanContext;
  readonly stage: ActiveStage;
};

type State = DiscoveryState | ActiveState;

type Variables = {
  readonly autoCommit?: unknown;
  readonly autoReview?: unknown;
  readonly humanInTheLoop?: unknown;
};

const autoCommitInput = {
  kind: "select" as const,
  key: "autoCommit",
  label: "Automatic commit",
  options: [
    { value: "yes", label: "Yes, create a commit after each phase" },
    { value: "no", label: "No, leave phase changes uncommitted" },
  ],
  default: "yes",
};

const autoReviewInput = {
  kind: "select" as const,
  key: "autoReview",
  label: "Automatic engineering guidance review",
  options: [
    { value: "yes", label: "Yes, review every completed phase" },
    { value: "no", label: "No, skip automatic review" },
  ],
  default: "yes",
};

const humanInTheLoopInput = {
  kind: "select" as const,
  key: "humanInTheLoop",
  label: "Human in the loop",
  options: [
    { value: "yes", label: "Yes, pause after each phase" },
    { value: "no", label: "No, run through phases" },
  ],
  default: "yes",
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: "Implement Phase-wise Plan",
    description:
      "Route a phase-wise plan through a fresh implementer per phase.",
    inputs: [humanInTheLoopInput, autoReviewInput, autoCommitInput],
  }),
  validate: (launchCtx, variables) => {
    if (
      launchCtx.agentSessionId === null ||
      launchCtx.agentSessionId === undefined
    ) {
      throw new Error("Start this workflow from the planner agent pane.");
    }
    parseHumanInTheLoop(variables.humanInTheLoop);
    parseAutoReview(variables.autoReview);
    parseAutoCommit(variables.autoCommit);
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 5,
    options: {
      autoCommit: parseAutoCommit(variables.autoCommit) === "yes",
      autoReview: parseAutoReview(variables.autoReview) === "yes",
      humanInTheLoop: parseHumanInTheLoop(variables.humanInTheLoop) === "yes",
    },
    plannerSessionId: launchCtx.agentSessionId as number,
    stage: { kind: "discover-plan" },
  }),
  step: async (ctx, state, event) => {
    if ((state as { readonly stateVersion?: unknown }).stateVersion !== 5) {
      throw new Error(
        `Unsupported implement-phase-wise-plan state version: expected 5, received ${String((state as { readonly stateVersion?: unknown }).stateVersion)}. Start a new workflow run.`,
      );
    }

    await logTransition(ctx, state);

    switch (state.stage.kind) {
      case "discover-plan": {
        await setWorkflowStatus(ctx, { kind: "discovering-plan" });
        const plannerConversation = await fullConversationTextOrFail(ctx, {
          agentSessionId: state.plannerSessionId,
          label: "planner",
        });
        if (!plannerConversation.ok) return plannerConversation.result;
        return startHeadlessJudgment(ctx, {
          judgment: "discoverPlan",
          prompt: discoverPlanPrompt({
            worktreePath: ctx.worktreePath,
            plannerSessionId: state.plannerSessionId,
            plannerConversation: plannerConversation.text,
          }),
          nextState: {
            ...state,
            stage: { kind: "await-plan-discovery" },
          } satisfies State,
        });
      }

      case "await-plan-discovery": {
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "discoverPlan",
          failureMessage: "The current plan could not be discovered",
          parse: parseDiscoveryResult,
        });
        if (!judgment.ok) return judgment.result;
        const discovery = await normalizeDiscoveryOrFail(
          ctx,
          judgment.value,
          ctx.worktreePath,
        );
        if (!discovery.ok) return discovery.result;
        const normalized = discovery.value;
        if (!normalized) {
          return failWorkflow(
            ctx,
            "No phase-wise plan was found in the planner conversation",
            "No phase-wise plan was found during discovery.",
          );
        }
        const activeState = activatePlan(state, normalized);
        const nextPhase = currentPhase(activeState);
        await setWorkflowStatus(ctx, {
          kind: "plan-ready",
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phaseCount: activeState.plan.phases.length,
          completedPhaseCount: activeState.plan.currentPhaseIndex,
          nextPhase: nextPhase?.number,
        });
        await ctx.log(
          "info",
          `Plan found at ${activeState.plan.entryPlanPath} with ${activeState.plan.phases.length} phases. Decision log: ${activeState.plan.decisionLogPath}. Completed phases: ${activeState.plan.currentPhaseIndex}. Next phase: ${nextPhase?.number ?? "none"}.`,
        );
        return suspend(activeState, wait.userContinue());
      }

      case "confirm-plan": {
        const activeState = requireActiveState(state);
        if (!workflowEvent.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            "Plan confirmation could not be resumed",
            "Plan confirmation resumed with an unexpected event.",
          );
        }
        if (!currentPhase(activeState)) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `The decision log already contains all ${activeState.plan.phases.length} phase decisions.`,
          );
          return cont(withStage(activeState, { kind: "done" }) satisfies State);
        }
        return cont(
          withStage(activeState, {
            kind: "select-implementer",
          }) satisfies State,
        );
      }

      case "select-implementer": {
        const activeState = requireActiveState(state);
        const phase = activePhase(activeState);
        await setWorkflowStatus(ctx, {
          kind: "preparing-phase",
          phase: phase.number,
          phaseCount: activeState.plan.phases.length,
        });
        if (phase.type === "mock-ui") {
          await ctx.log(
            "info",
            `Selected the ui-heavy implementer profile for mock phase ${phase.number}.`,
          );
          return cont(
            withStage(activeState, {
              kind: "spawn-implementer",
              profile: implementerUiHeavy,
            }) satisfies State,
          );
        }
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPhaseImplementationKind",
          prompt: classifyPhaseImplementationKindPrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activePhase(activeState).number,
            phaseCount: activeState.plan.phases.length,
            entryPlanPath: activeState.plan.entryPlanPath,
          }),
          nextState: withStage(activeState, {
            kind: "await-implementer-selection",
          }),
        });
      }

      case "await-implementer-selection": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyPhaseImplementationKind",
          failureMessage: `The implementer for phase ${activePhase(activeState).number} could not be selected`,
          parse: parsePhaseImplementationKindResult,
        });
        if (!judgment.ok) return judgment.result;
        const profile = selectImplementerProfile(
          judgment.value.implementationKind,
        );
        await ctx.log(
          "info",
          `Selected the ${profile.kind} implementer profile for phase ${activePhase(activeState).number}.`,
        );
        return cont(
          withStage(activeState, {
            kind: "spawn-implementer",
            profile,
          }) satisfies State,
        );
      }

      case "spawn-implementer": {
        const activeState = requireActiveState(state);
        const profile = state.stage.profile;
        await setWorkflowStatus(ctx, {
          kind: "implementer-aligning",
          phase: activePhase(activeState).number,
          phaseCount: activeState.plan.phases.length,
        });
        const spawned = await ctx.spawnAgentSession({
          harness: profile.harness,
          model: profile.model,
          effort: profile.effort,
          prompt: initialImplementerPrompt({
            phaseNumber: activePhase(activeState).number,
            entryPlanPath: activeState.plan.entryPlanPath,
          }),
        });
        const implementer = {
          agentSessionId: spawned.agentSessionId,
          paneId: spawned.paneId,
        } satisfies Implementer;
        await ctx.log(
          "info",
          `Spawned ${profile.kind} implementer for phase ${activePhase(activeState).number}/${activeState.plan.phases.length}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${implementer.agentSessionId}, paneId=${implementer.paneId}.`,
        );
        return suspend(
          withStage(activeState, {
            kind: "await-implementer-turn",
            implementer,
            activity: "alignment",
            exchangeNumber: 1,
          }),
          wait.agentTurn(spawned),
        );
      }

      case "await-implementer-turn": {
        const activeState = requireActiveState(state);
        const phase = activePhase(activeState);
        const ended = await requireEndedTurn(ctx, event, {
          role: "implementer",
          phaseNumber: phase.number,
        });
        if (!ended.ok) return ended.result;
        if (phase.type === "mock-ui") {
          await setHumanCompletionStatus(ctx, activeState);
          await ctx.log(
            "info",
            `Mock phase ${phase.number} initial implementer turn ended; handing control to the human.`,
          );
          return suspend(
            withStage(activeState, {
              kind: "await-human-completion",
              implementer: state.stage.implementer,
            }),
            wait.userContinue(),
          );
        }
        const implementerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: state.stage.implementer.agentSessionId,
          label: "implementer",
          phaseNumber: activePhase(activeState).number,
        });
        if (!implementerTurn.ok) return implementerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyImplementerOutcome",
          prompt: classifyImplementerOutcomePrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activePhase(activeState).number,
            phaseCount: activeState.plan.phases.length,
            entryPlanPath: activeState.plan.entryPlanPath,
            implementerTurn: implementerTurn.text,
          }),
          nextState: withStage(activeState, {
            kind: "await-implementer-outcome",
            implementer: state.stage.implementer,
            implementerTurn: implementerTurn.text,
            exchangeNumber: state.stage.exchangeNumber,
          }),
        });
      }

      case "await-implementer-outcome": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyImplementerOutcome",
          failureMessage: `The implementer response for phase ${activePhase(activeState).number} could not be classified`,
          parse: parseImplementerOutcomeResult,
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome !== "planner-response-needed") {
          return completePhase(
            ctx,
            activeState,
            state.stage.implementer,
            judgment.value.outcome ===
              "phase-complete-awaiting-human-verification",
          );
        }
        return routeImplementerTurnToPlanner(ctx, activeState, {
          implementer: state.stage.implementer,
          implementerTurn: state.stage.implementerTurn,
          exchangeNumber: state.stage.exchangeNumber,
        });
      }

      case "await-planner-turn": {
        const activeState = requireActiveState(state);
        const ended = await requireEndedTurn(ctx, event, {
          role: "planner",
          phaseNumber: activePhase(activeState).number,
        });
        if (!ended.ok) return ended.result;
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activePhase(activeState).number,
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPlannerOutcome",
          prompt: classifyPlannerOutcomePrompt({
            phaseNumber: activePhase(activeState).number,
            phaseCount: activeState.plan.phases.length,
            plannerTurn: plannerTurn.text,
          }),
          nextState: withStage(activeState, {
            kind: "await-planner-outcome",
            implementer: state.stage.implementer,
            plannerTurn: plannerTurn.text,
            exchangeNumber: state.stage.exchangeNumber,
          }),
        });
      }

      case "await-planner-outcome": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyPlannerOutcome",
          failureMessage: `The planner response for phase ${activePhase(activeState).number} could not be classified`,
          parse: parsePlannerOutcomeResult,
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "severe-flag") {
          await setWorkflowStatus(ctx, {
            kind: "severe-flag",
            phase: activePhase(activeState).number,
          });
          await ctx.log(
            "warning",
            `Planner raised a severe flag during phase ${activePhase(activeState).number}; waiting for human resolution.`,
          );
          return suspend(
            withStage(activeState, {
              kind: "await-severe-flag-resolution",
              implementer: state.stage.implementer,
              exchangeNumber: state.stage.exchangeNumber,
            }),
            wait.userContinue(),
          );
        }
        return sendPlannerTurnToImplementer(ctx, activeState, {
          implementer: state.stage.implementer,
          plannerTurn: state.stage.plannerTurn,
          outcome: judgment.value.outcome,
          exchangeNumber: state.stage.exchangeNumber,
        });
      }

      case "await-severe-flag-resolution": {
        const activeState = requireActiveState(state);
        if (!workflowEvent.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `The severe flag pause for phase ${activePhase(activeState).number} could not be resumed`,
            "Severe flag resolution resumed with an unexpected event.",
          );
        }
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activePhase(activeState).number,
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        await ctx.log(
          "info",
          `Human continued after the severe flag in phase ${activePhase(activeState).number}; sending the latest planner turn verbatim without reclassification.`,
        );
        return sendRawPlannerTurnAfterHumanResolution(ctx, activeState, {
          implementer: state.stage.implementer,
          plannerTurn: plannerTurn.text,
          exchangeNumber: state.stage.exchangeNumber,
        });
      }

      case "await-auto-review": {
        const activeState = requireActiveState(state);
        const reviewResult = readSuccessfulReviewChildResult(
          event,
          state.stage.runId,
        );
        if (!reviewResult.ok) {
          return failWorkflow(
            ctx,
            `Automatic review failed for phase ${activePhase(activeState).number}`,
            `Automatic review child workflow ${state.stage.runId} failed: ${reviewResult.reason}`,
          );
        }
        await ctx.log(
          "info",
          `Automatic review child workflow ${state.stage.runId} completed phase ${activePhase(activeState).number} after ${reviewResult.reviewCount} review rounds.`,
        );
        return continueAfterAutoReview(
          ctx,
          activeState,
          state.stage.implementer,
          state.stage.requiresHumanVerification ?? false,
        );
      }

      case "await-human-completion": {
        const activeState = requireActiveState(state);
        if (!workflowEvent.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `Phase ${activePhase(activeState).number} human checkpoint could not be resumed`,
            "Human completion checkpoint resumed with an unexpected event.",
          );
        }
        await ctx.log(
          "info",
          `Human completion confirmed for phase ${activePhase(activeState).number}.`,
        );
        return continueAfterHumanApproval(activeState, state.stage.implementer);
      }

      case "start-commit": {
        const activeState = requireActiveState(state);
        const phase = activePhase(activeState);
        await setWorkflowStatus(ctx, {
          kind: "commit",
          phase: phase.number,
          phaseCount: activeState.plan.phases.length,
        });
        const op = await ctx.runHeadlessAgent({
          harness: commitAgent.harness,
          model: commitAgent.model,
          effort: commitAgent.effort,
          prompt: commitPrompt({
            worktreePath: ctx.worktreePath,
            phase,
            phaseCount: activeState.plan.phases.length,
            entryPlanPath: activeState.plan.entryPlanPath,
          }),
        });
        await ctx.log(
          "info",
          `Started commit op ${op.opId} for phase ${phase.number}.`,
        );
        return suspend(
          withStage(activeState, {
            kind: "await-commit",
            implementer: state.stage.implementer,
          }),
          wait.headlessAgent(op),
        );
      }

      case "await-commit": {
        const activeState = requireActiveState(state);
        const phase = activePhase(activeState);
        try {
          const result = completedSingleCommitResult(event);
          const commit = parseCommitResult(result.output ?? "", phase);
          await ctx.log(
            "info",
            `Created commit ${commit.commit} for phase ${phase.number}: ${commit.subject}.`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return failWorkflow(
            ctx,
            `Commit failed for phase ${phase.number}`,
            `Commit failed for phase ${phase.number}: ${message}`,
          );
        }
        return cont(
          withStage(activeState, {
            kind: "advance-phase",
            implementer: state.stage.implementer,
          }) satisfies State,
        );
      }

      case "advance-phase": {
        const activeState = requireActiveState(state);
        const phase = activePhase(activeState);
        const nextPhaseIndex = activeState.plan.currentPhaseIndex + 1;
        if (nextPhaseIndex >= activeState.plan.phases.length) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `Plan implementation completed after phase ${phase.number}/${activeState.plan.phases.length}. Final implementer pane remains open.`,
          );
          return cont({
            ...activeState,
            plan: { ...activeState.plan, currentPhaseIndex: nextPhaseIndex },
            stage: { kind: "done", finalImplementer: state.stage.implementer },
          } satisfies State);
        }
        await ctx.log(
          "info",
          `Closing implementer pane ${state.stage.implementer.paneId} after phase ${phase.number}.`,
        );
        await ctx.closePane(state.stage.implementer.paneId);
        return cont({
          ...activeState,
          plan: {
            ...activeState.plan,
            currentPhaseIndex: nextPhaseIndex,
          },
          stage: { kind: "select-implementer" },
        } satisfies State);
      }

      case "done": {
        const activeState = requireActiveState(state);
        return done({
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phases: activeState.plan.phases,
          completedPhaseCount: activeState.plan.phases.length,
          finalImplementerPaneId: state.stage.finalImplementer?.paneId,
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function activatePlan(
  state: CommonState,
  discovered: NormalizedDiscoveryResult,
): ActiveState {
  return {
    stateVersion: state.stateVersion,
    options: state.options,
    plannerSessionId: state.plannerSessionId,
    plan: {
      entryPlanPath: discovered.entryPlanPath,
      decisionLogPath: discovered.decisionLogPath,
      phases: discovered.phases,
      currentPhaseIndex: discovered.currentPhaseIndex,
    },
    stage: { kind: "confirm-plan" },
  };
}

async function normalizeDiscoveryOrFail(
  ctx: WorkflowContext,
  result: Parameters<typeof normalizeDiscoveryResult>[0]["result"],
  worktreePath: string,
): Promise<
  | { readonly ok: true; readonly value: NormalizedDiscoveryResult | null }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  try {
    return {
      ok: true,
      value: normalizeDiscoveryResult({ result, worktreePath }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `The discovered plan could not be used: ${message}`,
        `Plan discovery validation failed: ${message}`,
      ),
    };
  }
}

async function routeImplementerTurnToPlanner(
  ctx: WorkflowContext,
  state: ActiveState,
  input: {
    readonly implementer: Implementer;
    readonly implementerTurn: string;
    readonly exchangeNumber: number;
  },
): Promise<WorkflowResult> {
  await setWorkflowStatus(ctx, {
    kind: "planner-reviewing",
    phase: activePhase(state).number,
    phaseCount: state.plan.phases.length,
  });
  await ctx.log(
    "info",
    `Sending implementer exchange ${input.exchangeNumber} for phase ${activePhase(state).number} to planner session ${state.plannerSessionId}.`,
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: state.plannerSessionId,
    prompt: plannerPrompt({
      phaseNumber: activePhase(state).number,
      implementerTurn: input.implementerTurn,
    }),
  });
  return suspend(
    withStage(state, {
      kind: "await-planner-turn",
      implementer: input.implementer,
      exchangeNumber: input.exchangeNumber,
    }),
    wait.agentTurn(sent),
  );
}

async function sendPlannerTurnToImplementer(
  ctx: WorkflowContext,
  state: ActiveState,
  input: {
    readonly implementer: Implementer;
    readonly plannerTurn: string;
    readonly outcome: Exclude<PlannerOutcome, "severe-flag">;
    readonly exchangeNumber: number;
  },
): Promise<WorkflowResult> {
  const approved = input.outcome === "approved";
  await setWorkflowStatus(ctx, {
    kind: approved ? "implementing" : "implementer-aligning",
    phase: activePhase(state).number,
    phaseCount: state.plan.phases.length,
  });
  await ctx.log(
    "info",
    approved
      ? `Planner approved phase ${activePhase(state).number}; sending its response verbatim to implementer session ${input.implementer.agentSessionId}.`
      : `Planner returned feedback for phase ${activePhase(state).number}; sending its response with the alignment footer to implementer session ${input.implementer.agentSessionId}.`,
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.implementer.agentSessionId,
    prompt: approved
      ? input.plannerTurn
      : implementerFollowUpPrompt(input.plannerTurn),
  });
  return suspend(
    withStage(state, {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: approved ? "implementation" : "alignment",
      exchangeNumber: input.exchangeNumber + 1,
    }),
    wait.agentTurn(sent),
  );
}

async function sendRawPlannerTurnAfterHumanResolution(
  ctx: WorkflowContext,
  state: ActiveState,
  input: {
    readonly implementer: Implementer;
    readonly plannerTurn: string;
    readonly exchangeNumber: number;
  },
): Promise<WorkflowResult> {
  await setWorkflowStatus(ctx, {
    kind: "implementing",
    phase: activePhase(state).number,
    phaseCount: state.plan.phases.length,
  });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.implementer.agentSessionId,
    prompt: input.plannerTurn,
  });
  return suspend(
    withStage(state, {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: "implementation",
      exchangeNumber: input.exchangeNumber + 1,
    }),
    wait.agentTurn(sent),
  );
}

async function completePhase(
  ctx: WorkflowContext,
  state: ActiveState,
  implementer: Implementer,
  requiresHumanVerification: boolean,
): Promise<WorkflowResult> {
  // The decision log remains the cross-run source of truth. We intentionally trust the
  // implementer's completion report here; add live decision-log verification at this
  // transition if agent behavior becomes unreliable.
  await ctx.log(
    "info",
    requiresHumanVerification
      ? `Phase ${activePhase(state).number}/${state.plan.phases.length} implementation completed; awaiting required human verification.`
      : `Phase ${activePhase(state).number}/${state.plan.phases.length} completed.`,
  );
  if (state.options.autoReview) {
    await setWorkflowStatus(ctx, {
      kind: "auto-review",
      phase: activePhase(state).number,
      phaseCount: state.plan.phases.length,
    });
    const context = `We are currently implementing phase ${activePhase(state).number} of the plan in ${state.plan.entryPlanPath}. Review all the changes since HEAD.`;
    const runId = await ctx.startWorkflow("engineering-guidance-review-loop", {
      context,
    });
    await ctx.log(
      "info",
      `Started automatic review child workflow ${runId} for phase ${activePhase(state).number}.`,
    );
    return suspend(
      withStage(state, {
        kind: "await-auto-review",
        implementer,
        runId,
        requiresHumanVerification,
      }),
      wait.workflow(runId),
    );
  }
  return continueAfterAutoReview(
    ctx,
    state,
    implementer,
    requiresHumanVerification,
  );
}

async function continueAfterAutoReview(
  ctx: WorkflowContext,
  state: ActiveState,
  implementer: Implementer,
  requiresHumanVerification: boolean,
): Promise<WorkflowResult> {
  if (state.options.humanInTheLoop || requiresHumanVerification) {
    await setHumanCompletionStatus(ctx, state, requiresHumanVerification);
    return suspend(
      withStage(state, { kind: "await-human-completion", implementer }),
      wait.userContinue(),
    );
  }
  return continueAfterHumanApproval(state, implementer);
}

function continueAfterHumanApproval(
  state: ActiveState,
  implementer: Implementer,
): WorkflowResult {
  return cont(
    withStage(state, {
      kind: state.options.autoCommit ? "start-commit" : "advance-phase",
      implementer,
    }) satisfies State,
  );
}

function readSuccessfulReviewChildResult(
  event: unknown,
  expectedRunId: number,
):
  | { readonly ok: true; readonly reviewCount: number }
  | { readonly ok: false; readonly reason: string } {
  const results = workflowEvent.getWorkflowResults(event);
  if (!results) {
    return { ok: false, reason: "workflow resumed with a non-workflow event" };
  }
  if (results.length !== 1) {
    return {
      ok: false,
      reason: `expected one child result, received ${results.length}`,
    };
  }
  const child = results[0];
  if (!child || child.runId !== expectedRunId) {
    return {
      ok: false,
      reason: `expected child run ${expectedRunId}, received ${child?.runId ?? "none"}`,
    };
  }
  if (child.status !== "done") {
    return {
      ok: false,
      reason: `child run failed${child.error === undefined ? "" : `: ${describeUnknown(child.error)}`}`,
    };
  }
  if (
    !child.result ||
    typeof child.result !== "object" ||
    Array.isArray(child.result)
  ) {
    return { ok: false, reason: "child result was not an object" };
  }
  const result = child.result as Record<string, unknown>;
  const keys = Object.keys(result).sort();
  if (keys.length !== 2 || keys[0] !== "outcome" || keys[1] !== "reviewCount") {
    return {
      ok: false,
      reason: "child result did not match the review workflow success contract",
    };
  }
  if (result.outcome !== "workflow-executed-successfully") {
    return {
      ok: false,
      reason: "child result did not report workflow-executed-successfully",
    };
  }
  if (
    typeof result.reviewCount !== "number" ||
    !Number.isInteger(result.reviewCount) ||
    result.reviewCount < 1
  ) {
    return { ok: false, reason: "child result reviewCount was invalid" };
  }
  return { ok: true, reviewCount: result.reviewCount };
}

function describeUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function startHeadlessJudgment(
  ctx: WorkflowContext,
  input: {
    readonly judgment: string;
    readonly prompt: string;
    readonly nextState: State;
  },
): Promise<WorkflowResult> {
  await ctx.log("info", `Starting ${input.judgment} headless judgment.`);
  const op = await ctx.runHeadlessAgent({
    harness: headlessJudgment.harness,
    model: headlessJudgment.model,
    effort: headlessJudgment.effort,
    prompt: input.prompt,
  });
  await ctx.log(
    "info",
    `Started ${input.judgment} headless judgment op ${op.opId}.`,
  );
  return suspend(input.nextState, wait.headlessAgent(op));
}

async function readHeadlessJudgment<Result>(
  ctx: WorkflowContext,
  state: State,
  event: unknown,
  input: {
    readonly name: string;
    readonly failureMessage: string;
    readonly parse: (output: string) => Result;
  },
): Promise<
  | { readonly ok: true; readonly value: Result }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const rawOutput = headlessRawOutput(event);
  try {
    const result = completedSingleHeadlessJudgmentResult(event);
    const value = input.parse(result.output ?? "");
    await ctx.log(
      "info",
      `Parsed ${input.name} result: ${JSON.stringify(value)}.`,
    );
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.log(
      "error",
      `${input.name} failed in ${state.stage.kind}: ${message}`,
    );
    if (rawOutput.length > 0) {
      await ctx.log("error", `Raw ${input.name} output: ${rawOutput}`);
    }
    await setWorkflowStatus(ctx, {
      kind: "failed",
      message: input.failureMessage,
    });
    return { ok: false, result: fail(`${input.name} failed: ${message}`) };
  }
}

async function requireEndedTurn(
  ctx: WorkflowContext,
  event: unknown,
  input: {
    readonly role: "planner" | "implementer";
    readonly phaseNumber: number;
  },
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  if (workflowEvent.isAgentTurnEnded(event)) return { ok: true };
  const role = input.role === "planner" ? "Planner" : "Implementer";
  if (workflowEvent.isAgentTurnFailed(event)) {
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `${role} turn failed during phase ${input.phaseNumber}`,
        `${role} turn failed during phase ${input.phaseNumber}: ${event.reason}`,
      ),
    };
  }
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `${role} turn for phase ${input.phaseNumber} could not be resumed`,
      `${role} turn wait resumed with an unexpected event.`,
    ),
  };
}

async function latestAssistantTurnOrFail(
  ctx: WorkflowContext,
  input: {
    readonly agentSessionId: number;
    readonly label: "planner" | "implementer";
    readonly phaseNumber: number;
  },
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await ctx.getConversationHistory(input.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `No ${input.label} response was found for phase ${input.phaseNumber}`,
      `${input.label} session ${input.agentSessionId} has no complete assistant turn to inspect.`,
    ),
  };
}

async function fullConversationTextOrFail(
  ctx: WorkflowContext,
  input: { readonly agentSessionId: number; readonly label: "planner" },
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await ctx.getConversationHistory(input.agentSessionId);
  const text = formatConversationHistory(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      "The planner conversation is empty",
      `${input.label} session ${input.agentSessionId} has no conversation text to inspect.`,
    ),
  };
}

function formatConversationHistory(
  history: readonly WorkflowConversationMessage[],
): string {
  return history
    .map((message, index) => {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!text) return "";
      return `Message ${index + 1} (${message.role}):\n${text}`;
    })
    .filter((entry) => entry.length > 0)
    .join("\n\n");
}

function initialImplementerPrompt(input: {
  readonly phaseNumber: number;
  readonly entryPlanPath: string;
}): string {
  return `Implement the phase ${input.phaseNumber} in ${input.entryPlanPath}.

${alignmentFooter()}`;
}

function implementerFollowUpPrompt(plannerTurn: string): string {
  return `${plannerTurn}

${alignmentFooter()}`;
}

function alignmentFooter(): string {
  return `I want you to:

- Ask clarifying questions till we have shared understanding and complete alignment on what needs to be done. Do not use the askUserQuestion tool.
- Pushback on my ideas.
- Try to flag or highlight major shortcomings or opportunities to simplify logic.
- Clearly state your understanding.
- Don't run tasks or shell commands in the background. You may run them in the foreground.
- Let me know once we have alignment to begin implementation
- Never start implementing unless I explicitly say so.`;
}

function plannerPrompt(input: {
  readonly phaseNumber: number;
  readonly implementerTurn: string;
}): string {
  return `I am implementing phase ${input.phaseNumber}. Make sure that I am aligned.

${input.implementerTurn}

I want you to:

- Pushback on my understanding.
- Answer my questions. Make sure the answers are grounded in our current conversation, ADRs, and guidance.
- Feel free to refactor or update the phase scope if pushbacks make sense, are easy to implement, or simplify the logic. Remind me to document the same in the decision log instead of modifying the plan file.
- Flag major questions or decisions which were not covered by our conversation which can impact our architecture in a severe way to me. Make sure to include all necessary context so I can understand why it's a flag and how to address it. Explicitly mention "no flags" if we are good.
- Always mention the nuances and considerations that I may be missing to make sure I have deep understanding.
- Try to keep fallback logic to a minimum. Introduce new fallback logic only if absolutely necessary
- Only approve implementation once I have no clarifying questions in my most recent message.
- Don't run tasks or shell commands in the background. You may run them in the foreground.`;
}

function selectImplementerProfile(kind: ImplementerKind): ImplementerProfile {
  switch (kind) {
    case "ui-heavy":
      return implementerUiHeavy;
    case "prose-heavy":
      return implementerProseHeavy;
    case "generic":
      return implementerGeneric;
    default:
      return assertNever(kind);
  }
}

function activateCommonState(state: State): CommonState {
  return {
    stateVersion: state.stateVersion,
    options: state.options,
    plannerSessionId: state.plannerSessionId,
  };
}

function requireActiveState(state: State): ActiveState {
  if (!("plan" in state)) {
    throw new Error(
      `Workflow stage ${state.stage.kind} requires an active plan.`,
    );
  }
  return state;
}

function withStage(state: ActiveState, stage: ActiveStage): ActiveState {
  return { ...activateCommonState(state), plan: state.plan, stage };
}

function currentPhase(state: ActiveState): PlanPhase | undefined {
  return state.plan.phases[state.plan.currentPhaseIndex];
}

function activePhase(state: ActiveState): PlanPhase {
  const phase = currentPhase(state);
  if (!phase) {
    throw new Error(
      `Workflow stage ${state.stage.kind} requires phase index ${state.plan.currentPhaseIndex}, but the plan has ${state.plan.phases.length} phases.`,
    );
  }
  return phase;
}

async function setHumanCompletionStatus(
  ctx: WorkflowContext,
  state: ActiveState,
  requiresHumanVerification = false,
): Promise<void> {
  const phase = activePhase(state);
  await setWorkflowStatus(
    ctx,
    requiresHumanVerification
      ? {
          kind: "human-verification",
          phase: phase.number,
          phaseCount: state.plan.phases.length,
        }
      : phase.type === "mock-ui"
      ? {
          kind: "mock-human-completion",
          phase: phase.number,
          phaseCount: state.plan.phases.length,
          phaseSlug: phase.slug,
          autoCommit: state.options.autoCommit,
        }
      : {
          kind: "phase-review",
          phase: phase.number,
          phaseCount: state.plan.phases.length,
        },
  );
}

function parseHumanInTheLoop(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Human in the loop must be yes or no.");
}

function parseAutoReview(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic review must be yes or no.");
}

function parseAutoCommit(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic commit must be yes or no.");
}

function headlessRawOutput(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const results = (event as { readonly results?: unknown }).results;
  if (!Array.isArray(results)) return "";
  const output = (results[0] as { readonly output?: unknown } | undefined)
    ?.output;
  return typeof output === "string" ? output : "";
}

async function failWorkflow(
  ctx: WorkflowContext,
  userMessage: string,
  diagnostic: string,
): Promise<WorkflowResult> {
  await setWorkflowStatus(ctx, { kind: "failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return fail(diagnostic);
}

async function logTransition(
  ctx: WorkflowContext,
  state: State,
): Promise<void> {
  const phase =
    "plan" in state
      ? `${currentPhase(state)?.number ?? "complete"}/${state.plan.phases.length}`
      : "unknown";
  const completed = "plan" in state ? state.plan.currentPhaseIndex : "unknown";
  await ctx.log(
    "debug",
    `Workflow step stage=${state.stage.kind}, phase=${phase}, completedPhaseCount=${completed}.`,
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
