// src/index.ts
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.0.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function r(e) {
  return e;
}
function i(e) {
  return {
    type: "cont",
    state: e
  };
}
function a(e, t) {
  return {
    type: "suspend",
    state: e,
    condition: t
  };
}
var o = {
  agentTurn(e) {
    return {
      kind: "agent_turn",
      agentSessionId: e.agentSessionId,
      sentAt: e.sentAt
    };
  },
  userContinue() {
    return { kind: "user_continue" };
  },
  userInput(e) {
    return {
      kind: "user_input",
      questions: e
    };
  },
  workflow(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Workflow wait requires at least one run id.");
    return {
      kind: "workflow",
      runIds: t
    };
  },
  headlessAgent(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Headless agent wait requires at least one operation.");
    return {
      kind: "headless_agent",
      ops: t
    };
  }
};
var s = {
  isUserContinue(e) {
    return c(e) && e.kind === "user_continue";
  },
  isUserInput(e) {
    return c(e) && e.kind === "user_input" && c(e.answers);
  },
  isAgentTurnEnded(e) {
    return c(e) && e.outcome === "ended" && typeof e.recordedAt == "string";
  },
  isAgentTurnFailed(e) {
    return c(e) && e.outcome === "failed" && typeof e.recordedAt == "string" && typeof e.reason == "string";
  },
  requireAgentTurnEnded(e) {
    if (s.isAgentTurnEnded(e)) return e;
    throw Error("Expected an ended agent turn event.");
  },
  requireAgentTurnFailed(e) {
    if (s.isAgentTurnFailed(e)) return e;
    throw Error("Expected a failed agent turn event.");
  },
  getAgentTurnResult(e) {
    return s.isAgentTurnEnded(e) || s.isAgentTurnFailed(e) ? e : null;
  },
  getWorkflowResults(e) {
    return c(e) && e.kind === "workflow" && Array.isArray(e.results) ? e.results : null;
  },
  getHeadlessAgentResults(e) {
    return c(e) && e.kind === "headless_agent" && Array.isArray(e.results) ? e.results : null;
  }
};
function c(e) {
  return typeof e == "object" && !!e;
}
function l(e) {
  return {
    type: "done",
    value: e
  };
}
function u(e) {
  return {
    type: "fail",
    reason: e
  };
}

// src/constants.ts
var planner = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "high"
};
var plannerJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium"
};

// src/judgments.ts
function latestAssistantTurnText(history) {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && completeMessageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;
  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") {
      precedingUserIndex = index;
      break;
    }
  }
  const turn = history.slice(precedingUserIndex + 1, finalAssistantIndex + 1).filter((message) => message.role === "assistant").map(completeMessageText).filter((text) => text.length > 0).join("\n\n").trim();
  return turn.length > 0 ? turn : null;
}
function completedSingleHeadlessResult(event) {
  const results = s.getHeadlessAgentResults(event);
  if (!results) throw new Error("Workflow resumed with a non-headless judgment event.");
  if (results.length !== 1) {
    throw new Error(`Expected exactly one judgment result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== "completed") {
    const detail = result?.error ? `: ${result.error}` : "";
    throw new Error(`Judgment did not complete${detail}.`);
  }
  return result;
}
function parsePlannerRoute(output) {
  const record = parseExactObject(output, ["outcome"], "planner judgment");
  if (record.outcome !== "ready" && record.outcome !== "failed") {
    throw new Error("planner judgment outcome must be one of: failed, ready.");
  }
  return record.outcome;
}
function parseExactObject(output, expectedKeys, label) {
  const value = JSON.parse(extractJsonObject(output));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== expectedKeys.length || expectedKeys.some((key, index) => keys[index] !== key)) {
    throw new Error(`${label} must contain exactly: ${expectedKeys.join(", ")}.`);
  }
  return record;
}
function completeMessageText(message) {
  return message.parts.filter((part) => part.type === "text" && part.state !== "streaming").map((part) => part.text).join("\n").trim();
}
function extractJsonObject(output) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Judgment output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}

// src/prompts.ts
var PROMPT_FOOTER = "Do not run any tasks in the background, but you are allowed to run tasks and shell commands in the foreground.";
function plannerPrompt(input) {
  return withPromptFooter(`Create the complete implementation plan for the supplied story using all three reviewed engineering artifacts.

Repository: ${input.repositoryPath}
Story: ${input.story}
Explicit plan directory: ${input.planDirectory}
Entry plan path: ${input.entryPlanPath}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program design: ${input.programDesignPath}

Use the explicit plan directory exactly. Treat the files under its artifacts directory as read-only inputs and place index.md and every phase file in the plan directory root. Work unattended, resolve uncertainty through grounded recommendations and recorded assumptions, and finish only when the complete plan is ready for implementation.`);
}
function plannerRoutingPrompt(input) {
  return withPromptFooter(`You are an unattended routing judgment for an implementation-plan writer.

Expected entry plan path: ${input.entryPlanPath}

Writer response:
${input.plannerResponse}

Return exactly one JSON object with exactly this field:
{"outcome":"ready"}

Return "ready" when the writer reports that it created and finished the implementation plan at the expected directory. Return "failed" when it reports incomplete work, a different plan location, an unresolved blocker, intended future work, or a request for input instead of a completed plan.

Every outcome is valid. Return no confidence, commentary, markdown, or extra JSON fields.`);
}
function withPromptFooter(body) {
  return `${body}

${PROMPT_FOOTER}`;
}

// src/index.ts
var defaults = {
  currentStatePath: "scratch/story/design/current-state.md",
  architecturePath: "scratch/story/design/architecture.md",
  programDesignPath: "scratch/story/design/program-design.md",
  planDirectory: "scratch/story/implementation",
  entryPlanPath: "scratch/story/implementation/index.md"
};
var humanInTheLoopInput = {
  kind: "select",
  key: "humanInTheLoop",
  label: "Human in the loop",
  options: [
    { value: "yes", label: "Yes, pause after each phase" },
    { value: "no", label: "No, run through phases" }
  ],
  default: "yes"
};
var autoReviewInput = {
  kind: "select",
  key: "autoReview",
  label: "Automatic engineering guidance review",
  options: [
    { value: "yes", label: "Yes, review every completed phase" },
    { value: "no", label: "No, skip automatic review" }
  ],
  default: "yes"
};
var autoCommitInput = {
  kind: "select",
  key: "autoCommit",
  label: "Automatic commit",
  options: [
    { value: "yes", label: "Yes, create a commit after each phase" },
    { value: "no", label: "No, leave phase changes uncommitted" }
  ],
  default: "yes"
};
var index_default = r({
  command: () => ({
    title: "Implement Story",
    description: "Create an implementation plan from a designed story and implement it phase by phase.",
    inputs: [
      { kind: "text", key: "story", label: "Story or story URL" },
      { kind: "text", key: "currentStatePath", label: "Current-state source path", default: defaults.currentStatePath },
      { kind: "text", key: "architecturePath", label: "Architecture source path", default: defaults.architecturePath },
      { kind: "text", key: "programDesignPath", label: "Program-design source path", default: defaults.programDesignPath },
      { kind: "text", key: "planDirectory", label: "Implementation-plan directory", default: defaults.planDirectory },
      { kind: "text", key: "entryPlanPath", label: "Implementation-plan entry path", default: defaults.entryPlanPath },
      humanInTheLoopInput,
      autoReviewInput,
      autoCommitInput
    ]
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables) => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      artifacts: parsed.artifacts,
      plan: parsed.plan,
      options: parsed.options,
      stage: { kind: "spawn_planner" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Implement story stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "spawn_planner": {
        await ctx.setUiFeedback({ phase: "Creating implementation plan" });
        const spawned = await ctx.spawnAgentSession({
          harness: planner.harness,
          model: planner.model,
          effort: planner.effort,
          modifiers: [{ kind: "skill", name: "create-implementation-plan" }],
          prompt: plannerPrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            planDirectory: state.plan.planDirectory,
            entryPlanPath: state.plan.entryPlanPath,
            currentStatePath: state.artifacts.currentStatePath,
            architecturePath: state.artifacts.architecturePath,
            programDesignPath: state.artifacts.programDesignPath
          })
        });
        const plannerAgent = agentFromSpawn(spawned);
        await ctx.log("info", `Spawned implementation planner in pane ${plannerAgent.paneId}: harness=${planner.harness}, model=${planner.model}, effort=${planner.effort}, agentSessionId=${plannerAgent.agentSessionId}.`);
        return a(withStage(state, { kind: "await_planner", planner: plannerAgent }), o.agentTurn(spawned));
      }
      case "await_planner": {
        if (s.isAgentTurnFailed(incoming)) return failWorkflow(ctx, "Implementation-plan writer failed", `Implementation-plan writer turn failed: ${incoming.reason}`);
        if (!s.isAgentTurnEnded(incoming)) return failWorkflow(ctx, "The implementation-plan writer could not be resumed", "Implementation-plan writer wait resumed with an unexpected event.");
        const history = await ctx.getConversationHistory(state.stage.planner.agentSessionId);
        const plannerResponse = latestAssistantTurnText(history);
        if (!plannerResponse) return failWorkflow(ctx, "No implementation-plan response was found", `Planner session ${state.stage.planner.agentSessionId} has no complete assistant turn to inspect.`);
        const op = await ctx.runHeadlessAgent({
          harness: plannerJudgment.harness,
          model: plannerJudgment.model,
          effort: plannerJudgment.effort,
          prompt: plannerRoutingPrompt({ plannerResponse, entryPlanPath: state.plan.entryPlanPath })
        });
        await ctx.log("info", `Started implementation-plan routing judgment ${op.opId}.`);
        return a(withStage(state, { kind: "await_planner_judgment", planner: state.stage.planner, plannerResponse }), o.headlessAgent(op));
      }
      case "await_planner_judgment": {
        try {
          const result = completedSingleHeadlessResult(incoming);
          const route = parsePlannerRoute(result.output ?? "");
          await ctx.log("info", `Implementation-plan routing outcome=${route}.`);
          if (route === "failed") return failWorkflow(ctx, "The implementation plan was not completed", `Planner session ${state.stage.planner.agentSessionId} did not complete the plan. Latest response:
${state.stage.plannerResponse}`);
          const validationError = planArtifactError(state.repositoryPath, state.plan);
          if (validationError) return failWorkflow(ctx, "The implementation plan is incomplete", validationError);
          return i(withStage(state, { kind: "start_implementation", planner: state.stage.planner }));
        } catch (error) {
          return failWorkflow(ctx, "The implementation-plan response could not be routed", `Implementation-plan routing failed: ${errorText(error)}`);
        }
      }
      case "start_implementation": {
        await ctx.setUiFeedback({ phase: "Preparing phase-wise implementation", message: `Plan ready at ${state.plan.entryPlanPath}.` });
        const runId = await ctx.startWorkflow("implement-phase-wise-plan", state.options, { agentSessionId: state.stage.planner.agentSessionId });
        await ctx.log("info", `Started implement-phase-wise-plan child workflow ${runId} with planner session ${state.stage.planner.agentSessionId}.`);
        return a(withStage(state, { kind: "await_implementation", planner: state.stage.planner, runId }), o.workflow(runId));
      }
      case "await_implementation": {
        const result = readImplementedPlan(incoming, state.stage.runId, state.plan.entryPlanPath);
        if (!result.ok) return failWorkflow(ctx, "Story implementation failed", result.reason);
        await ctx.setUiFeedback({ phase: "Story implemented", message: `Completed ${result.value.completedPhaseCount} phases from ${result.value.entryPlanPath}. Planner remains open in pane ${state.stage.planner.paneId}.` });
        await ctx.log("info", `Story implementation completed from ${result.value.entryPlanPath} with ${result.value.completedPhaseCount}/${result.value.phaseCount} phases; preserving planner pane ${state.stage.planner.paneId}.`);
        return l({
          outcome: "story-implemented",
          story: state.story,
          artifacts: state.artifacts,
          plan: state.plan,
          plannerAgentSessionId: state.stage.planner.agentSessionId,
          plannerPaneId: state.stage.planner.paneId,
          implementation: result.value
        });
      }
      default:
        return assertNever(state.stage);
    }
  }
});
function parseVariables(variables) {
  return {
    story: parseText(variables.story, "story"),
    artifacts: {
      currentStatePath: parsePath(variables.currentStatePath, "currentStatePath", defaults.currentStatePath),
      architecturePath: parsePath(variables.architecturePath, "architecturePath", defaults.architecturePath),
      programDesignPath: parsePath(variables.programDesignPath, "programDesignPath", defaults.programDesignPath)
    },
    plan: {
      planDirectory: parsePath(variables.planDirectory, "planDirectory", defaults.planDirectory),
      entryPlanPath: parsePath(variables.entryPlanPath, "entryPlanPath", defaults.entryPlanPath)
    },
    options: {
      humanInTheLoop: parseYesNo(variables.humanInTheLoop, "humanInTheLoop"),
      autoReview: parseYesNo(variables.autoReview, "autoReview"),
      autoCommit: parseYesNo(variables.autoCommit, "autoCommit")
    }
  };
}
function readImplementedPlan(incoming, runId, expectedEntryPlanPath) {
  const child = readSingleChild(incoming, runId, "implement-phase-wise-plan");
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record) return failure(`implement-phase-wise-plan child workflow ${runId} returned no implementation result.`);
  const entryPlanPath = nonEmptyString(record.entryPlanPath);
  const decisionLogPath = nonEmptyString(record.decisionLogPath);
  const phases = Array.isArray(record.phases) ? record.phases : null;
  const completedPhaseCount = positiveInteger(record.completedPhaseCount);
  if (entryPlanPath !== expectedEntryPlanPath) return failure(`implement-phase-wise-plan child workflow ${runId} returned entry plan path ${String(record.entryPlanPath)} instead of ${expectedEntryPlanPath}.`);
  if (!decisionLogPath) return failure(`implement-phase-wise-plan child workflow ${runId} returned an invalid decision log path.`);
  if (!phases || phases.length < 1) return failure(`implement-phase-wise-plan child workflow ${runId} returned no implemented phases.`);
  if (completedPhaseCount !== phases.length) return failure(`implement-phase-wise-plan child workflow ${runId} completed ${String(record.completedPhaseCount)} of ${phases.length} phases.`);
  return success({ entryPlanPath, decisionLogPath, phaseCount: phases.length, completedPhaseCount });
}
function readSingleChild(incoming, runId, workflowKey) {
  const results = s.getWorkflowResults(incoming);
  if (!results) return failure(`${workflowKey} wait resumed with a non-workflow event.`);
  if (results.length !== 1) return failure(`${workflowKey} expected one child result, received ${results.length}.`);
  const child = results[0];
  if (!child || child.runId !== runId) return failure(`${workflowKey} resumed with an unexpected child run.`);
  if (child.status !== "done") return failure(`${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}`);
  return success(child.result);
}
function planArtifactError(repositoryPath, plan) {
  const entryPath = resolve(repositoryPath, plan.entryPlanPath);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) return `Expected implementation-plan entry file ${plan.entryPlanPath} was not created.`;
  const directoryPath = resolve(repositoryPath, plan.planDirectory);
  const phaseFiles = readdirSync(directoryPath).filter((name) => /^phase-\d{2}-.+\.md$/.test(name));
  if (phaseFiles.length === 0) return `Implementation plan ${plan.planDirectory} contains no phase files.`;
  return null;
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "Implement story failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function agentFromSpawn(input) {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}
function withStage(state, stage) {
  return { ...state, stage };
}
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new Error(`${key} must be non-empty text.`);
}
function parsePath(value, key, fallback) {
  if (value === void 0) return fallback;
  return parseText(value, key);
}
function parseYesNo(value, key) {
  if (value === void 0) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error(`${key} must be yes or no.`);
}
function objectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}
function success(value) {
  return { ok: true, value };
}
function failure(reason) {
  return { ok: false, reason };
}
function errorText(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value === null || value === void 0) return "unknown error";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
function assertNever(value) {
  throw new Error(`Unsupported implement-story stage: ${JSON.stringify(value)}`);
}
export {
  index_default as default
};
