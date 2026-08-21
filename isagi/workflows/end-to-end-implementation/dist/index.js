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
var storyRoot = "scratch/story";
var designPaths = {
  currentStatePath: `${storyRoot}/design/current-state.md`,
  architecturePath: `${storyRoot}/design/architecture.md`,
  programDesignPath: `${storyRoot}/design/program-design.md`
};
var reviewDirectory = `${storyRoot}/walkthrough`;
var reviewPaths = {
  currentStatePath: `${reviewDirectory}/current-state.html`,
  architecturePath: `${reviewDirectory}/architecture.html`,
  programDesignPath: `${reviewDirectory}/program-design.html`
};
var manifestPath = `${reviewDirectory}/.walkthrough/manifest.json`;
var planDirectory = `${storyRoot}/implementation`;
var entryPlanPath = `${planDirectory}/index.md`;
var implementationOptions = {
  humanInTheLoop: "no",
  autoReview: "yes",
  autoCommit: "yes"
};
var index_default = r({
  command: () => ({
    title: "End-to-End Implementation",
    description: "Design, walk through, plan, and implement one story.",
    inputs: [{ kind: "text", key: "story", label: "Story or story URL" }]
  }),
  validate: (_launchCtx, variables) => {
    parseStory(variables.story);
  },
  init: (_launchCtx, variables) => ({
    stateVersion: 1,
    story: parseStory(variables.story),
    stage: { kind: "start_design" }
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `End-to-end implementation stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "start_design": {
        await ctx.setUiFeedback({ phase: "Designing story solution" });
        const runId = await ctx.startWorkflow("design-story", {
          story: state.story,
          ...designPaths
        });
        await ctx.log("info", `Started design-story child workflow ${runId}.`);
        return a(withStage(state, { kind: "await_design", runId }), o.workflow(runId));
      }
      case "await_design": {
        const result = readDesignResult(incoming, state.stage.runId, state.story);
        if (!result.ok) return failWorkflow(ctx, "Story design failed", result.reason);
        return i(withStage(state, { kind: "start_walkthrough", design: result.value }));
      }
      case "start_walkthrough": {
        await ctx.setUiFeedback({ phase: "Starting solution walkthrough" });
        const runId = await ctx.startWorkflow("solution-walkthrough-story", {
          story: state.story,
          ...designPaths,
          reviewDirectory
        });
        await ctx.log("info", `Started solution-walkthrough-story child workflow ${runId}.`);
        return a(withStage(state, { kind: "await_walkthrough", design: state.stage.design, runId }), o.workflow(runId));
      }
      case "await_walkthrough": {
        const result = readWalkthroughResult(incoming, state.stage.runId);
        if (!result.ok) return failWorkflow(ctx, "Solution walkthrough failed", result.reason);
        return i(withStage(state, {
          kind: "start_implementation",
          design: state.stage.design,
          walkthrough: result.value
        }));
      }
      case "start_implementation": {
        await ctx.setUiFeedback({ phase: "Implementing story" });
        const runId = await ctx.startWorkflow("implement-story", {
          story: state.story,
          ...designPaths,
          planDirectory,
          entryPlanPath,
          ...implementationOptions
        });
        await ctx.log("info", `Started implement-story child workflow ${runId}.`);
        return a(withStage(state, {
          kind: "await_implementation",
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          runId
        }), o.workflow(runId));
      }
      case "await_implementation": {
        const result = readImplementationResult(incoming, state.stage.runId, state.story);
        if (!result.ok) return failWorkflow(ctx, "Story implementation failed", result.reason);
        await ctx.setUiFeedback({ phase: "End-to-end implementation complete", message: `Story artifacts are available under ${storyRoot}.` });
        return l({
          outcome: "end-to-end-implementation-completed",
          story: state.story,
          storyRoot,
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          implementation: result.value
        });
      }
      default:
        return assertNever(state.stage);
    }
  }
});
function readDesignResult(incoming, runId, story) {
  const child = readChildResult(incoming, runId, "design-story");
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== "story-designed") return failure(`design-story child workflow ${runId} returned an invalid outcome.`);
  if (record.story !== story) return failure(`design-story child workflow ${runId} returned a different story.`);
  if (!samePaths(record.artifacts, designPaths)) return failure(`design-story child workflow ${runId} returned unexpected artifact paths.`);
  const reviewCounts = objectRecord(record.reviewCounts);
  if (!reviewCounts || !positiveInteger(reviewCounts.currentState) || !positiveInteger(reviewCounts.architecture) || !positiveInteger(reviewCounts.programDesign)) {
    return failure(`design-story child workflow ${runId} returned invalid review counts.`);
  }
  return success({
    outcome: "story-designed",
    story,
    artifacts: designPaths,
    reviewCounts: {
      currentState: reviewCounts.currentState,
      architecture: reviewCounts.architecture,
      programDesign: reviewCounts.programDesign
    }
  });
}
function readWalkthroughResult(incoming, runId) {
  const child = readChildResult(incoming, runId, "solution-walkthrough-story");
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== "story-walkthrough-completed") return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid outcome.`);
  if (record.reviewDirectory !== reviewDirectory) return failure(`solution-walkthrough-story child workflow ${runId} returned an unexpected review directory.`);
  if (record.manifestPath !== manifestPath) return failure(`solution-walkthrough-story child workflow ${runId} returned an unexpected manifest path.`);
  if (!positiveInteger(record.completedTopicCount)) return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid completed topic count.`);
  if (!samePaths(record.artifacts, reviewPaths)) return failure(`solution-walkthrough-story child workflow ${runId} returned unexpected review artifact paths.`);
  return success({
    outcome: "story-walkthrough-completed",
    reviewDirectory,
    manifestPath,
    completedTopicCount: record.completedTopicCount,
    artifacts: reviewPaths
  });
}
function readImplementationResult(incoming, runId, story) {
  const child = readChildResult(incoming, runId, "implement-story");
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== "story-implemented") return failure(`implement-story child workflow ${runId} returned an invalid outcome.`);
  if (record.story !== story) return failure(`implement-story child workflow ${runId} returned a different story.`);
  if (!samePaths(record.artifacts, designPaths)) return failure(`implement-story child workflow ${runId} returned unexpected artifact paths.`);
  const plan = objectRecord(record.plan);
  if (!plan || plan.planDirectory !== planDirectory || plan.entryPlanPath !== entryPlanPath) return failure(`implement-story child workflow ${runId} returned unexpected plan paths.`);
  if (!positiveInteger(record.plannerAgentSessionId) || !positiveInteger(record.plannerPaneId)) return failure(`implement-story child workflow ${runId} returned invalid planner identifiers.`);
  const implementation = objectRecord(record.implementation);
  if (!implementation || implementation.entryPlanPath !== entryPlanPath || !positiveInteger(implementation.completedPhaseCount)) {
    return failure(`implement-story child workflow ${runId} returned an invalid implementation result.`);
  }
  return success(record);
}
function readChildResult(incoming, runId, workflowKey) {
  const results = s.getWorkflowResults(incoming);
  if (!results) return failure(`${workflowKey} wait resumed with a non-workflow event.`);
  if (results.length !== 1) return failure(`${workflowKey} expected one child result, received ${results.length}.`);
  const child = results[0];
  if (!child || child.runId !== runId) return failure(`${workflowKey} resumed with an unexpected child run.`);
  if (child.status !== "done") return failure(`${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}`);
  return success(child.result);
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "End-to-end implementation failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function withStage(state, stage) {
  return { ...state, stage };
}
function parseStory(value) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new Error("story must be non-empty text.");
}
function samePaths(value, expected) {
  const record = objectRecord(value);
  return record !== null && record.currentStatePath === expected.currentStatePath && record.architecturePath === expected.architecturePath && record.programDesignPath === expected.programDesignPath;
}
function objectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
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
  throw new Error(`Unsupported end-to-end implementation stage: ${JSON.stringify(value)}`);
}
export {
  index_default as default
};
