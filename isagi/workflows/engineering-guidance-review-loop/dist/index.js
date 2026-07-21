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
var reviewer = {
  harness: "claude",
  model: "fable",
  effort: "medium"
};
var fixer = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium"
};
var routingJudgment = {
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
function reviewRoutingPrompt(input) {
  return `You are an unattended routing judgment for an Isagi engineering-guidance review loop.

Classify the reviewer's latest complete response into exactly one outgoing workflow edge. Map the response itself, not the workflow stage you expect the reviewer to be in. Agents may skip ahead, repeat work, or surface a decision earlier than expected; every outcome below is valid on every invocation.

Reviewer response:
${input.review}

Return exactly one JSON object with exactly this field:
{"outcome":"continue"}

Apply this precedence:
1. Return "final-fixer" when the reviewer explicitly says no re-review is needed (or clearly closes the review loop) but reports one or more actual Nit findings. The fixer gets one final discretionary turn and the workflow then ends without another review.
2. Return "complete" when the reviewer explicitly says the review loop is complete and no re-review or follow-up round is needed, with no Nit findings to hand off. Accept a clear equivalent of the canonical closure line, but do not infer completion from a lack of findings alone.
3. Return "human-decision" when the reviewer explicitly flags an active disagreement that requires the user to decide before the loop continues. This can happen before or after a fixer response; do not reject it because it appeared earlier than expected.
4. Return "continue" for every other response, including Blockers, Concerns, incomplete fixes, new findings, ordinary feedback, questions, Nits without an explicit closure signal, and ambiguous closure language.

A Nit is never a disagreement. Do not treat an empty Nit section or a passing mention of the severity definition as an actual Nit finding. An Architectural Reflection is not a disagreement by itself. Do not include confidence, commentary, markdown, or extra JSON fields.`;
}
function completedSingleHeadlessResult(event) {
  const results = s.getHeadlessAgentResults(event);
  if (!results) throw new Error("Workflow resumed with a non-headless routing event.");
  if (results.length !== 1) {
    throw new Error(`Expected exactly one routing result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== "completed") {
    const detail = result?.error ? `: ${result.error}` : "";
    throw new Error(`Routing judgment did not complete${detail}.`);
  }
  return result;
}
function parseReviewRoute(output) {
  const value = JSON.parse(extractJsonObject(output));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Routing result must be a JSON object.");
  }
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "outcome") {
    throw new Error("Routing result must contain exactly one field: outcome.");
  }
  if (record.outcome !== "complete" && record.outcome !== "continue" && record.outcome !== "final-fixer" && record.outcome !== "human-decision") {
    throw new Error("Routing outcome must be complete, continue, final-fixer, or human-decision.");
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
    throw new Error("Routing output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}

// src/prompts.ts
function reviewToFixerPrompt(review) {
  return `Heres the feedback from the reviewer:

${review}

How to interpret and act on this review:
- **Blocker**: fix before returning to me.
- **Concern**: fix directly when the resolution is clear. Surface it to me instead when it requires a design-level tradeoff or conflicts with the direction Ive stated.
- **Nit**: terminal. Apply only if trivial and safe; otherwise list them back to me untouched.
- Never silently dismiss a Blocker or Concern \u2014 dismissing either one requires my explicit acknowledgement.
- **Architectural Reflection**, if present, is a proposal, not a finding to fix. Treat it as a decision: if it is in scope and clearly aligned with our plan, you may adopt it as a deliberate "yes, this fits" call \u2014 never a reflex patch. If it is beyond the original scope, structural, or in tension with the plan, stop and bring me in with two paths: re-architect now, or ship the current fixes and capture it as a follow-up. You estimate nothing here \u2014 the reviewer estimated the blast radius; I own the plan and intent judgment.
- Evaluate every finding on its merits before acting. Anything that reads as overbearing, over-engineered, or beyond our actual scope and use case: do not implement it \u2014 flag it to me with your reasoning instead.
- Don't run background tasks or shell commands.`;
}
function fixerToReviewerPrompt(fixerResponse) {
  return `Heres the implementers response to your review:

${fixerResponse}

Now run a re-review round:
1. **Verify the fixes.** For every finding the implementer claims to have addressed, read the current code and confirm the fix is real and complete. Do not trust the summary.
2. **Adjudicate the pushbacks.** Where the implementer declined or deferred a finding, weigh the reasoning. Withdraw the finding if the reasoning holds, or hold it if it doesnt. Never silently drop a Blocker or Concern \u2014 anything you still hold after pushback is a decision for me, not for either of you. So flag such disagreements immediately, with your justification and what it costs if unfixed.
3. **Review again.** Do a full pass over the current change set at the same standard as your original review. The fixes are new code; anything you missed earlier is fair game. Zero new findings is a valid outcome \u2014 do not pad.

Report in your usual output format, adding a fix-verification result per prior finding (verified / incomplete / not done) and your adjudication per pushback (withdrawn / held \u2014 held items listed for my decision).

You have final authority on when this loop ends. If all Blockers and Concerns are verified fixed or withdrawn \u2014 none open, none held \u2014 and nothing new beyond Nits emerged, end your response with the exact line **No re-review needed.** and state plainly that the review loop is complete. Never use that phrase in any other situation, so it stays a reliable signal that the loop is closed. Otherwise, end with exactly what must happen before the next round.`;
}

// src/index.ts
var index_default = r({
  command: () => ({
    title: "Engineering Guidance Review Loop",
    description: "Route a code review between a reviewer and fixer until the reviewer closes it.",
    inputs: [
      {
        kind: "text",
        key: "context",
        label: "Review scope, goal, and context",
        placeholder: "Review the working tree changes relative to HEAD against\u2026"
      }
    ]
  }),
  validate: (_launchCtx, variables) => {
    parseContext(variables.context);
  },
  init: (_launchCtx, variables) => ({
    stateVersion: 1,
    context: parseContext(variables.context),
    stage: { kind: "spawn_reviewer" }
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Engineering guidance review loop stage=${state.stage.kind}.`);
    switch (state.stage.kind) {
      case "spawn_reviewer": {
        await ctx.setUiFeedback({ phase: "Starting reviewer" });
        const spawned = await ctx.spawnAgentSession({
          harness: reviewer.harness,
          model: reviewer.model,
          effort: reviewer.effort,
          modifiers: [{ kind: "command", name: "perform-engineering-guidance-review" }],
          prompt: state.context
        });
        const reviewerAgent = agentFromSpawn(spawned);
        await ctx.log(
          "info",
          `Spawned reviewer in pane ${reviewerAgent.paneId}: harness=${reviewer.harness}, model=${reviewer.model}, effort=${reviewer.effort}, agentSessionId=${reviewerAgent.agentSessionId}.`
        );
        return a(
          withStage(state, { kind: "await_initial_review", reviewer: reviewerAgent }),
          o.agentTurn(spawned)
        );
      }
      case "await_initial_review": {
        const ended = await requireEndedTurn(ctx, incoming, "Reviewer");
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!review.ok) return review.result;
        return startRoutingJudgment(ctx, {
          state: withStage(state, {
            kind: "await_initial_review_routing",
            reviewer: state.stage.reviewer,
            review: review.text
          }),
          review: review.text
        });
      }
      case "await_initial_review_routing": {
        const route = await readRoutingJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case "complete":
            return finishReviewLoop(ctx, state.stage.reviewer, void 0, 1);
          case "continue":
          case "final-fixer":
            return spawnFixerForReview(ctx, state, {
              reviewer: state.stage.reviewer,
              review: state.stage.review,
              reviewRound: 1,
              afterFixer: route.value === "final-fixer" ? "complete" : "rereview"
            });
          case "human-decision": {
            await ctx.setUiFeedback({
              kind: "warning",
              phase: "Waiting for your decision",
              message: "The reviewer flagged a disagreement. Resolve it, then continue the workflow."
            });
            await ctx.log(
              "warning",
              "Reviewer flagged a disagreement before the first fixer turn; waiting for user resolution."
            );
            return a(
              withStage(state, {
                kind: "await_initial_disagreement_resolution",
                reviewer: state.stage.reviewer
              }),
              o.userContinue()
            );
          }
          default:
            return assertNever(route.value);
        }
      }
      case "await_initial_disagreement_resolution": {
        if (!s.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            "The review decision could not be resumed",
            "The initial disagreement pause resumed with an unexpected event."
          );
        }
        const latestReview = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!latestReview.ok) return latestReview.result;
        await ctx.log(
          "info",
          "User continued after the initial disagreement; sending the reviewer session's latest complete turn to a new fixer."
        );
        return spawnFixerForReview(ctx, state, {
          reviewer: state.stage.reviewer,
          review: latestReview.text,
          reviewRound: 1,
          afterFixer: "rereview"
        });
      }
      case "await_fixer_turn": {
        const ended = await requireEndedTurn(ctx, incoming, "Fixer");
        if (!ended.ok) return ended.result;
        if (state.stage.afterFixer === "complete") {
          return finishReviewLoop(
            ctx,
            state.stage.reviewer,
            state.stage.fixer,
            state.stage.reviewRound
          );
        }
        const fixerResponse = await latestTurnOrFail(ctx, state.stage.fixer, "fixer");
        if (!fixerResponse.ok) return fixerResponse.result;
        await ctx.setUiFeedback({ phase: "Re-reviewing fixes" });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.reviewer.agentSessionId,
          prompt: fixerToReviewerPrompt(fixerResponse.text)
        });
        await ctx.log(
          "info",
          `Sent fixer response from review round ${state.stage.reviewRound} to reviewer session ${state.stage.reviewer.agentSessionId}.`
        );
        return a(
          withStage(state, {
            kind: "await_rereview",
            reviewer: state.stage.reviewer,
            fixer: state.stage.fixer,
            reviewRound: state.stage.reviewRound + 1
          }),
          o.agentTurn(sent)
        );
      }
      case "await_rereview": {
        const ended = await requireEndedTurn(ctx, incoming, "Reviewer");
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!review.ok) return review.result;
        return startRoutingJudgment(ctx, {
          state: withStage(state, {
            kind: "await_rereview_routing",
            reviewer: state.stage.reviewer,
            fixer: state.stage.fixer,
            review: review.text,
            reviewRound: state.stage.reviewRound
          }),
          review: review.text
        });
      }
      case "await_rereview_routing": {
        const route = await readRoutingJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case "complete":
            return finishReviewLoop(
              ctx,
              state.stage.reviewer,
              state.stage.fixer,
              state.stage.reviewRound
            );
          case "continue":
          case "final-fixer":
            return sendReviewToFixer(ctx, state, {
              reviewer: state.stage.reviewer,
              fixer: state.stage.fixer,
              review: state.stage.review,
              reviewRound: state.stage.reviewRound,
              afterFixer: route.value === "final-fixer" ? "complete" : "rereview"
            });
          case "human-decision": {
            await ctx.setUiFeedback({
              kind: "warning",
              phase: "Waiting for your decision",
              message: "The reviewer still holds a disagreement. Resolve it, then continue the workflow."
            });
            await ctx.log(
              "warning",
              `Reviewer held a disagreement in review round ${state.stage.reviewRound}; waiting for user resolution.`
            );
            return a(
              withStage(state, {
                kind: "await_disagreement_resolution",
                reviewer: state.stage.reviewer,
                fixer: state.stage.fixer,
                reviewRound: state.stage.reviewRound
              }),
              o.userContinue()
            );
          }
          default:
            return assertNever(route.value);
        }
      }
      case "await_disagreement_resolution": {
        if (!s.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            "The review decision could not be resumed",
            "The disagreement pause resumed with an unexpected event."
          );
        }
        const latestReview = await latestTurnOrFail(ctx, state.stage.reviewer, "reviewer");
        if (!latestReview.ok) return latestReview.result;
        await ctx.log(
          "info",
          `User continued review round ${state.stage.reviewRound}; sending the reviewer session's latest complete turn to the fixer.`
        );
        return sendReviewToFixer(ctx, state, {
          reviewer: state.stage.reviewer,
          fixer: state.stage.fixer,
          review: latestReview.text,
          reviewRound: state.stage.reviewRound,
          afterFixer: "rereview"
        });
      }
      default:
        return assertNever(state.stage);
    }
  }
});
async function startRoutingJudgment(ctx, input) {
  await ctx.setUiFeedback({ phase: "Routing reviewer feedback" });
  const op = await ctx.runHeadlessAgent({
    harness: routingJudgment.harness,
    model: routingJudgment.model,
    effort: routingJudgment.effort,
    prompt: reviewRoutingPrompt({ review: input.review })
  });
  await ctx.log("info", `Started review routing judgment ${op.opId}.`);
  return a(input.state, o.headlessAgent(op));
}
async function readRoutingJudgment(ctx, incoming) {
  try {
    const result = completedSingleHeadlessResult(incoming);
    const value = parseReviewRoute(result.output ?? "");
    await ctx.log("info", `Review routing outcome=${value}.`);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        "The reviewer response could not be routed",
        `Review routing failed: ${message}`
      )
    };
  }
}
async function spawnFixerForReview(ctx, state, input) {
  await ctx.setUiFeedback({ phase: "Fixing review findings" });
  const spawned = await ctx.spawnAgentSession({
    harness: fixer.harness,
    model: fixer.model,
    effort: fixer.effort,
    prompt: reviewToFixerPrompt(input.review)
  });
  const fixerAgent = agentFromSpawn(spawned);
  await ctx.log(
    "info",
    `Spawned fixer in pane ${fixerAgent.paneId}: harness=${fixer.harness}, model=${fixer.model}, effort=${fixer.effort}, agentSessionId=${fixerAgent.agentSessionId}.`
  );
  return a(
    withStage(state, {
      kind: "await_fixer_turn",
      reviewer: input.reviewer,
      fixer: fixerAgent,
      reviewRound: input.reviewRound,
      afterFixer: input.afterFixer
    }),
    o.agentTurn(spawned)
  );
}
async function sendReviewToFixer(ctx, state, input) {
  await ctx.setUiFeedback({ phase: "Fixing review findings" });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.fixer.agentSessionId,
    prompt: reviewToFixerPrompt(input.review)
  });
  await ctx.log(
    "info",
    `Sent review round ${input.reviewRound} to fixer session ${input.fixer.agentSessionId}.`
  );
  return a(
    withStage(state, {
      kind: "await_fixer_turn",
      reviewer: input.reviewer,
      fixer: input.fixer,
      reviewRound: input.reviewRound,
      afterFixer: input.afterFixer
    }),
    o.agentTurn(sent)
  );
}
async function finishReviewLoop(ctx, reviewerAgent, fixerAgent, reviewCount) {
  await ctx.setUiFeedback({ phase: "Review loop complete" });
  if (fixerAgent) await ctx.closePane(fixerAgent.paneId);
  await ctx.closePane(reviewerAgent.paneId);
  await ctx.log(
    "info",
    `Engineering guidance review loop completed after ${reviewCount} review rounds.`
  );
  return l({ outcome: "workflow-executed-successfully", reviewCount });
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
  await ctx.setUiFeedback({ kind: "error", phase: "Review loop failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function agentFromSpawn(input) {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}
function withStage(state, stage) {
  return { ...state, stage };
}
function parseContext(value) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("context must be non-empty free-form text.");
}
function assertNever(value) {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
export {
  index_default as default
};
