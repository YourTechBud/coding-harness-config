// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.0.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function r(e) {
  return e;
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
var writer = {
  harness: "claude",
  model: "fable",
  effort: "high"
};
var reviewer = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "high"
};
var writerJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium"
};
var reviewerJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium"
};

// src/prompts.ts
var PROMPT_FOOTER = "Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";
var CURRENT_STATE_REVIEW_CONTRACT = `Review the artifact through each of these sections:

- **Contradictions:** Claims that conflict with the story, repository behavior, tests, documentation, another part of the artifact, or stronger evidence. Distinguish a false claim from evidence that is merely incomplete.
- **Important Simplifications:** Places where the artifact makes the current system more complex than the evidence supports, duplicates concepts, includes distracting detail, or can express the same decision-relevant truth more directly. Keep simplification descriptive; do not propose target architecture or program design.
- **Missing Information:** Story outcomes, current flows, boundaries, contracts, state, failure behavior, constraints, uncertainty, or retrievable evidence that downstream architecture work would otherwise have to rediscover.
- **Other Significant Issues:** Unsupported inferences, scope drift into future design, stale or weak evidence, misleading emphasis or organization, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** The artifact is materially false, internally incoherent, or likely to misdirect downstream architecture work. It must be corrected before the artifact can be accepted.
- **Concern:** The issue materially weakens completeness, precision, simplicity, or evidentiary support. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether downstream architecture work can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete repository evidence and a clear correction target. Optional findings may coexist with closure; Blockers and Concerns may not.`;
var REVIEWER_ESCALATION_AND_CLOSURE = `Always include a Human Escalation section. State "No escalation." unless you and the writer have repeatedly disagreed on the same substantive issue and another exchange is unlikely to resolve it. In that case, explicitly state "Escalation required:", summarize both positions, and name the decision a human must make. A first disagreement or a held finding is not an escalation.

When no Blocker or Concern remains, end with the exact line: No re-review needed.`;
function initialWriterPrompt(input) {
  return withPromptFooter(`Analyze the current state of the repository for the supplied story and write the complete artifact at the requested path.

Repository: ${input.repositoryPath}
Story: ${input.story}
Artifact path: ${input.artifactPath}

Work unattended. Use the repository as evidence, make reasonable evidence-backed decisions when details are uncertain, and finish only when the artifact is ready for an independent review.`);
}
function reviewToWriterPrompt(review) {
  return withPromptFooter(`Here is the review of the current-state analysis:

${review}

Evaluate every finding against the story and repository evidence. Update the artifact directly wherever the review improves its correctness, completeness, simplicity, or evidentiary support. Push back with concrete evidence when a finding is incorrect or would make the artifact worse. Finish with the artifact ready for another independent review.`);
}
function retryWriterPrompt() {
  return withPromptFooter(
    `Resume the current-state analysis from the current conversation, worktree, and artifact. Reassess the original request against their current state, including whether any commands or delegated work from the previous turn are still running or have now completed. Preserve completed work, finish the requested writing or revision, verify the artifact, and end only when it is ready for review.`
  );
}
function initialReviewerPrompt(input) {
  return withPromptFooter(`Independently review the current-state analysis from first principles.

Repository: ${input.repositoryPath}
Story: ${input.story}
Artifact path: ${input.artifactPath}

Inspect the repository directly. Give concrete, actionable findings with retrievable evidence. Focus on whether the artifact is trustworthy and sufficient for downstream architecture work.

${CURRENT_STATE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}
function writerToReviewerPrompt(writerResponse) {
  return withPromptFooter(`Here is the writer's response to your review:

${writerResponse}

Re-review the current artifact from first principles. Verify claimed corrections directly, adjudicate pushback on its merits, and inspect the full artifact for remaining or newly introduced issues. Do not preserve a finding when the writer's evidence resolves it, and do not silently drop an unresolved finding.

${CURRENT_STATE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}
function withPromptFooter(body) {
  return `${body}

${PROMPT_FOOTER}`;
}

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
function writerRoutingPrompt(input) {
  return withPromptFooter(`You are an unattended routing judgment for a current-state-analysis writer.

Artifact path: ${input.artifactPath}

Writer response:
${input.writerResponse}

Return exactly one JSON object with exactly this field:
{"outcome":"ready"}

Return "ready" when the writer reports that it completed the requested writing or revision turn and the artifact is ready for review. A response that applies some findings and pushes back on others is ready when that work is complete. Return "failed" when the writer reports that it did not create or finish the artifact, says work remains, only describes intended future work, asks for input instead of completing the artifact, or otherwise does not report a completed artifact turn.

Every outcome is valid on every invocation. Return no confidence, commentary, markdown, or extra JSON fields.`);
}
function reviewerRoutingPrompt(input) {
  return withPromptFooter(`You are an unattended routing judgment for a current-state-analysis reviewer.

Reviewer response:
${input.review}

Return exactly one JSON object with exactly this field:
{"outcome":"revise"}

Apply this precedence:
1. Return "human-decision" when the Human Escalation section explicitly states "Escalation required:" and identifies a decision for the human. An ordinary disagreement, held finding, or "No escalation." is not a human decision.
2. Return "complete" when the reviewer explicitly closes the loop with "No re-review needed." and does not simultaneously report an open Blocker, Concern, or human decision. Optional findings may coexist with completion.
3. Return "revise" for every other response, including any Blocker or Concern, incomplete corrections, held findings, new findings, ambiguous closure language, and requests for another review round.

Every outcome is valid on every invocation. Return no confidence, commentary, markdown, or extra JSON fields.`);
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
function parseWriterRoute(output) {
  return parseOutcome(output, ["failed", "ready"], "writer");
}
function parseReviewerRoute(output) {
  return parseOutcome(
    output,
    ["complete", "revise", "human-decision"],
    "reviewer"
  );
}
function parseOutcome(output, allowed, label) {
  const value = JSON.parse(extractJsonObject(output));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} judgment must be a JSON object.`);
  }
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "outcome") {
    throw new Error(`${label} judgment must contain exactly one field: outcome.`);
  }
  if (typeof record.outcome !== "string" || !allowed.includes(record.outcome)) {
    throw new Error(`${label} judgment outcome must be one of: ${allowed.join(", ")}.`);
  }
  return record.outcome;
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

// src/index.ts
var index_default = r({
  command: () => ({
    title: "Analyze Current State",
    description: "Create and independently review a story-scoped current-state analysis.",
    inputs: [
      {
        kind: "text",
        key: "story",
        label: "Story or story URL",
        placeholder: "https://github.com/owner/repository/issues/123"
      },
      {
        kind: "text",
        key: "artifactPath",
        label: "Markdown artifact path",
        placeholder: "scratch/current-state/issue-123.md"
      }
    ]
  }),
  validate: (_launchCtx, variables) => {
    parseText(variables.story, "story");
    parseText(variables.artifactPath, "artifactPath");
  },
  init: (launchCtx, variables) => ({
    stateVersion: 1,
    repositoryPath: launchCtx.worktreePath,
    story: parseText(variables.story, "story"),
    artifactPath: parseText(variables.artifactPath, "artifactPath"),
    stage: { kind: "spawn_writer" }
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Analyze current state stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "spawn_writer": {
        await ctx.setUiFeedback({ phase: "Analyzing current state" });
        const spawned = await ctx.spawnAgentSession({
          harness: writer.harness,
          model: writer.model,
          effort: writer.effort,
          modifiers: [{ kind: "skill", name: "analyze-current-state" }],
          prompt: initialWriterPrompt(state)
        });
        const writerAgent = agentFromSpawn(spawned);
        await logSpawn(ctx, "writer", writerAgent, writer);
        return a(
          withStage(state, { kind: "await_initial_writer", writer: writerAgent }),
          o.agentTurn(spawned)
        );
      }
      case "await_initial_writer": {
        const ended = await requireEndedTurn(ctx, incoming, "Writer");
        if (!ended.ok) return ended.result;
        const response = await latestTurnOrFail(ctx, state.stage.writer, "writer");
        if (!response.ok) return response.result;
        return startWriterJudgment(ctx, {
          state: withStage(state, {
            kind: "await_initial_writer_judgment",
            writer: state.stage.writer,
            writerResponse: response.text,
            mode: "normal"
          }),
          writerResponse: response.text
        });
      }
      case "await_initial_writer_judgment": {
        if (isRetryInvocation(ctx)) return recoverWriterJudgment(ctx, state, state.stage);
        const route = await readWriterJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        if (route.value === "failed") {
          if (state.stage.mode === "retry_recheck") {
            return continueWriterAfterRetry(ctx, state, state.stage);
          }
          return failIncompleteWriter(ctx, state.stage.writer, state.stage.writerResponse);
        }
        return spawnReviewer(ctx, state, state.stage.writer);
      }
      case "await_review": {
        const ended = await requireEndedTurn(ctx, incoming, "Reviewer");
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!review.ok) return review.result;
        return startReviewerJudgment(ctx, {
          state: withStage(state, {
            kind: "await_reviewer_judgment",
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            review: review.text,
            reviewRound: state.stage.reviewRound
          }),
          review: review.text
        });
      }
      case "await_reviewer_judgment": {
        const route = await readReviewerJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case "complete":
            return finishWorkflow(
              ctx,
              state,
              state.stage.writer,
              state.stage.reviewer,
              state.stage.reviewRound
            );
          case "revise":
            return sendReviewToWriter(ctx, state, {
              writer: state.stage.writer,
              reviewer: state.stage.reviewer,
              review: state.stage.review,
              reviewRound: state.stage.reviewRound
            });
          case "human-decision": {
            await ctx.setUiFeedback({
              kind: "warning",
              phase: "Waiting for your decision",
              message: "The reviewer raised a human escalation. Resolve it with the reviewer, then continue the workflow."
            });
            await ctx.log(
              "warning",
              `Reviewer raised a human escalation in review round ${state.stage.reviewRound}.`
            );
            return a(
              withStage(state, {
                kind: "await_human_decision",
                writer: state.stage.writer,
                reviewer: state.stage.reviewer,
                reviewRound: state.stage.reviewRound
              }),
              o.userContinue()
            );
          }
          default:
            return assertNever(route.value);
        }
      }
      case "await_revision": {
        const ended = await requireEndedTurn(ctx, incoming, "Writer");
        if (!ended.ok) return ended.result;
        const response = await latestTurnOrFail(ctx, state.stage.writer, "writer");
        if (!response.ok) return response.result;
        return startWriterJudgment(ctx, {
          state: withStage(state, {
            kind: "await_revision_judgment",
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            writerResponse: response.text,
            reviewRound: state.stage.reviewRound,
            mode: "normal"
          }),
          writerResponse: response.text
        });
      }
      case "await_revision_judgment": {
        if (isRetryInvocation(ctx)) return recoverWriterJudgment(ctx, state, state.stage);
        const route = await readWriterJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        if (route.value === "failed") {
          if (state.stage.mode === "retry_recheck") {
            return continueWriterAfterRetry(ctx, state, state.stage);
          }
          return failIncompleteWriter(ctx, state.stage.writer, state.stage.writerResponse);
        }
        await ctx.setUiFeedback({ phase: "Re-reviewing current-state analysis" });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.reviewer.agentSessionId,
          prompt: writerToReviewerPrompt(state.stage.writerResponse)
        });
        await ctx.log(
          "info",
          `Sent writer response from review round ${state.stage.reviewRound} to reviewer session ${state.stage.reviewer.agentSessionId}.`
        );
        return a(
          withStage(state, {
            kind: "await_review",
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            reviewRound: state.stage.reviewRound + 1
          }),
          o.agentTurn(sent)
        );
      }
      case "await_human_decision": {
        if (!s.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            "The human decision could not be resumed",
            "The human-decision wait resumed with an unexpected event."
          );
        }
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!review.ok) return review.result;
        await ctx.log(
          "info",
          `User continued review round ${state.stage.reviewRound}; routing the reviewer session's latest complete turn.`
        );
        return startReviewerJudgment(ctx, {
          state: withStage(state, {
            kind: "await_reviewer_judgment",
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            review: review.text,
            reviewRound: state.stage.reviewRound
          }),
          review: review.text
        });
      }
      default:
        return assertNever(state.stage);
    }
  }
});
async function recoverWriterJudgment(ctx, state, stage) {
  const history = await ctx.getConversationHistory(stage.writer.agentSessionId);
  const latestResponse = latestAssistantTurnText(history);
  if (latestResponse && latestResponse !== stage.writerResponse) {
    await ctx.log(
      "info",
      `Retry found a newer complete turn in current-state writer session ${stage.writer.agentSessionId}; routing the latest response.`
    );
    return startWriterJudgment(ctx, {
      state: withStage(state, { ...stage, writerResponse: latestResponse, mode: "retry_recheck" }),
      writerResponse: latestResponse
    });
  }
  return continueWriterAfterRetry(ctx, state, stage);
}
async function continueWriterAfterRetry(ctx, state, stage) {
  await ctx.setUiFeedback({ phase: "Recovering current-state writer" });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: stage.writer.agentSessionId,
    prompt: retryWriterPrompt()
  });
  await ctx.log(
    "info",
    `Sent one retry continuation to current-state writer session ${stage.writer.agentSessionId}.`
  );
  if (stage.kind === "await_initial_writer_judgment") {
    return a(
      withStage(state, { kind: "await_initial_writer", writer: stage.writer }),
      o.agentTurn(sent)
    );
  }
  return a(
    withStage(state, {
      kind: "await_revision",
      writer: stage.writer,
      reviewer: stage.reviewer,
      reviewRound: stage.reviewRound
    }),
    o.agentTurn(sent)
  );
}
async function startWriterJudgment(ctx, input) {
  await ctx.setUiFeedback({ phase: "Checking writer progress" });
  const op = await ctx.runHeadlessAgent({
    harness: writerJudgment.harness,
    model: writerJudgment.model,
    effort: writerJudgment.effort,
    prompt: writerRoutingPrompt({
      writerResponse: input.writerResponse,
      artifactPath: input.state.artifactPath
    })
  });
  await ctx.log("info", `Started writer routing judgment ${op.opId}.`);
  return a(input.state, o.headlessAgent(op));
}
async function startReviewerJudgment(ctx, input) {
  await ctx.setUiFeedback({ phase: "Routing reviewer feedback" });
  const op = await ctx.runHeadlessAgent({
    harness: reviewerJudgment.harness,
    model: reviewerJudgment.model,
    effort: reviewerJudgment.effort,
    prompt: reviewerRoutingPrompt({ review: input.review })
  });
  await ctx.log("info", `Started reviewer routing judgment ${op.opId}.`);
  return a(input.state, o.headlessAgent(op));
}
async function readWriterJudgment(ctx, incoming) {
  return readJudgment(ctx, incoming, "writer", parseWriterRoute);
}
async function readReviewerJudgment(ctx, incoming) {
  return readJudgment(ctx, incoming, "reviewer", parseReviewerRoute);
}
async function readJudgment(ctx, incoming, label, parse) {
  try {
    const result = completedSingleHeadlessResult(incoming);
    const value = parse(result.output ?? "");
    await ctx.log("info", `${label} routing outcome=${value}.`);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `The ${label} response could not be routed`,
        `${label} routing failed: ${message}`
      )
    };
  }
}
async function spawnReviewer(ctx, state, writerAgent) {
  await ctx.setUiFeedback({ phase: "Reviewing current-state analysis" });
  const spawned = await ctx.spawnAgentSession({
    harness: reviewer.harness,
    model: reviewer.model,
    effort: reviewer.effort,
    modifiers: [{ kind: "skill", name: "analyze-current-state" }],
    prompt: initialReviewerPrompt(state)
  });
  const reviewerAgent = agentFromSpawn(spawned);
  await logSpawn(ctx, "reviewer", reviewerAgent, reviewer);
  return a(
    withStage(state, {
      kind: "await_review",
      writer: writerAgent,
      reviewer: reviewerAgent,
      reviewRound: 1
    }),
    o.agentTurn(spawned)
  );
}
async function sendReviewToWriter(ctx, state, input) {
  await ctx.setUiFeedback({ phase: "Revising current-state analysis" });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.writer.agentSessionId,
    prompt: reviewToWriterPrompt(input.review)
  });
  await ctx.log(
    "info",
    `Sent review round ${input.reviewRound} to writer session ${input.writer.agentSessionId}.`
  );
  return a(
    withStage(state, {
      kind: "await_revision",
      writer: input.writer,
      reviewer: input.reviewer,
      reviewRound: input.reviewRound
    }),
    o.agentTurn(sent)
  );
}
async function failIncompleteWriter(ctx, writerAgent, writerResponse) {
  return failWorkflow(
    ctx,
    "The writer did not produce a reviewable artifact",
    `Writer session ${writerAgent.agentSessionId} did not complete its artifact turn. Latest response:
${writerResponse}`
  );
}
async function finishWorkflow(ctx, state, writerAgent, reviewerAgent, reviewCount) {
  await ctx.setUiFeedback({ phase: "Current-state analysis complete" });
  await ctx.closePane(writerAgent.paneId);
  await ctx.closePane(reviewerAgent.paneId);
  await ctx.log("info", `Current-state analysis completed after ${reviewCount} review rounds.`);
  return l({
    outcome: "artifact-reviewed",
    artifactPath: state.artifactPath,
    reviewCount
  });
}
async function requireEndedTurn(ctx, incoming, role) {
  if (s.isAgentTurnEnded(incoming)) return { ok: true };
  if (s.isAgentTurnFailed(incoming)) {
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `${role} turn failed`,
        `${role} turn failed: ${incoming.reason}`
      )
    };
  }
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `${role} turn could not be resumed`,
      `${role} turn wait resumed with an unexpected event.`
    )
  };
}
async function latestTurnOrFail(ctx, agent, role) {
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `No ${role} response was found`,
      `${role} session ${agent.agentSessionId} has no complete assistant turn to inspect.`
    )
  };
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({
    kind: "error",
    phase: "Analyze current state failed",
    message: userMessage
  });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
async function logSpawn(ctx, role, agent, profile) {
  await ctx.log(
    "info",
    `Spawned ${role} in pane ${agent.paneId}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${agent.agentSessionId}.`
  );
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
function isRetryInvocation(ctx) {
  return ctx.invocation?.kind === "retry";
}
export {
  index_default as default
};
