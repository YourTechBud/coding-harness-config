// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.1.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function i(e) {
  return {
    isagiContract: 5,
    isagiKind: e
  };
}
function s(e) {
  return {
    ...i("state-field"),
    reduce: e.reduce
  };
}
var c = {
  replace() {
    return s({ reduce: (e, t) => t });
  },
  add() {
    return s({ reduce: (e, t) => e + t });
  },
  append() {
    return s({ reduce: (e, t) => [...e, ...Array.isArray(t) ? t : [t]] });
  },
  union() {
    return s({ reduce: (e, t) => {
      let n = Array.isArray(t) ? t : [t], r = new Set(e), i3 = [...e];
      for (let e2 of n) r.has(e2) || (r.add(e2), i3.push(e2));
      return i3;
    } });
  },
  collection(e) {
    return s({ reduce: (t, n) => {
      switch (n.op) {
        case "clear":
          return [];
        case "remove": {
          let r = new Set(n.ids);
          return t.filter((t2) => !r.has(e(t2)));
        }
        case "add": {
          let r = [...t];
          for (let t2 of n.values) {
            let n2 = e(t2), i3 = r.findIndex((t3) => e(t3) === n2);
            i3 === -1 ? r.push(t2) : r[i3] = t2;
          }
          return r;
        }
      }
    } });
  },
  optional() {
    return s({ reduce: (e, t) => "clear" in t ? null : t.set });
  },
  custom(e) {
    return s({ reduce: e });
  }
};
function l(e, t) {
  return {
    ...i("operation-node"),
    title: t?.title,
    description: t?.description,
    label: t?.label,
    run: e
  };
}
function u(e) {
  return {
    ...i("subgraph-node"),
    title: e.title,
    description: e.description,
    label: e.label,
    graph: e.graph,
    parameters: e.parameters,
    onResult: e.onResult
  };
}
function f(e) {
  return {
    ...i("edge"),
    from: e.from,
    to: e.to,
    choose: e.choose,
    title: e.title
  };
}
function p(e) {
  return {
    ...i("outcome"),
    kind: e.kind,
    reason: e.reason,
    title: e.title,
    output: e.output
  };
}
function m(e) {
  return {
    ...i("graph"),
    ...e
  };
}
function h(e) {
  return {
    ...i("workflow"),
    ...e
  };
}
function g(e) {
  return e && "update" in e ? {
    ...i("operation-result"),
    type: "complete",
    update: e.update
  } : {
    ...i("operation-result"),
    type: "complete"
  };
}
function _(e) {
  return "update" in e ? {
    ...i("operation-result"),
    type: "suspend",
    update: e.update,
    wait: e.wait
  } : {
    ...i("operation-result"),
    type: "suspend",
    wait: e.wait
  };
}
var y = {
  agentTurn(e) {
    return {
      kind: "agent_turn",
      target: e
    };
  },
  userContinue(e) {
    return e === void 0 ? { kind: "user_continue" } : {
      kind: "user_continue",
      label: e
    };
  },
  userInput(e) {
    return {
      kind: "user_input",
      questions: e
    };
  },
  headlessAgent(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Headless agent wait requires at least one operation.");
    return {
      kind: "headless_agent",
      operations: t
    };
  }
};

// ../../workflow-libraries/common-graphs/node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.1.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function i2(e) {
  return {
    isagiContract: 5,
    isagiKind: e
  };
}
function s2(e) {
  return {
    ...i2("state-field"),
    reduce: e.reduce
  };
}
var c2 = {
  replace() {
    return s2({ reduce: (e, t) => t });
  },
  add() {
    return s2({ reduce: (e, t) => e + t });
  },
  append() {
    return s2({ reduce: (e, t) => [...e, ...Array.isArray(t) ? t : [t]] });
  },
  union() {
    return s2({ reduce: (e, t) => {
      let n = Array.isArray(t) ? t : [t], r = new Set(e), i3 = [...e];
      for (let e2 of n) r.has(e2) || (r.add(e2), i3.push(e2));
      return i3;
    } });
  },
  collection(e) {
    return s2({ reduce: (t, n) => {
      switch (n.op) {
        case "clear":
          return [];
        case "remove": {
          let r = new Set(n.ids);
          return t.filter((t2) => !r.has(e(t2)));
        }
        case "add": {
          let r = [...t];
          for (let t2 of n.values) {
            let n2 = e(t2), i3 = r.findIndex((t3) => e(t3) === n2);
            i3 === -1 ? r.push(t2) : r[i3] = t2;
          }
          return r;
        }
      }
    } });
  },
  optional() {
    return s2({ reduce: (e, t) => "clear" in t ? null : t.set });
  },
  custom(e) {
    return s2({ reduce: e });
  }
};
function l2(e, t) {
  return {
    ...i2("operation-node"),
    title: t?.title,
    description: t?.description,
    label: t?.label,
    run: e
  };
}
function u2(e) {
  return {
    ...i2("subgraph-node"),
    title: e.title,
    description: e.description,
    label: e.label,
    graph: e.graph,
    parameters: e.parameters,
    onResult: e.onResult
  };
}
function f2(e) {
  return {
    ...i2("edge"),
    from: e.from,
    to: e.to,
    choose: e.choose,
    title: e.title
  };
}
function p2(e) {
  return {
    ...i2("outcome"),
    kind: e.kind,
    reason: e.reason,
    title: e.title,
    output: e.output
  };
}
function m2(e) {
  return {
    ...i2("graph"),
    ...e
  };
}
function _2(e) {
  return "update" in e ? {
    ...i2("operation-result"),
    type: "suspend",
    update: e.update,
    wait: e.wait
  } : {
    ...i2("operation-result"),
    type: "suspend",
    wait: e.wait
  };
}
var y2 = {
  agentTurn(e) {
    return {
      kind: "agent_turn",
      target: e
    };
  },
  userContinue(e) {
    return e === void 0 ? { kind: "user_continue" } : {
      kind: "user_continue",
      label: e
    };
  },
  userInput(e) {
    return {
      kind: "user_input",
      questions: e
    };
  },
  headlessAgent(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Headless agent wait requires at least one operation.");
    return {
      kind: "headless_agent",
      operations: t
    };
  }
};
var b = {
  isAgentTurn(e) {
    return e.kind === "agent_turn";
  },
  isHeadless(e) {
    return e.kind === "headless_agent";
  },
  requireHeadless(e, t) {
    if (e.kind !== "headless_agent") throw Error(`Expected a headless agent event; received "${e.kind}".`);
    let n = e.results.find((e2) => e2.operationId === t);
    if (!n) throw Error(`The headless agent event carries no result for operation "${t}".`);
    return n;
  },
  isSubgraph(e) {
    return e.kind === "subgraph";
  }
};

// ../../workflow-libraries/common-graphs/src/agent-turn.ts
var AgentTurnGraph = m2({
  key: "AgentTurn",
  title: "Agent turn",
  label: (parameters) => parameters.label,
  init: (_destination, request) => ({ request, agent: null, turn: null, resubmits: 0, stalled: null, interruption: null }),
  state: {
    request: c2.replace(),
    agent: c2.replace(),
    turn: c2.replace(),
    resubmits: c2.replace(),
    stalled: c2.replace(),
    interruption: c2.replace()
  },
  entry: "send",
  nodes: {
    send: l2(async (ctx, { request }) => {
      if (request.feedback) await ctx.setUiFeedback(request.feedback);
      if (request.session.kind === "spawn") {
        const { kind: _kind, ...profile } = request.session;
        const spawned = await ctx.spawnAgentSession({ ...profile, prompt: request.prompt, modifiers: request.modifiers });
        return _2({
          update: { agent: { agentSessionId: spawned.agentSessionId, paneId: spawned.paneId }, turn: { agentSessionId: spawned.agentSessionId, sentAt: spawned.sentAt } },
          wait: y2.agentTurn(spawned)
        });
      }
      const { agentSessionId, paneId } = request.session;
      const sent = await ctx.sendAgentPrompt({ agentSessionId, prompt: request.prompt, modifiers: request.modifiers });
      return _2({ update: { agent: { agentSessionId, paneId }, turn: sent }, wait: y2.agentTurn(sent) });
    }, { title: "Send the prompt", label: (state) => state.request.label }),
    resubmit: l2(async (ctx, state) => {
      const { label, prompt, modifiers } = state.request;
      const agent = must(state.agent, "agent");
      const role = label.toLowerCase();
      await ctx.setUiFeedback({ kind: "warning", phase: `Retrying ${role}`, message: `The ${role} harness turn failed. Resubmitting its previous message.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: agent.agentSessionId, prompt, modifiers });
      await ctx.log("warning", `Resubmitted the previous message after harness_error ${state.resubmits + 1}/${state.request.resubmitOnHarnessError ?? 0} to ${role} session ${agent.agentSessionId}.`);
      return _2({ update: { turn: sent, resubmits: state.resubmits + 1 }, wait: y2.agentTurn(sent) });
    }, { title: "Resubmit after a harness error" }),
    askUser: l2(async (ctx, state) => {
      const { label } = state.request;
      const { paneId } = must(state.agent, "agent");
      const where = paneId === null ? "its pane" : `pane ${paneId}`;
      await ctx.setUiFeedback({ kind: "warning", phase: `${label} stopped`, message: `Continue the agent in ${where} by hand until it finishes, then select Continue.` });
      await ctx.log("warning", must(state.stalled, "stalled turn"));
      return _2({ wait: y2.userContinue(`${label} stopped. Continue the agent by hand, then Continue.`) });
    }, { title: "Ask the user to finish the agent" }),
    recheck: l2(async (_ctx, state) => _2({ wait: y2.agentTurn(must(state.turn, "turn")) }), { title: "Check the latest turn" })
  },
  edges: {
    afterSend: f2({ from: "send", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterResubmit: f2({ from: "resubmit", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterAskUser: f2({ from: "askUser", to: ["recheck"], choose: () => ({ to: "recheck" }) }),
    afterRecheck: f2({ from: "recheck", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn })
  },
  outcomes: {
    ended: p2({ kind: "success", title: "Turn ended", output: (state) => ({ outcome: "ended", agent: must(state.agent, "agent") }) }),
    interrupted: p2({ kind: "failure", title: "Agent session ended", output: (state) => ({ outcome: "interrupted", agent: must(state.agent, "agent"), reason: must(state.interruption, "interruption") }) })
  }
});
function routeTurn(state, event) {
  const { label } = state.request;
  if (event.kind !== "agent_turn") throw new Error(`${label} resumed with an unexpected ${event.kind} event.`);
  const { agentSessionId, paneId } = must(state.agent, "agent");
  const where = paneId === null ? `session ${agentSessionId}` : `pane ${paneId}`;
  if (event.outcome === "ended") return { to: "ended", update: { stalled: null } };
  if (event.outcome === "failed" && event.reason === "harness_error" && state.resubmits < (state.request.resubmitOnHarnessError ?? 0)) return { to: "resubmit" };
  if (event.outcome === "failed") return { to: "askUser", update: { stalled: `${label} failed in ${where}: ${event.reason}` } };
  return { to: "interrupted", update: { interruption: `${label} was interrupted in ${where}: ${event.reason}` } };
}
function agentTurn(spec) {
  return u2({
    graph: AgentTurnGraph,
    title: spec.title,
    ...spec.label ? { label: spec.label } : {},
    parameters: spec.parameters,
    onResult: (state, result) => spec.onResult(state, result.output)
  });
}
function must(value, label) {
  if (value === null) throw new Error(`Agent turn state is missing its ${label}.`);
  return value;
}

// ../../workflow-libraries/common-graphs/src/judgment.ts
var MAX_ATTEMPTS = 3;
function createJudgmentGraph(spec) {
  return m2({
    key: spec.key,
    title: spec.title,
    label: (parameters) => `Route the ${parameters.label}`,
    init: (_destination, request) => ({ request, operationId: null, attempts: 0, error: null, route: null }),
    state: {
      request: c2.replace(),
      operationId: c2.replace(),
      attempts: c2.replace(),
      error: c2.replace(),
      route: c2.replace()
    },
    entry: "judge",
    nodes: {
      judge: l2(async (ctx, state) => {
        const { label, profile, prompt, feedback } = state.request;
        if (feedback) await ctx.setUiFeedback(feedback);
        const handle = await ctx.runHeadlessAgent({ ...profile, prompt });
        await ctx.log("info", `Started ${label} routing judgment ${handle.operationId} (attempt ${state.attempts + 1}/${MAX_ATTEMPTS}).`);
        return _2({ update: { operationId: handle.operationId, attempts: state.attempts + 1 }, wait: y2.headlessAgent(handle) });
      }, { title: "Run the judgment" }),
      askUser: l2(async (ctx, state) => {
        const { label } = state.request;
        await ctx.setUiFeedback({ kind: "warning", phase: `The ${label} response could not be routed`, message: `The ${label} judgment failed ${MAX_ATTEMPTS} times. Check the logs, then select Continue to read the latest response and judge it again.` });
        await ctx.log("warning", `${label} routing failed: ${state.error ?? "unknown error"}`);
        return _2({ wait: y2.userContinue(`The ${label} response could not be routed. Continue to judge it again.`) });
      }, { title: "Ask the user before judging again" })
    },
    edges: {
      afterJudge: f2({
        from: "judge",
        to: ["judged", "judge", "askUser"],
        choose: (state, event) => routeJudgment(state, event, spec.parse)
      }),
      afterAskUser: f2({ from: "askUser", to: ["rejudge"], choose: () => ({ to: "rejudge" }) })
    },
    outcomes: {
      judged: p2({
        kind: "success",
        title: "Judged",
        output: (state) => {
          if (state.route === null) throw new Error("Judgment state is missing its route.");
          return { outcome: "judged", route: state.route };
        }
      }),
      rejudge: p2({ kind: "success", title: "Judge again", output: () => ({ outcome: "rejudge" }) })
    }
  });
}
function routeJudgment(state, event, parse) {
  if (state.operationId === null) throw new Error("Judgment state is missing its operation.");
  const result = b.requireHeadless(event, state.operationId);
  let error;
  if (result.status === "completed") {
    try {
      return { to: "judged", update: { route: parse(result.output ?? ""), error: null } };
    } catch (parseError) {
      error = parseError instanceof Error ? parseError.message : String(parseError);
    }
  } else {
    error = `Judgment did not complete${result.error ? `: ${result.error}` : ""}.`;
  }
  return { to: state.attempts < MAX_ATTEMPTS ? "judge" : "askUser", update: { error } };
}

// ../../workflow-libraries/common-graphs/src/fail-step.ts
async function failStep(ctx, feedback, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", ...feedback });
  await ctx.log("error", diagnostic);
  throw new Error(diagnostic);
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
function reviewRoutingPrompt(input) {
  return `You are an unattended routing judgment for an Isagi engineering-guidance review loop.

Classify the reviewer's latest complete response into exactly one outgoing workflow edge. Map the response itself, not the workflow stage you expect the reviewer to be in. Agents may skip ahead, repeat work, or surface a decision earlier than expected; every outcome below is valid on every invocation.

Reviewer response:
${input.review}

Return exactly one JSON object with exactly this field:
{"outcome":"continue"}

Apply this precedence:
1. Return "human-decision" when the reviewer's Human Escalation section explicitly raises an escalation. The section may validly say "No escalation."; in that case, route the response using the remaining rules. Do not infer escalation from a held finding, rejected fix, disagreement language, or request for another review round outside that section. An explicit escalation takes precedence over a contradictory closure signal and can appear before or after a fixer response.
2. Return "final-fixer" when the reviewer explicitly says no re-review is needed (or clearly closes the review loop) but reports one or more actual Nit findings. The fixer gets one final discretionary turn and the workflow then ends without another review.
3. Return "complete" when the reviewer explicitly says the review loop is complete and no re-review or follow-up round is needed, with no Nit findings to hand off. Accept a clear equivalent of the canonical closure line, but do not infer completion from a lack of findings alone.
4. Return "continue" for every other response, including Blockers, Concerns, incomplete fixes, new findings, ordinary feedback, questions, Nits without an explicit closure signal, and ambiguous closure language.

A Nit is never a disagreement. Do not treat an empty Nit section or a passing mention of the severity definition as an actual Nit finding. An Architectural Reflection is not a disagreement by itself. Do not include confidence, commentary, markdown, or extra JSON fields.`;
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

// src/graphs/common.ts
var ReviewRoutingGraph = createJudgmentGraph({
  key: "EngineeringGuidanceReviewRouting",
  title: "Route the review",
  parse: parseReviewRoute
});
async function readLatestTurn(ctx, agentSessionId, role) {
  const text = latestAssistantTurnText(await ctx.getConversationHistory(agentSessionId));
  if (text) return text;
  return failStep(ctx, { phase: "Review loop failed", message: `No ${role} response was found` }, `${role} session ${agentSessionId} has no complete assistant turn to inspect.`);
}
function must2(value, label) {
  if (value === null) throw new Error(`Engineering guidance review state is missing its ${label}.`);
  return value;
}

// src/constants.ts
var fixer = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var reviewer = {
  harness: "codex",
  model: "gpt-6.1-sol",
  effort: "high"
};
var routingJudgment = {
  harness: "codex",
  model: "gpt-6-luna",
  effort: "medium"
};

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
- Don't use the ask user question tool.
- Don't run tasks or shell commands in the background. You can run them in the foreground.`;
}
function fixerToReviewerPrompt(fixerResponse) {
  return `Heres the implementers response to your review:

${fixerResponse}

Now run a re-review round:
1. **Verify the fixes.** For every finding the implementer claims to have addressed, read the current code and confirm the fix is real and complete. Do not trust the summary.
2. **Adjudicate the pushbacks.** Where the implementer declined or deferred a finding, weigh the reasoning. Withdraw the finding if the reasoning holds, or hold it if it doesnt. Never silently drop a Blocker or Concern.
3. **Review again.** Do a full pass over the current change set at the same standard as your original review. The fixes are new code; anything you missed earlier is fair game. Zero new findings is a valid outcome \u2014 do not pad.

Report in your usual output format, adding a fix-verification result per prior finding (verified / incomplete / not done) and your adjudication per pushback (withdrawn / held).

Always complete the Human Escalation section. No escalation is valid and expected unless you and the implementer have reached a fundamental impasse. A held finding is not itself an escalation: continue the review loop when another exchange could clarify or resolve it. When escalation is necessary, briefly state the disagreement, both positions, and the decision needed from the human.

You have final authority on when this loop ends. If all Blockers and Concerns are verified fixed or withdrawn \u2014 none open, none held \u2014 and nothing new beyond Nits emerged, end your response with the exact line **No re-review needed.** and state plainly that the review loop is complete. Never use that phrase in any other situation, so it stays a reliable signal that the loop is closed. Otherwise, end with exactly what must happen before the next round.

Don't run tasks or shell commands in the background. You can run them in the foreground.`;
}

// src/graphs/fix-round.ts
var FixRoundGraph = m({
  key: "EngineeringGuidanceReviewFix",
  title: "Fix round",
  init: (_destination, parameters) => ({ ...parameters, turn: null, response: null, failure: null }),
  state: {
    fixer: c.replace(),
    review: c.replace(),
    readResponse: c.replace(),
    turn: c.replace(),
    response: c.replace(),
    failure: c.replace()
  },
  entry: "askFixer",
  nodes: {
    askFixer: agentTurn({
      title: "Fix the review findings",
      parameters: (state) => ({
        label: "Fixer",
        session: state.fixer === null ? { kind: "spawn", ...fixer } : { kind: "existing", ...state.fixer },
        prompt: reviewToFixerPrompt(state.review),
        feedback: { phase: "Fixing review findings" }
      }),
      onResult: (_state, turn) => ({ turn, fixer: turn.agent })
    }),
    readResponse: l(async (ctx, state) => {
      return g({ update: { response: await readLatestTurn(ctx, must2(state.fixer, "fixer").agentSessionId, "fixer") } });
    }, { title: "Read the fixer's response" })
  },
  edges: {
    afterAskFixer: f({
      from: "askFixer",
      to: ["readResponse", "fixed", "failed"],
      choose: (state) => {
        const turn = must2(state.turn, "fixer turn");
        if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: "Fixer turn failed", diagnostic: `Fixer turn failed: ${turn.reason}` } } };
        return { to: state.readResponse ? "readResponse" : "fixed" };
      }
    }),
    afterReadResponse: f({ from: "readResponse", to: ["fixed"], choose: () => ({ to: "fixed" }) })
  },
  outcomes: {
    fixed: p({ kind: "success", title: "Fixed", output: (state) => ({ outcome: "fixed", fixer: must2(state.fixer, "fixer"), response: state.response }) }),
    failed: p({ kind: "failure", title: "Fix failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
  }
});

// src/graphs/review-round.ts
var ReviewRoundGraph = m({
  key: "EngineeringGuidanceReviewRound",
  title: "Review round",
  label: (parameters) => parameters.reviewer === null ? "Initial review" : `Re-review round ${parameters.reviewRound}`,
  init: (_destination, parameters) => ({ ...parameters, turn: null, review: null, route: null, failure: null }),
  state: {
    context: c.replace(),
    reviewer: c.replace(),
    fixerResponse: c.replace(),
    reviewRound: c.replace(),
    turn: c.replace(),
    review: c.replace(),
    route: c.replace(),
    failure: c.replace()
  },
  entry: "askReviewer",
  nodes: {
    askReviewer: agentTurn({
      title: "Review the changes",
      parameters: (state) => state.reviewer === null ? {
        label: "Reviewer",
        session: { kind: "spawn", ...reviewer },
        modifiers: [{ kind: "command", name: "perform-engineering-guidance-review" }],
        prompt: state.context,
        feedback: { phase: "Starting reviewer" }
      } : {
        label: "Reviewer",
        session: { kind: "existing", ...state.reviewer },
        prompt: fixerToReviewerPrompt(must2(state.fixerResponse, "fixer response")),
        feedback: { phase: "Re-reviewing fixes" }
      },
      onResult: (_state, turn) => ({ turn, reviewer: turn.agent })
    }),
    readReview: l(async (ctx, state) => {
      return g({ update: { review: await readLatestTurn(ctx, must2(state.reviewer, "reviewer").agentSessionId, "reviewer") } });
    }, { title: "Read the review" }),
    routeReview: u({
      graph: ReviewRoutingGraph,
      title: "Route the review",
      parameters: (state) => ({
        label: "reviewer",
        profile: routingJudgment,
        prompt: reviewRoutingPrompt({ review: must2(state.review, "review") }),
        feedback: { phase: "Routing reviewer feedback" }
      }),
      // A rejudge reads the reviewer's latest turn again before routing it.
      onResult: (_state, { output }) => ({ route: output.outcome === "judged" ? output.route : null })
    }),
    awaitHumanDecision: l(async (ctx, state) => {
      await ctx.setUiFeedback({ kind: "warning", phase: "Waiting for your decision", message: "The reviewer raised a human escalation. Resolve it, then continue the workflow." });
      await ctx.log("warning", state.fixerResponse === null ? "Reviewer raised a human escalation before the first fixer turn; waiting for user resolution." : `Reviewer raised a human escalation in review round ${state.reviewRound}; waiting for user resolution.`);
      return _({ wait: y.userContinue() });
    }, { title: "Wait for the human decision" }),
    readResolvedReview: l(async (ctx, state) => {
      const review = await readLatestTurn(ctx, must2(state.reviewer, "reviewer").agentSessionId, "reviewer");
      await ctx.log("info", state.fixerResponse === null ? "User continued after the initial disagreement; sending the reviewer session's latest complete turn to the fixer." : `User continued review round ${state.reviewRound}; sending the reviewer session's latest complete turn to the fixer.`);
      return g({ update: { review, route: "continue" } });
    }, { title: "Read the reviewer's latest turn" })
  },
  edges: {
    afterAskReviewer: f({
      from: "askReviewer",
      to: ["readReview", "failed"],
      choose: (state) => {
        const turn = must2(state.turn, "reviewer turn");
        if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: "Reviewer turn failed", diagnostic: `Reviewer turn failed: ${turn.reason}` } } };
        return { to: "readReview" };
      }
    }),
    afterReadReview: f({ from: "readReview", to: ["routeReview"], choose: () => ({ to: "routeReview" }) }),
    afterRouteReview: f({
      from: "routeReview",
      to: ["reviewed", "awaitHumanDecision", "readReview"],
      choose: (state) => {
        if (state.route === null) return { to: "readReview" };
        return { to: state.route === "human-decision" ? "awaitHumanDecision" : "reviewed" };
      }
    }),
    afterAwaitHumanDecision: f({
      from: "awaitHumanDecision",
      to: ["readResolvedReview"],
      choose: (_state, event) => {
        if (event.kind !== "user_continue") throw new Error(`The human-decision pause resumed with an unexpected ${event.kind} event.`);
        return { to: "readResolvedReview" };
      }
    }),
    afterReadResolvedReview: f({ from: "readResolvedReview", to: ["reviewed"], choose: () => ({ to: "reviewed" }) })
  },
  outcomes: {
    reviewed: p({
      kind: "success",
      title: "Reviewed",
      output: (state) => {
        const route = must2(state.route, "route");
        return {
          outcome: "reviewed",
          reviewer: must2(state.reviewer, "reviewer"),
          review: must2(state.review, "review"),
          verdict: route === "complete" ? "complete" : "fix",
          afterFixer: route === "final-fixer" ? "complete" : "rereview"
        };
      }
    }),
    failed: p({ kind: "failure", title: "Review failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
  }
});

// src/graph.ts
var EngineeringGuidanceReviewGraph = m({
  key: "EngineeringGuidanceReview",
  title: "Engineering guidance review loop",
  init: (_destination, parameters) => ({
    context: parameters.context,
    reviewer: null,
    fixer: parameters.fixerSessionId === null ? null : { agentSessionId: parameters.fixerSessionId, paneId: null },
    review: null,
    verdict: null,
    afterFixer: null,
    fixerResponse: null,
    reviewRound: 1,
    failure: null
  }),
  state: {
    context: c.replace(),
    reviewer: c.replace(),
    fixer: c.replace(),
    review: c.replace(),
    verdict: c.replace(),
    afterFixer: c.replace(),
    fixerResponse: c.replace(),
    reviewRound: c.replace(),
    failure: c.replace()
  },
  entry: "review",
  nodes: {
    review: u({
      graph: ReviewRoundGraph,
      title: "Review",
      label: (state) => state.reviewer === null ? "Initial review" : `Re-review round ${state.reviewRound}`,
      parameters: (state) => ({ context: state.context, reviewer: state.reviewer, fixerResponse: state.fixerResponse, reviewRound: state.reviewRound }),
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { reviewer: output.reviewer, review: output.review, verdict: output.verdict, afterFixer: output.afterFixer }
    }),
    fix: u({
      graph: FixRoundGraph,
      title: "Fix",
      label: (state) => `Fix round ${state.reviewRound}`,
      parameters: (state) => ({ fixer: state.fixer, review: must2(state.review, "review"), readResponse: state.afterFixer === "rereview" }),
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { fixer: output.fixer, fixerResponse: output.response }
    }),
    finish: l(async (ctx, state) => {
      await ctx.setUiFeedback({ phase: "Review loop complete" });
      if (state.fixer?.paneId != null) await ctx.closePane(state.fixer.paneId);
      const reviewerPane = must2(state.reviewer, "reviewer").paneId;
      if (reviewerPane !== null) await ctx.closePane(reviewerPane);
      await ctx.log("info", `Engineering guidance review loop completed after ${state.reviewRound} review rounds.`);
      return g();
    }, { title: "Close the workflow panes" }),
    reportFailure: l(async (ctx, state) => {
      const failure = must2(state.failure, "failure");
      await ctx.setUiFeedback({ kind: "error", phase: "Review loop failed", message: failure.message });
      await ctx.log("error", failure.diagnostic);
      return g();
    }, { title: "Report the failure" })
  },
  edges: {
    afterReview: f({
      from: "review",
      to: ["reportFailure", "finish", "fix"],
      choose: (state) => {
        if (state.failure) return { to: "reportFailure" };
        return { to: state.verdict === "complete" ? "finish" : "fix" };
      }
    }),
    afterFix: f({
      from: "fix",
      to: ["reportFailure", "finish", "review"],
      choose: (state) => {
        if (state.failure) return { to: "reportFailure" };
        if (state.afterFixer === "complete") return { to: "finish" };
        return { to: "review", update: { reviewRound: state.reviewRound + 1 } };
      }
    }),
    afterFinish: f({ from: "finish", to: ["succeeded"], choose: () => ({ to: "succeeded" }) }),
    afterReportFailure: f({ from: "reportFailure", to: ["failed"], choose: () => ({ to: "failed" }) })
  },
  outcomes: {
    succeeded: p({ kind: "success", title: "Review loop complete", output: (state) => ({ outcome: "workflow-executed-successfully", reviewCount: state.reviewRound }) }),
    failed: p({ kind: "failure", title: "Review loop failed", output: (state) => ({ outcome: "failed", reason: must2(state.failure, "failure").diagnostic }) })
  }
});

// src/index.ts
var index_default = h({
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
  // The launching agent, when there is one, becomes the fixer.
  parse: (origin, inputs) => ({
    context: parseContext(inputs.context),
    fixerSessionId: origin.agentSessionId ?? null
  }),
  graph: EngineeringGuidanceReviewGraph
});
function parseContext(value) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error("context must be non-empty free-form text.");
}
export {
  index_default as default
};
