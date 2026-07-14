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
  headlessJudgment,
  implementerGeneric,
  implementerProseHeavy,
  implementerUiHeavy,
  type ImplementerKind,
  type ImplementerProfile,
} from "./constants.js";
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
  type PlannerOutcome,
} from "./judgments.js";

type CommonState = {
  readonly stateVersion: 2;
  readonly humanInTheLoop: boolean;
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
  readonly phaseCount: number;
  readonly completedPhaseCount: number;
  readonly currentPhase: number;
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
      readonly kind: "await-phase-review";
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
  readonly humanInTheLoop?: unknown;
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
    inputs: [humanInTheLoopInput],
  }),
  validate: (launchCtx, variables) => {
    if (
      launchCtx.agentSessionId === null ||
      launchCtx.agentSessionId === undefined
    ) {
      throw new Error("Start this workflow from the planner agent pane.");
    }
    parseHumanInTheLoop(variables.humanInTheLoop);
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 2,
    humanInTheLoop: parseHumanInTheLoop(variables.humanInTheLoop) === "yes",
    plannerSessionId: launchCtx.agentSessionId as number,
    stage: { kind: "discover-plan" },
  }),
  step: async (ctx, state, event) => {
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
        await setWorkflowStatus(ctx, {
          kind: "plan-ready",
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phaseCount: activeState.plan.phaseCount,
          completedPhaseCount: activeState.plan.completedPhaseCount,
          nextPhase: activeState.plan.currentPhase,
        });
        await ctx.log(
          "info",
          `Plan found at ${activeState.plan.entryPlanPath} with ${activeState.plan.phaseCount} phases. Decision log: ${activeState.plan.decisionLogPath}. Completed phases: ${activeState.plan.completedPhaseCount}. Next phase: ${activeState.plan.currentPhase}.`,
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
        if (activeState.plan.currentPhase > activeState.plan.phaseCount) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `The decision log already contains all ${activeState.plan.phaseCount} phase decisions.`,
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
        await setWorkflowStatus(ctx, {
          kind: "preparing-phase",
          phase: activeState.plan.currentPhase,
          phaseCount: activeState.plan.phaseCount,
        });
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPhaseImplementationKind",
          prompt: classifyPhaseImplementationKindPrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
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
          failureMessage: `The implementer for phase ${activeState.plan.currentPhase} could not be selected`,
          parse: parsePhaseImplementationKindResult,
        });
        if (!judgment.ok) return judgment.result;
        const profile = selectImplementerProfile(
          judgment.value.implementationKind,
        );
        await ctx.log(
          "info",
          `Selected the ${profile.kind} implementer profile for phase ${activeState.plan.currentPhase}.`,
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
          phase: activeState.plan.currentPhase,
          phaseCount: activeState.plan.phaseCount,
        });
        const spawned = await ctx.spawnAgentSession({
          harness: profile.harness,
          model: profile.model,
          effort: profile.effort,
          prompt: initialImplementerPrompt({
            phaseNumber: activeState.plan.currentPhase,
            entryPlanPath: activeState.plan.entryPlanPath,
          }),
        });
        const implementer = {
          agentSessionId: spawned.agentSessionId,
          paneId: spawned.paneId,
        } satisfies Implementer;
        await ctx.log(
          "info",
          `Spawned ${profile.kind} implementer for phase ${activeState.plan.currentPhase}/${activeState.plan.phaseCount}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${implementer.agentSessionId}, paneId=${implementer.paneId}.`,
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
        const ended = await requireEndedTurn(ctx, event, {
          role: "implementer",
          phaseNumber: activeState.plan.currentPhase,
        });
        if (!ended.ok) return ended.result;
        const implementerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: state.stage.implementer.agentSessionId,
          label: "implementer",
          phaseNumber: activeState.plan.currentPhase,
        });
        if (!implementerTurn.ok) return implementerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyImplementerOutcome",
          prompt: classifyImplementerOutcomePrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
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
          failureMessage: `The implementer response for phase ${activeState.plan.currentPhase} could not be classified`,
          parse: parseImplementerOutcomeResult,
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "phase-complete") {
          return completePhase(ctx, activeState, state.stage.implementer);
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
          phaseNumber: activeState.plan.currentPhase,
        });
        if (!ended.ok) return ended.result;
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activeState.plan.currentPhase,
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPlannerOutcome",
          prompt: classifyPlannerOutcomePrompt({
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
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
          failureMessage: `The planner response for phase ${activeState.plan.currentPhase} could not be classified`,
          parse: parsePlannerOutcomeResult,
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "severe-flag") {
          await setWorkflowStatus(ctx, {
            kind: "severe-flag",
            phase: activeState.plan.currentPhase,
          });
          await ctx.log(
            "warning",
            `Planner raised a severe flag during phase ${activeState.plan.currentPhase}; waiting for human resolution.`,
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
            `The severe flag pause for phase ${activeState.plan.currentPhase} could not be resumed`,
            "Severe flag resolution resumed with an unexpected event.",
          );
        }
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activeState.plan.currentPhase,
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        await ctx.log(
          "info",
          `Human continued after the severe flag in phase ${activeState.plan.currentPhase}; sending the latest planner turn verbatim without reclassification.`,
        );
        return sendRawPlannerTurnAfterHumanResolution(ctx, activeState, {
          implementer: state.stage.implementer,
          plannerTurn: plannerTurn.text,
          exchangeNumber: state.stage.exchangeNumber,
        });
      }

      case "await-phase-review": {
        const activeState = requireActiveState(state);
        if (!workflowEvent.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `Phase ${activeState.plan.currentPhase} review could not be resumed`,
            "Phase review resumed with an unexpected event.",
          );
        }
        await ctx.log(
          "info",
          `Human review completed for phase ${activeState.plan.currentPhase}.`,
        );
        return cont(
          withStage(activeState, {
            kind: "advance-phase",
            implementer: state.stage.implementer,
          }) satisfies State,
        );
      }

      case "advance-phase": {
        const activeState = requireActiveState(state);
        if (activeState.plan.currentPhase >= activeState.plan.phaseCount) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `Plan implementation completed after phase ${activeState.plan.currentPhase}/${activeState.plan.phaseCount}. Final implementer pane remains open.`,
          );
          return cont(
            withStage(activeState, {
              kind: "done",
              finalImplementer: state.stage.implementer,
            }) satisfies State,
          );
        }
        await ctx.log(
          "info",
          `Closing implementer pane ${state.stage.implementer.paneId} after phase ${activeState.plan.currentPhase}.`,
        );
        await ctx.closePane(state.stage.implementer.paneId);
        return cont({
          ...activeState,
          plan: {
            ...activeState.plan,
            currentPhase: activeState.plan.currentPhase + 1,
          },
          stage: { kind: "select-implementer" },
        } satisfies State);
      }

      case "done": {
        const activeState = requireActiveState(state);
        return done({
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phaseCount: activeState.plan.phaseCount,
          completedPhaseCount: activeState.plan.completedPhaseCount,
          nextPhaseToImplement: activeState.plan.phaseCount + 1,
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
    humanInTheLoop: state.humanInTheLoop,
    plannerSessionId: state.plannerSessionId,
    plan: {
      entryPlanPath: discovered.entryPlanPath,
      decisionLogPath: discovered.decisionLogPath,
      phaseCount: discovered.phaseCount,
      completedPhaseCount: discovered.completedPhaseCount,
      currentPhase: discovered.nextPhaseToImplement,
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
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount,
  });
  await ctx.log(
    "info",
    `Sending implementer exchange ${input.exchangeNumber} for phase ${state.plan.currentPhase} to planner session ${state.plannerSessionId}.`,
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: state.plannerSessionId,
    prompt: plannerPrompt({
      phaseNumber: state.plan.currentPhase,
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
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount,
  });
  await ctx.log(
    "info",
    approved
      ? `Planner approved phase ${state.plan.currentPhase}; sending its response verbatim to implementer session ${input.implementer.agentSessionId}.`
      : `Planner returned feedback for phase ${state.plan.currentPhase}; sending its response with the alignment footer to implementer session ${input.implementer.agentSessionId}.`,
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
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount,
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
): Promise<WorkflowResult> {
  // The decision log remains the cross-run source of truth. We intentionally trust the
  // implementer's completion report here; add live decision-log verification at this
  // transition if agent behavior becomes unreliable.
  const completedState = {
    ...state,
    plan: {
      ...state.plan,
      completedPhaseCount: Math.max(
        state.plan.completedPhaseCount,
        state.plan.currentPhase,
      ),
    },
  } satisfies ActiveState;
  await ctx.log(
    "info",
    `Phase ${state.plan.currentPhase}/${state.plan.phaseCount} completed.`,
  );
  if (state.humanInTheLoop) {
    await setWorkflowStatus(ctx, {
      kind: "phase-review",
      phase: state.plan.currentPhase,
      phaseCount: state.plan.phaseCount,
    });
    return suspend(
      withStage(completedState, { kind: "await-phase-review", implementer }),
      wait.userContinue(),
    );
  }
  return cont(
    withStage(completedState, {
      kind: "advance-phase",
      implementer,
    }) satisfies State,
  );
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
- Clearly state your understanding
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
- Only approve implementation once I have no clarifying questions in my most recent message.`;
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
    humanInTheLoop: state.humanInTheLoop,
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

function parseHumanInTheLoop(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Human in the loop must be yes or no.");
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
      ? `${state.plan.currentPhase}/${state.plan.phaseCount}`
      : "unknown";
  const completed =
    "plan" in state ? state.plan.completedPhaseCount : "unknown";
  await ctx.log(
    "debug",
    `Workflow step stage=${state.stage.kind}, phase=${phase}, completedPhaseCount=${completed}.`,
  );
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
