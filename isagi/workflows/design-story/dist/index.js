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

// src/index.ts
var defaults = {
  currentStatePath: "scratch/story/design/current-state.md",
  architecturePath: "scratch/story/design/architecture.md",
  programDesignPath: "scratch/story/design/program-design.md"
};
var index_default = r({
  command: () => ({
    title: "Design Story",
    description: "Analyze the current state and create the architecture and program design for a story.",
    inputs: [
      { kind: "text", key: "story", label: "Story or story URL" },
      { kind: "text", key: "currentStatePath", label: "Current-state output path", default: defaults.currentStatePath },
      { kind: "text", key: "architecturePath", label: "Architecture output path", default: defaults.architecturePath },
      { kind: "text", key: "programDesignPath", label: "Program-design output path", default: defaults.programDesignPath }
    ]
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (_launchCtx, variables) => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      story: parsed.story,
      artifacts: parsed.artifacts,
      stage: { kind: "start_current_state" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Design story stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "start_current_state": {
        await ctx.setUiFeedback({ phase: "Analyzing current state" });
        const runId = await ctx.startWorkflow("analyze-current-state", {
          story: state.story,
          artifactPath: state.artifacts.currentStatePath
        });
        await ctx.log("info", `Started analyze-current-state child workflow ${runId}.`);
        return a(withStage(state, { kind: "await_current_state", runId }), o.workflow(runId));
      }
      case "await_current_state": {
        const result = readArtifactResult(incoming, state.stage.runId, "analyze-current-state", state.artifacts.currentStatePath);
        if (!result.ok) return failWorkflow(ctx, "Current-state analysis failed", result.reason);
        return i(withStage(state, { kind: "start_architecture", reviewCounts: { currentState: result.reviewCount } }));
      }
      case "start_architecture": {
        await ctx.setUiFeedback({ phase: "Designing architecture" });
        const runId = await ctx.startWorkflow("design-architecture", {
          story: state.story,
          currentStatePath: state.artifacts.currentStatePath,
          artifactPath: state.artifacts.architecturePath
        });
        await ctx.log("info", `Started design-architecture child workflow ${runId}.`);
        return a(withStage(state, { kind: "await_architecture", reviewCounts: state.stage.reviewCounts, runId }), o.workflow(runId));
      }
      case "await_architecture": {
        const result = readArtifactResult(incoming, state.stage.runId, "design-architecture", state.artifacts.architecturePath);
        if (!result.ok) return failWorkflow(ctx, "Architecture design failed", result.reason);
        return i(withStage(state, {
          kind: "start_program_design",
          reviewCounts: { ...state.stage.reviewCounts, architecture: result.reviewCount }
        }));
      }
      case "start_program_design": {
        await ctx.setUiFeedback({ phase: "Designing program" });
        const runId = await ctx.startWorkflow("design-program", {
          story: state.story,
          currentStatePath: state.artifacts.currentStatePath,
          architecturePath: state.artifacts.architecturePath,
          artifactPath: state.artifacts.programDesignPath
        });
        await ctx.log("info", `Started design-program child workflow ${runId}.`);
        return a(withStage(state, { kind: "await_program_design", reviewCounts: state.stage.reviewCounts, runId }), o.workflow(runId));
      }
      case "await_program_design": {
        const result = readArtifactResult(incoming, state.stage.runId, "design-program", state.artifacts.programDesignPath);
        if (!result.ok) return failWorkflow(ctx, "Program design failed", result.reason);
        const reviewCounts = { ...state.stage.reviewCounts, programDesign: result.reviewCount };
        await ctx.setUiFeedback({ phase: "Story design complete", message: `Created the story design at ${state.artifacts.currentStatePath}, ${state.artifacts.architecturePath}, and ${state.artifacts.programDesignPath}.` });
        return l({ outcome: "story-designed", story: state.story, artifacts: state.artifacts, reviewCounts });
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
    }
  };
}
function readArtifactResult(incoming, runId, workflowKey, expectedPath) {
  const results = s.getWorkflowResults(incoming);
  if (!results) return { ok: false, reason: `${workflowKey} wait resumed with a non-workflow event.` };
  if (results.length !== 1) return { ok: false, reason: `${workflowKey} expected one child result, received ${results.length}.` };
  const child = results[0];
  if (!child || child.runId !== runId) return { ok: false, reason: `${workflowKey} resumed with an unexpected child run.` };
  if (child.status !== "done") return { ok: false, reason: `${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}` };
  const record = objectRecord(child.result);
  if (!record) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned no artifact result.` };
  if (record.outcome !== "artifact-reviewed") return { ok: false, reason: `${workflowKey} child workflow ${runId} returned outcome ${String(record.outcome)}.` };
  if (record.artifactPath !== expectedPath) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned artifact path ${String(record.artifactPath)} instead of ${expectedPath}.` };
  if (!Number.isInteger(record.reviewCount) || record.reviewCount < 1) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned an invalid review count.` };
  return { ok: true, reviewCount: record.reviewCount };
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "Design story failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
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
function objectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
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
  throw new Error(`Unsupported design-story stage: ${JSON.stringify(value)}`);
}
export {
  index_default as default
};
