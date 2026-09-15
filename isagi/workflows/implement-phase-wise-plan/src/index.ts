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
import { completionReportPrompt } from "./completion.js";
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
  // Absent in older version-5 states; only a successful review establishes this fact.
  readonly reviewComplete?: boolean;
};

type Implementer = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type ImplementerActivity = "alignment" | "implementation";
type CompletionCheckpoint = "before-review" | "after-review";

type ActiveStage =
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
      readonly kind: "await-completion-report";
      readonly implementer: Implementer;
      readonly checkpoint: CompletionCheckpoint;
      readonly exchangeNumber: number;
    }
  | {
      readonly kind: "await-completion-outcome";
      readonly implementer: Implementer;
      readonly checkpoint: CompletionCheckpoint;
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
      // Older version-5 review waits did not retain the exchange number.
      readonly exchangeNumber?: number;
      // Legacy persisted field; the fresh final report now determines verification.
      readonly requiresHumanVerification?: boolean | undefined;
    }
  | {
      readonly kind: "await-human-completion";
      readonly implementer: Implementer;
    }
  | {
      readonly kind: "await-mock-human-approval";
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
  | { readonly kind: "done" };

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
        if (!nextPhase) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `The decision log already contains all ${activeState.plan.phases.length} phase decisions.`,
          );
          return cont(withStage(activeState, { kind: "done" }) satisfies State);
        }
        return cont(withStage(activeState, { kind: "select-implementer" }) satisfies State);
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
        const phase = activePhase(activeState);
        const profile = state.stage.profile;
        await setWorkflowStatus(ctx, {
          kind: "implementer-aligning",
          phase: phase.number,
          phaseCount: activeState.plan.phases.length,
        });
        const spawned = await ctx.spawnAgentSession({
          harness: profile.harness,
          model: profile.model,
          effort: profile.effort,
          prompt:
            phase.type === "mock-ui"
              ? initialMockUiPrompt({
                  phaseNumber: phase.number,
                  entryPlanPath: activeState.plan.entryPlanPath,
                })
              : initialImplementerPrompt({
                  phaseNumber: phase.number,
                  entryPlanPath: activeState.plan.entryPlanPath,
                }),
          modifiers:
            phase.type === "mock-ui"
              ? [{ kind: "skill", name: "designing-ui" }]
              : undefined,
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
        if (phase.type === "mock-ui" && state.stage.exchangeNumber === 1) {
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
        if (state.stage.activity === "implementation") {
          return requestCompletionReport(ctx, activeState, state.stage.implementer, "before-review", state.stage.exchangeNumber);
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
          return requestCompletionReport(ctx, activeState, state.stage.implementer, "before-review", state.stage.exchangeNumber);
        }
        return routeImplementerTurnToPlanner(ctx, activeState, {
          implementer: state.stage.implementer,
          implementerTurn: state.stage.implementerTurn,
          exchangeNumber: state.stage.exchangeNumber,
        });
      }

      case "await-completion-report": {
        const activeState = requireActiveState(state);
        const ended = await requireEndedTurn(ctx, event, {
          role: "implementer",
          phaseNumber: activePhase(activeState).number,
        });
        if (!ended.ok) return ended.result;
        const report = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: state.stage.implementer.agentSessionId,
          label: "implementer",
          phaseNumber: activePhase(activeState).number,
        });
        if (!report.ok) return report.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyImplementerOutcome",
          prompt: classifyImplementerOutcomePrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activePhase(activeState).number,
            phaseCount: activeState.plan.phases.length,
            entryPlanPath: activeState.plan.entryPlanPath,
            turnPurpose: state.stage.checkpoint,
            implementerTurn: report.text,
          }),
          nextState: withStage(activeState, {
            ...state.stage,
            kind: "await-completion-outcome",
            implementerTurn: report.text,
          }),
        });
      }

      case "await-completion-outcome": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyImplementerOutcome",
          failureMessage: `The completion report for phase ${activePhase(activeState).number} could not be classified`,
          parse: parseImplementerOutcomeResult,
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "planner-response-needed") {
          return routeImplementerTurnToPlanner(ctx,
            state.stage.checkpoint === "after-review" && activeState.options.autoReview
              ? withReviewComplete(activeState, true)
              : activeState,
            state.stage);
        }
        if (state.stage.checkpoint === "before-review") {
          return startOptionalReview(ctx, activeState, state.stage.implementer, state.stage.exchangeNumber);
        }
        return routeFinalApproval(ctx, activeState, state.stage.implementer,
          judgment.value.outcome === "phase-complete-awaiting-human-verification");
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
        if (judgment.value.outcome === "completion-approved") {
          return requestCompletionReport(ctx, activeState, state.stage.implementer,
            "before-review", state.stage.exchangeNumber, state.stage.plannerTurn);
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
          `Human continued after the severe flag in phase ${activePhase(activeState).number}; sending the latest planner turn with human-resolution framing without reclassification.`,
        );
        return sendPlannerTurnAfterHumanResolution(ctx, activeState, {
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
        return requestCompletionReport(ctx, withReviewComplete(activeState, true), state.stage.implementer, "after-review", state.stage.exchangeNumber ?? 1);
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
        if (activePhase(activeState).type === "mock-ui") {
          return requestCompletionReport(ctx, activeState, state.stage.implementer, "before-review", 1);
        }
        return continueAfterHumanApproval(activeState, state.stage.implementer);
      }

      case "await-mock-human-approval": {
        const activeState = requireActiveState(state);
        if (!workflowEvent.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `Phase ${activePhase(activeState).number} human approval could not be resumed`,
            "Mock phase human approval resumed with an unexpected event.",
          );
        }
        await ctx.log(
          "info",
          `Human approval confirmed for mock phase ${activePhase(activeState).number}.`,
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
            `Plan implementation completed after phase ${phase.number}/${activeState.plan.phases.length}; closing final implementer pane ${state.stage.implementer.paneId}.`,
          );
          await ctx.closePane(state.stage.implementer.paneId);
          return cont({
            ...activeState,
            plan: { ...activeState.plan, currentPhaseIndex: nextPhaseIndex, reviewComplete: false },
            stage: { kind: "done" },
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
            reviewComplete: false,
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
    stage: { kind: "select-implementer" },
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
      reviewComplete: state.plan.reviewComplete === true,
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
    readonly outcome: Exclude<PlannerOutcome, "severe-flag" | "completion-approved">;
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
      ? `Planner approved phase ${activePhase(state).number}; sending its attributed approval to implementer session ${input.implementer.agentSessionId}.`
      : `Planner returned feedback for phase ${activePhase(state).number}; sending its response with the alignment footer to implementer session ${input.implementer.agentSessionId}.`,
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.implementer.agentSessionId,
    prompt: approved
      ? implementerApprovalPrompt(activePhase(state).number, input.plannerTurn)
      : implementerFollowUpPrompt(activePhase(state).number, input.plannerTurn),
  });
  return suspend(
    withStage(approved ? withReviewComplete(state, false) : state, {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: approved ? "implementation" : "alignment",
      exchangeNumber: input.exchangeNumber + 1,
    }),
    wait.agentTurn(sent),
  );
}

async function sendPlannerTurnAfterHumanResolution(
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
    prompt: humanResolutionPrompt(activePhase(state).number, input.plannerTurn),
  });
  return suspend(
    withStage(withReviewComplete(state, false), {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: "implementation",
      exchangeNumber: input.exchangeNumber + 1,
    }),
    wait.agentTurn(sent),
  );
}

async function requestCompletionReport(
  ctx: WorkflowContext,
  state: ActiveState,
  implementer: Implementer,
  checkpoint: CompletionCheckpoint,
  exchangeNumber: number,
  plannerTurn?: string,
): Promise<WorkflowResult> {
  if (state.plan.reviewComplete) checkpoint = "after-review";
  await setWorkflowStatus(ctx, {
    kind: "completion-check",
    phase: activePhase(state).number,
    phaseCount: state.plan.phases.length,
    checkpoint,
  });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: implementer.agentSessionId,
    prompt: (plannerTurn ? `The planner accepted phase completion. Incorporate this clarification into your report; this does not authorize new implementation work.\n\n<planner_response>\n${plannerTurn}\n</planner_response>\n\n` : "") + completionReportPrompt({
      phaseNumber: activePhase(state).number,
      phaseCount: state.plan.phases.length,
      entryPlanPath: state.plan.entryPlanPath,
      checkpoint,
      autoReview: state.options.autoReview,
    }),
  });
  return suspend(withStage(state, {
    kind: "await-completion-report", implementer, checkpoint, exchangeNumber,
  }), wait.agentTurn(sent));
}

async function startOptionalReview(
  ctx: WorkflowContext,
  state: ActiveState,
  implementer: Implementer,
  exchangeNumber: number,
): Promise<WorkflowResult> {
  if (state.options.autoReview) {
    await setWorkflowStatus(ctx, {
      kind: "auto-review",
      phase: activePhase(state).number,
      phaseCount: state.plan.phases.length,
    });
    const context = `The workflow is implementing phase ${activePhase(state).number} of the plan in ${state.plan.entryPlanPath}. Review all the changes since HEAD.`;
    const runId = await ctx.startWorkflow("engineering-guidance-review-loop", {
      context,
    }, { agentSessionId: implementer.agentSessionId });
    await ctx.log(
      "info",
      `Started automatic review child workflow ${runId} for phase ${activePhase(state).number}.`,
    );
    return suspend(
      withStage(state, {
        kind: "await-auto-review",
        implementer,
        runId,
        exchangeNumber,
      }),
      wait.workflow(runId),
    );
  }
  return requestCompletionReport(ctx, state, implementer, "after-review", exchangeNumber);
}

async function routeFinalApproval(
  ctx: WorkflowContext,
  state: ActiveState,
  implementer: Implementer,
  requiresHumanVerification: boolean,
): Promise<WorkflowResult> {
  if (activePhase(state).type === "mock-ui") {
    if (state.options.humanInTheLoop || requiresHumanVerification) {
      await setWorkflowStatus(ctx, {
        kind: requiresHumanVerification ? "human-verification" : "phase-review",
        phase: activePhase(state).number,
        phaseCount: state.plan.phases.length,
      });
      return suspend(
        withStage(state, {
          kind: "await-mock-human-approval",
          implementer,
        }),
        wait.userContinue(),
      );
    }
    return continueAfterHumanApproval(state, implementer);
  }
  if (
    state.options.humanInTheLoop ||
    requiresHumanVerification
  ) {
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
  return `You are the implementer for phase ${input.phaseNumber} in ${input.entryPlanPath}, working unattended in an orchestrated workflow.

Start by establishing alignment with the planner. Include questions and pushback in your response; the workflow will forward it to the planner rather than waiting for a live human answer.

${alignmentFooter()}`;
}

function initialMockUiPrompt(input: {
  readonly phaseNumber: number;
  readonly entryPlanPath: string;
}): string {
  return `You are preparing the human-led mock-UI work for phase ${input.phaseNumber} in ${input.entryPlanPath}.

Before creating mockups, explain what the phase covers and what it needs to achieve. Ask the human the questions needed to establish shared understanding.

The workflow will hand control to the human after this response so they can drive the mockup implementation and visual iteration with you.`;
}

function implementerFollowUpPrompt(phaseNumber: number, plannerTurn: string): string {
  return `The planner returned the following feedback on phase ${phaseNumber}:

<planner_response>
${plannerTurn}
</planner_response>

Continue establishing alignment with the planner. You are working unattended. Include questions and pushback in your response for the workflow to forward to the planner rather than waiting for a live human answer.

${alignmentFooter()}`;
}

function implementerApprovalPrompt(phaseNumber: number, plannerTurn: string): string {
  return `The planner has approved implementation of phase ${phaseNumber}.

<planner_response>
${plannerTurn}
</planner_response>

Implement the agreed phase according to this approval and the established conversation. You are working unattended. If unresolved questions or blockers arise, describe them and your current understanding in your response so the workflow can return them to the planner.

Run tasks and shell commands in the foreground, not in the background.`;
}

function humanResolutionPrompt(phaseNumber: number, plannerTurn: string): string {
  return `The human has continued the workflow after resolving the planner's escalation for phase ${phaseNumber}.

The planner's latest response follows:

<planner_response>
${plannerTurn}
</planner_response>

Continue work on the phase according to this response and the established conversation. You are working unattended again. Include any further questions or blockers in your response for the workflow to forward to the planner.

Run tasks and shell commands in the foreground, not in the background.`;
}

function alignmentFooter(): string {
  return `- Ask clarifying questions when the answer materially changes the current phase's implementation. State reasonable assumptions for routine details. Include blocking questions in your response for workflow routing; do not use the askUserQuestion tool.
- Push back when you see a concrete correctness, scope, or complexity problem.
- Flag or highlight major shortcomings or opportunities to simplify logic.
- Clearly state your understanding.
- Run tasks and shell commands in the foreground, not in the background.
- Explicitly state when alignment is established and you are ready to begin implementation.
- Begin implementation only when the planner explicitly approves it.`;
}

function plannerPrompt(input: {
  readonly phaseNumber: number;
  readonly implementerTurn: string;
  readonly reviewComplete: boolean;
}): string {
  return `You are the planner for phase ${input.phaseNumber}, working unattended in an orchestrated workflow.

The implementer returned the following response:

<implementer_response>
${input.implementerTurn}
</implementer_response>

Evaluate the implementer's current phase status. ${input.reviewComplete ? "Automatic review has already completed. Preserve that approval through clarification-only exchanges; explicitly identify any implementation changes that require reopening the phase." : "Establish enough shared understanding to implement the agreed phase."}

- Push back on concrete misunderstandings that affect the work.
- Answer the implementer's questions. Ground the answers in the established conversation, ADRs, and guidance.
- Feel free to refactor or update the phase scope if the implementer's pushback makes sense, is easy to implement, or simplifies the logic. Remind the implementer to document agreed changes in the decision log instead of modifying the plan file.
- Escalate major questions or decisions not covered by the established conversation that could severely affect the architecture or product and require human intervention before work continues. Include all necessary context so the human can understand the issue and how to address it. Always include a Human Escalation section stating either "No escalation." or "Escalation required:" followed by the issue and the decision the human must make.
- Mention nuances only when they materially affect the current phase; keep later-phase obligations in the handoff.
- Keep fallback logic to a minimum. Introduce new fallback logic only if absolutely necessary.
- Answer questions and approve in the same response when your answers resolve the blockers. A separate confirmation exchange is unnecessary. If implementation is already complete, explicitly accept completion rather than approving implementation again.
- Run tasks and shell commands in the foreground, not in the background.

Explicitly state whether you approve implementation work or accept phase completion with no implementation changes. Otherwise, provide the feedback needed to resolve a concrete blocker. Ordinary questions, caveats, and disagreements that can be resolved through the planner–implementer exchange are not human escalations.

The workflow will forward your response to the implementer or pause for human resolution when escalation is required. Include everything needed for that handoff in your response rather than waiting for a live human answer.`;
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

function withReviewComplete(state: ActiveState, reviewComplete: boolean): ActiveState {
  return { ...state, plan: { ...state.plan, reviewComplete } };
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
            autoReview: state.options.autoReview,
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
