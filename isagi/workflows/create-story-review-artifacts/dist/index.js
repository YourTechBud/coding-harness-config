// src/index.ts
import { existsSync, statSync } from "node:fs";
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
var reviewer = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};

// src/prompts.ts
var PROMPT_FOOTER = "Work unattended and finish the requested artifact in this turn. Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";
function currentStatePrompt(input) {
  return withPromptFooter(`Create the current-state review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Restore the reader's story-relevant understanding of how the code works today and how the relevant code is laid out.
Depth: Concise orientation. Make the overview useful for a quick memory refresh while allowing deeper inspection where it materially helps comprehension.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a \u201CWhat's next?\u201D section with an HTML link whose href is exactly "./architecture.html" and whose destination is ${input.architectureOutputPath}. That destination will be created by a later workflow turn; add the link now and do not create the destination in this turn.`);
}
function architecturePrompt(input) {
  return withPromptFooter(`Create the architecture review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Explain the planned change from a 10,000-foot view, including the important boundaries, interactions, and consequential engineering decisions.
Depth: Moderate. Give enough context to judge the direction without turning the artifact into an implementation-level specification.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a \u201CWhat's next?\u201D section with an HTML link whose href is exactly "./program-design.html" and whose destination is ${input.programDesignOutputPath}. That destination will be created by a later workflow turn; add the link now and do not create the destination in this turn.`);
}
function programDesignPrompt(input) {
  return withPromptFooter(`Create the program-design review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Make the proposed implementation shape reviewable, with emphasis on exact contracts, component interactions, state, failure behavior, and other mechanics where human feedback has the greatest impact.
Depth: Detailed, while keeping the first layer fast to scan.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a \u201CWhat's next?\u201D section that tells the reader to return to the active Plan Story workflow, update the planning sources if desired, and press Continue when the design is approved. The implementation plan is intentionally created only after that approval.`);
}
function withPromptFooter(body) {
  return `${body}

${PROMPT_FOOTER}`;
}

// src/index.ts
var index_default = r({
  command: () => ({
    title: "Create Story Review Artifacts",
    description: "Create three linked HTML artifacts for reviewing a planned story.",
    inputs: [
      { kind: "text", key: "story", label: "Story or story URL" },
      { kind: "text", key: "currentStatePath", label: "Current-state source path" },
      { kind: "text", key: "architecturePath", label: "Architecture source path" },
      { kind: "text", key: "programDesignPath", label: "Program-design source path" },
      { kind: "text", key: "reviewDirectory", label: "Review output directory" }
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
      sources: parsed.sources,
      reviewDirectory: parsed.reviewDirectory,
      artifacts: reviewArtifacts(parsed.reviewDirectory),
      stage: { kind: "spawn_current_state" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Create story review artifacts stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "spawn_current_state": {
        await ctx.setUiFeedback({ phase: "Creating current-state review" });
        const spawned = await ctx.spawnAgentSession({
          harness: reviewer.harness,
          model: reviewer.model,
          effort: reviewer.effort,
          modifiers: [{ kind: "skill", name: "show-me" }],
          prompt: currentStatePrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.currentStatePath,
            outputPath: state.artifacts.currentStatePath,
            architectureOutputPath: state.artifacts.architecturePath
          })
        });
        const agent = agentFromSpawn(spawned);
        await ctx.log(
          "info",
          `Spawned story review agent in pane ${agent.paneId}: harness=${reviewer.harness}, model=${reviewer.model}, effort=${reviewer.effort}, agentSessionId=${agent.agentSessionId}.`
        );
        return a(
          withStage(state, { kind: "await_current_state", agent }),
          o.agentTurn(spawned)
        );
      }
      case "await_current_state": {
        const turnError = agentTurnError(incoming, "Current-state review");
        if (turnError) return failWorkflow(ctx, "Current-state review failed", turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.currentStatePath
        );
        if (fileError) return failWorkflow(ctx, "Current-state review is missing", fileError);
        return i(
          withStage(state, { kind: "send_architecture", agent: state.stage.agent })
        );
      }
      case "send_architecture": {
        await ctx.setUiFeedback({ phase: "Creating architecture review" });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.agent.agentSessionId,
          modifiers: [{ kind: "skill", name: "show-me" }],
          prompt: architecturePrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.architecturePath,
            outputPath: state.artifacts.architecturePath,
            programDesignOutputPath: state.artifacts.programDesignPath
          })
        });
        return a(
          withStage(state, { kind: "await_architecture", agent: state.stage.agent }),
          o.agentTurn(sent)
        );
      }
      case "await_architecture": {
        const turnError = agentTurnError(incoming, "Architecture review");
        if (turnError) return failWorkflow(ctx, "Architecture review failed", turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.architecturePath
        );
        if (fileError) return failWorkflow(ctx, "Architecture review is missing", fileError);
        return i(
          withStage(state, { kind: "send_program_design", agent: state.stage.agent })
        );
      }
      case "send_program_design": {
        await ctx.setUiFeedback({ phase: "Creating program-design review" });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.agent.agentSessionId,
          modifiers: [{ kind: "skill", name: "show-me" }],
          prompt: programDesignPrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            sourcePath: state.sources.programDesignPath,
            outputPath: state.artifacts.programDesignPath
          })
        });
        return a(
          withStage(state, { kind: "await_program_design", agent: state.stage.agent }),
          o.agentTurn(sent)
        );
      }
      case "await_program_design": {
        const turnError = agentTurnError(incoming, "Program-design review");
        if (turnError) return failWorkflow(ctx, "Program-design review failed", turnError);
        const fileError = artifactFileError(
          state.repositoryPath,
          state.artifacts.programDesignPath
        );
        if (fileError) return failWorkflow(ctx, "Program-design review is missing", fileError);
        await ctx.closePane(state.stage.agent.paneId);
        await ctx.setUiFeedback({
          phase: "Story review artifacts ready",
          message: `Start with ${state.artifacts.currentStatePath}.`
        });
        await ctx.log(
          "info",
          `Created story review artifacts in ${state.reviewDirectory} and closed pane ${state.stage.agent.paneId}.`
        );
        return l({
          outcome: "story-review-artifacts-created",
          reviewDirectory: state.reviewDirectory,
          artifacts: state.artifacts
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
    sources: {
      currentStatePath: parseText(variables.currentStatePath, "currentStatePath"),
      architecturePath: parseText(variables.architecturePath, "architecturePath"),
      programDesignPath: parseText(variables.programDesignPath, "programDesignPath")
    },
    reviewDirectory: parseText(variables.reviewDirectory, "reviewDirectory")
  };
}
function reviewArtifacts(reviewDirectory) {
  return {
    currentStatePath: `${reviewDirectory}/current-state.html`,
    architecturePath: `${reviewDirectory}/architecture.html`,
    programDesignPath: `${reviewDirectory}/program-design.html`
  };
}
function agentTurnError(incoming, label) {
  if (s.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed: ${incoming.reason}`;
  }
  if (!s.isAgentTurnEnded(incoming)) {
    return `${label} wait resumed with an unexpected event.`;
  }
  return null;
}
function artifactFileError(repositoryPath, artifactPath) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return `Expected review artifact ${artifactPath} was not created.`;
  }
  return null;
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({
    kind: "error",
    phase: "Story review artifact creation failed",
    message: userMessage
  });
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
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
function assertNever(value) {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
export {
  index_default as default
};
