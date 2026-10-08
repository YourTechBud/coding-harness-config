// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.1.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function i(e) {
  return {
    isagiContract: 5,
    isagiKind: e
  };
}
function h(e) {
  return {
    ...i("workflow"),
    ...e
  };
}

// ../../workflow-libraries/common-graphs/node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.1.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function i2(e) {
  return {
    isagiContract: 5,
    isagiKind: e
  };
}
function s(e) {
  return {
    ...i2("state-field"),
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
    ...i2("operation-node"),
    title: t?.title,
    description: t?.description,
    label: t?.label,
    run: e
  };
}
function u(e) {
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
function f(e) {
  return {
    ...i2("edge"),
    from: e.from,
    to: e.to,
    choose: e.choose,
    title: e.title
  };
}
function p(e) {
  return {
    ...i2("outcome"),
    kind: e.kind,
    reason: e.reason,
    title: e.title,
    output: e.output
  };
}
function m(e) {
  return {
    ...i2("graph"),
    ...e
  };
}
function g(e) {
  return e && "update" in e ? {
    ...i2("operation-result"),
    type: "complete",
    update: e.update
  } : {
    ...i2("operation-result"),
    type: "complete"
  };
}
function _(e) {
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
function ownedPane(agent) {
  if (agent.paneId === null) throw new Error(`Agent session ${agent.agentSessionId} has no pane owned by this workflow.`);
  return agent.paneId;
}
var AgentTurnGraph = m({
  key: "AgentTurn",
  title: "Agent turn",
  label: (parameters) => parameters.label,
  init: (_destination, request) => ({ request, agent: null, turn: null, resubmits: 0, stalled: null, interruption: null }),
  state: {
    request: c.replace(),
    agent: c.replace(),
    turn: c.replace(),
    resubmits: c.replace(),
    stalled: c.replace(),
    interruption: c.replace()
  },
  entry: "send",
  nodes: {
    send: l(async (ctx, { request }) => {
      if (request.feedback) await ctx.setUiFeedback(request.feedback);
      if (request.session.kind === "spawn") {
        const { kind: _kind, ...profile } = request.session;
        const spawned = await ctx.spawnAgentSession({ ...profile, prompt: request.prompt, modifiers: request.modifiers });
        return _({
          update: { agent: { agentSessionId: spawned.agentSessionId, paneId: spawned.paneId }, turn: { agentSessionId: spawned.agentSessionId, sentAt: spawned.sentAt } },
          wait: y.agentTurn(spawned)
        });
      }
      const { agentSessionId, paneId } = request.session;
      const sent = await ctx.sendAgentPrompt({ agentSessionId, prompt: request.prompt, modifiers: request.modifiers });
      return _({ update: { agent: { agentSessionId, paneId }, turn: sent }, wait: y.agentTurn(sent) });
    }, { title: "Send the prompt", label: (state) => state.request.label }),
    resubmit: l(async (ctx, state) => {
      const { label, prompt, modifiers } = state.request;
      const agent = must(state.agent, "agent");
      const role = label.toLowerCase();
      await ctx.setUiFeedback({ kind: "warning", phase: `Retrying ${role}`, message: `The ${role} harness turn failed. Resubmitting its previous message.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: agent.agentSessionId, prompt, modifiers });
      await ctx.log("warning", `Resubmitted the previous message after harness_error ${state.resubmits + 1}/${state.request.resubmitOnHarnessError ?? 0} to ${role} session ${agent.agentSessionId}.`);
      return _({ update: { turn: sent, resubmits: state.resubmits + 1 }, wait: y.agentTurn(sent) });
    }, { title: "Resubmit after a harness error" }),
    askUser: l(async (ctx, state) => {
      const { label } = state.request;
      const { paneId } = must(state.agent, "agent");
      const where = paneId === null ? "its pane" : `pane ${paneId}`;
      await ctx.setUiFeedback({ kind: "warning", phase: `${label} stopped`, message: `Continue the agent in ${where} by hand until it finishes, then select Continue.` });
      await ctx.log("warning", must(state.stalled, "stalled turn"));
      return _({ wait: y.userContinue(`${label} stopped. Continue the agent by hand, then Continue.`) });
    }, { title: "Ask the user to finish the agent" }),
    recheck: l(async (_ctx, state) => _({ wait: y.agentTurn(must(state.turn, "turn")) }), { title: "Check the latest turn" })
  },
  edges: {
    afterSend: f({ from: "send", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterResubmit: f({ from: "resubmit", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterAskUser: f({ from: "askUser", to: ["recheck"], choose: () => ({ to: "recheck" }) }),
    afterRecheck: f({ from: "recheck", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn })
  },
  outcomes: {
    ended: p({ kind: "success", title: "Turn ended", output: (state) => ({ outcome: "ended", agent: must(state.agent, "agent") }) }),
    interrupted: p({ kind: "failure", title: "Agent session ended", output: (state) => ({ outcome: "interrupted", agent: must(state.agent, "agent"), reason: must(state.interruption, "interruption") }) })
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
  return u({
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
  return m({
    key: spec.key,
    title: spec.title,
    label: (parameters) => `Route the ${parameters.label}`,
    init: (_destination, request) => ({ request, operationId: null, attempts: 0, error: null, route: null }),
    state: {
      request: c.replace(),
      operationId: c.replace(),
      attempts: c.replace(),
      error: c.replace(),
      route: c.replace()
    },
    entry: "judge",
    nodes: {
      judge: l(async (ctx, state) => {
        const { label, profile, prompt, feedback } = state.request;
        if (feedback) await ctx.setUiFeedback(feedback);
        const handle = await ctx.runHeadlessAgent({ ...profile, prompt });
        await ctx.log("info", `Started ${label} routing judgment ${handle.operationId} (attempt ${state.attempts + 1}/${MAX_ATTEMPTS}).`);
        return _({ update: { operationId: handle.operationId, attempts: state.attempts + 1 }, wait: y.headlessAgent(handle) });
      }, { title: "Run the judgment" }),
      askUser: l(async (ctx, state) => {
        const { label } = state.request;
        await ctx.setUiFeedback({ kind: "warning", phase: `The ${label} response could not be routed`, message: `The ${label} judgment failed ${MAX_ATTEMPTS} times. Check the logs, then select Continue to read the latest response and judge it again.` });
        await ctx.log("warning", `${label} routing failed: ${state.error ?? "unknown error"}`);
        return _({ wait: y.userContinue(`The ${label} response could not be routed. Continue to judge it again.`) });
      }, { title: "Ask the user before judging again" })
    },
    edges: {
      afterJudge: f({
        from: "judge",
        to: ["judged", "judge", "askUser"],
        choose: (state, event) => routeJudgment(state, event, spec.parse)
      }),
      afterAskUser: f({ from: "askUser", to: ["rejudge"], choose: () => ({ to: "rejudge" }) })
    },
    outcomes: {
      judged: p({
        kind: "success",
        title: "Judged",
        output: (state) => {
          if (state.route === null) throw new Error("Judgment state is missing its route.");
          return { outcome: "judged", route: state.route };
        }
      }),
      rejudge: p({ kind: "success", title: "Judge again", output: () => ({ outcome: "rejudge" }) })
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

// ../../workflow-libraries/common-graphs/src/reviewed-artifact.ts
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

// ../../workflow-libraries/common-graphs/src/fail-step.ts
async function failStep(ctx, feedback, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", ...feedback });
  await ctx.log("error", diagnostic);
  throw new Error(diagnostic);
}

// ../../workflow-libraries/common-graphs/src/reviewed-artifact.ts
var MAX_WRITER_RECOVERIES = 1;
function createReviewedArtifactGraph(config) {
  const writer2 = createWriterGraph(config);
  const review = createReviewGraph(config);
  return m({
    key: config.key,
    title: config.title,
    init: (_destination, context) => ({ context, writer: null, reviewer: null, writerResponse: null, review: null, reviewRound: 0, verdict: null, reviewReason: null, failure: null }),
    state: {
      context: c.replace(),
      writer: c.replace(),
      reviewer: c.replace(),
      writerResponse: c.replace(),
      review: c.replace(),
      reviewRound: c.replace(),
      verdict: c.replace(),
      reviewReason: c.replace(),
      failure: c.replace()
    },
    entry: "write",
    nodes: {
      write: u({
        graph: writer2,
        title: "Write the artifact",
        parameters: (state) => ({ context: state.context, writer: null, review: null }),
        onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { writer: output.writer, writerResponse: output.response }
      }),
      review: u({
        graph: review,
        title: "Review the artifact",
        label: (state) => `Review round ${state.reviewer ? state.reviewRound + 1 : 1}`,
        parameters: (state) => ({ context: state.context, reviewer: state.reviewer, writerResponse: state.writerResponse, round: state.reviewer ? state.reviewRound + 1 : 1 }),
        onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { reviewer: output.reviewer, review: output.review, verdict: output.verdict, reviewReason: output.reason, reviewRound: output.round }
      }),
      revise: u({
        graph: writer2,
        title: "Revise the artifact",
        parameters: (state) => ({ context: state.context, writer: must2(state.writer, "writer"), review: must2(state.review, "review") }),
        onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { writerResponse: output.response }
      }),
      askHuman: l(async (ctx, state) => {
        const reason = must2(state.reviewReason, "review decision");
        const message = `${reason} Resolve it with ${config.roles.writer.toLowerCase()}, then select Continue.`;
        await ctx.setUiFeedback({ kind: "warning", phase: "Waiting for your decision", message });
        await ctx.log("warning", `${config.roundLabel} ${state.reviewRound} needs a human decision: ${reason}
${must2(state.review, "review")}`);
        return _({ wait: y.userContinue(message) });
      }, { title: "Wait for your decision" }),
      replay: u({
        graph: writer2,
        title: "Incorporate your decision",
        parameters: (state) => ({ context: state.context, writer: must2(state.writer, "writer"), review: must2(state.review, "review"), afterHumanDecision: true }),
        onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { writerResponse: output.response }
      }),
      finish: l(async (ctx, state) => {
        await ctx.setUiFeedback({ phase: config.phases.complete });
        await ctx.closePane(ownedPane(must2(state.writer, "writer")));
        await ctx.closePane(ownedPane(must2(state.reviewer, "reviewer")));
        await ctx.log("info", `${config.phases.complete} after ${state.reviewRound} review rounds.`);
        return g();
      }, { title: "Close the writer and reviewer" }),
      reportFailure: l(async (ctx, state) => {
        const failure = must2(state.failure, "failure");
        await ctx.setUiFeedback({ kind: "error", phase: config.phases.failed, message: failure.message });
        await ctx.log("error", failure.diagnostic);
        return g();
      }, { title: "Report the failure" })
    },
    edges: {
      afterWrite: f({ from: "write", to: ["review", "reportFailure"], choose: (state) => ({ to: state.failure ? "reportFailure" : "review" }) }),
      afterReview: f({
        from: "review",
        to: ["finish", "revise", "askHuman", "reportFailure"],
        choose: (state) => {
          if (state.failure) return { to: "reportFailure" };
          if (state.verdict === "human-decision") return { to: "askHuman" };
          return { to: state.verdict === "complete" ? "finish" : "revise" };
        }
      }),
      afterRevise: f({ from: "revise", to: ["review", "reportFailure"], choose: (state) => ({ to: state.failure ? "reportFailure" : "review" }) }),
      afterAskHuman: f({ from: "askHuman", to: ["replay"], choose: (_state, event) => {
        if (event.kind !== "user_continue") throw new Error(`The human decision resumed with an unexpected ${event.kind} event.`);
        return { to: "replay" };
      } }),
      afterReplay: f({ from: "replay", to: ["review", "reportFailure"], choose: (state) => ({ to: state.failure ? "reportFailure" : "review" }) }),
      afterFinish: f({ from: "finish", to: ["reviewed"], choose: () => ({ to: "reviewed" }) }),
      afterReportFailure: f({ from: "reportFailure", to: ["failed"], choose: () => ({ to: "failed" }) })
    },
    outcomes: {
      reviewed: p({ kind: "success", title: "Artifact reviewed", output: (state) => ({ outcome: "artifact-reviewed", artifactPath: state.context.artifactPath, reviewCount: state.reviewRound }) }),
      failed: p({ kind: "failure", title: "Artifact not reviewed", output: (state) => ({ outcome: "failed", reason: must2(state.failure, "failure").diagnostic }) })
    }
  });
}
function createWriterGraph(config) {
  const judgment = createJudgmentGraph({ key: `${config.key}WriterJudgment`, title: "Route the writer", parse: config.parse.writerRoute });
  const role = config.roles.writer;
  const resubmit = config.resubmitOnHarnessError ? { resubmitOnHarnessError: config.resubmitOnHarnessError } : {};
  return m({
    key: `${config.key}Writer`,
    title: "Writer turn",
    label: (parameters) => parameters.writer ? "Revise the artifact" : "Write the artifact",
    init: (destination, parameters) => ({
      repositoryPath: destination.worktreePath,
      ...parameters,
      turn: null,
      response: null,
      afterHumanDecision: parameters.afterHumanDecision ?? false,
      artifactExists: false,
      recoveryAttempts: 0,
      route: null,
      routingReason: null,
      failure: null
    }),
    state: {
      repositoryPath: c.replace(),
      context: c.replace(),
      writer: c.replace(),
      review: c.replace(),
      turn: c.replace(),
      response: c.replace(),
      afterHumanDecision: c.replace(),
      artifactExists: c.replace(),
      recoveryAttempts: c.replace(),
      route: c.replace(),
      routingReason: c.replace(),
      failure: c.replace()
    },
    entry: "prompt",
    nodes: {
      prompt: agentTurn({
        title: "Prompt the writer",
        parameters: (state) => state.writer === null ? {
          label: role,
          session: { kind: "spawn", ...config.profiles.writer },
          modifiers: [{ kind: "skill", name: config.skill }],
          prompt: config.prompts.initialWriter({ ...state.context, repositoryPath: state.repositoryPath }),
          feedback: { phase: config.phases.writing },
          ...resubmit
        } : {
          label: role,
          session: { kind: "existing", ...state.writer },
          prompt: state.afterHumanDecision ? continuationPrompt(state) : config.prompts.reviewToWriter(must2(state.review, "review")),
          feedback: { phase: config.phases.revising },
          ...resubmit
        },
        onResult: (_state, turn) => ({ turn, writer: turn.agent })
      }),
      readResponse: l(async (ctx, state) => {
        const writer2 = must2(state.writer, "writer");
        const response = config.latestAssistantTurnText(await ctx.getConversationHistory(writer2.agentSessionId));
        if (response) {
          const artifactExists = await artifactFileExists(resolve(state.repositoryPath, state.context.artifactPath));
          return g({ update: { response, artifactExists } });
        }
        return failStep(ctx, { phase: config.phases.failed, message: "No writer response was found" }, `writer session ${writer2.agentSessionId} has no complete assistant turn to inspect.`);
      }, { title: "Read the writer's reply" }),
      judge: u({
        graph: judgment,
        title: "Route the writer",
        parameters: (state) => ({
          label: "writer",
          profile: config.profiles.writerJudgment,
          prompt: config.prompts.writerRouting({ writerResponse: must2(state.response, "writer response"), artifactPath: state.context.artifactPath, artifactExists: state.artifactExists }),
          feedback: { phase: config.phases.checkingWriter }
        }),
        onResult: (_state, { output }) => output.outcome === "judged" ? { route: output.route.outcome, routingReason: output.route.reason } : { route: null, routingReason: null }
      }),
      askUser: l(async (ctx, state) => {
        const writer2 = must2(state.writer, "writer");
        const phase = state.route === "human-decision" ? "Waiting for your decision" : "The writer needs help finishing the artifact";
        const reason = state.artifactExists || state.route === "human-decision" ? must2(state.routingReason, "writer routing reason") : `The artifact file is missing or empty at ${state.context.artifactPath}.`;
        const message = `${reason} Resolve it with ${role.toLowerCase()}, then select Continue.`;
        await ctx.setUiFeedback({ kind: "warning", phase, message });
        await ctx.log("warning", `Writer session ${writer2.agentSessionId}: ${phase}. ${reason}
Latest response:
${must2(state.response, "writer response")}`);
        return _({ wait: y.userContinue(message) });
      }, { title: "Ask the user to resolve the writer" }),
      recover: l(async () => g({ update: { recoveryAttempts: 0 } }), { title: "Prepare the updated writer response" }),
      replay: agentTurn({
        title: "Incorporate your decision and reply to the reviewer",
        parameters: (state) => ({
          label: role,
          session: { kind: "existing", ...must2(state.writer, "writer") },
          prompt: continuationPrompt(state),
          feedback: { phase: config.phases.revising },
          ...resubmit
        }),
        onResult: (_state, turn) => ({ turn })
      }),
      nudge: agentTurn({
        title: "Nudge the writer once",
        parameters: (state) => ({
          label: role,
          session: { kind: "existing", ...must2(state.writer, "writer") },
          prompt: config.prompts.retryWriter(),
          feedback: { phase: config.phases.recoveringWriter },
          ...resubmit
        }),
        onResult: (state, turn) => ({ turn, recoveryAttempts: state.recoveryAttempts + 1 })
      })
    },
    edges: {
      afterPrompt: afterWriterTurn("prompt", role),
      afterReadResponse: f({ from: "readResponse", to: ["judge"], choose: () => ({ to: "judge" }) }),
      afterJudge: f({
        from: "judge",
        to: ["ready", "nudge", "askUser", "readResponse"],
        choose: (state) => {
          if (state.route === null) return { to: "readResponse" };
          if (state.route === "human-decision") return { to: "askUser" };
          if (state.route === "ready" && state.artifactExists) return { to: "ready" };
          return { to: state.recoveryAttempts < MAX_WRITER_RECOVERIES ? "nudge" : "askUser" };
        }
      }),
      afterAskUser: f({
        from: "askUser",
        to: ["recover"],
        choose: (_state, event) => {
          if (event.kind !== "user_continue") throw new Error(`The writer recovery resumed with an unexpected ${event.kind} event.`);
          return { to: "recover" };
        }
      }),
      afterRecover: f({ from: "recover", to: ["replay"], choose: () => ({ to: "replay" }) }),
      afterReplay: afterWriterTurn("replay", role, "readResponse"),
      afterNudge: afterWriterTurn("nudge", role, "readResponse")
    },
    outcomes: {
      ready: p({ kind: "success", title: "Writer ready", output: (state) => ({ outcome: "ready", writer: must2(state.writer, "writer"), response: must2(state.response, "writer response") }) }),
      failed: p({ kind: "failure", title: "Writer failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
    }
  });
  function continuationPrompt(state) {
    return config.prompts.continueWriter(state.review);
  }
  function afterWriterTurn(from, label, next = "readResponse") {
    return f({ from, to: [next, "failed"], choose: (state) => afterTurn(state, label, next) });
  }
}
function createReviewGraph(config) {
  const judgment = createJudgmentGraph({ key: `${config.key}ReviewJudgment`, title: "Route the review", parse: config.parse.reviewerRoute });
  const role = config.roles.reviewer;
  const resubmit = config.resubmitOnHarnessError ? { resubmitOnHarnessError: config.resubmitOnHarnessError } : {};
  return m({
    key: `${config.key}Review`,
    title: "Review round",
    label: (parameters) => `Review round ${parameters.round}`,
    init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, review: null, verdict: null, routingReason: null, failure: null }),
    state: {
      repositoryPath: c.replace(),
      context: c.replace(),
      reviewer: c.replace(),
      writerResponse: c.replace(),
      round: c.replace(),
      turn: c.replace(),
      review: c.replace(),
      verdict: c.replace(),
      routingReason: c.replace(),
      failure: c.replace()
    },
    entry: "prompt",
    nodes: {
      prompt: agentTurn({
        title: "Prompt the reviewer",
        parameters: (state) => state.reviewer === null ? {
          label: role,
          session: { kind: "spawn", ...config.profiles.reviewer },
          modifiers: [{ kind: "skill", name: config.skill }],
          prompt: config.prompts.initialReviewer({ ...state.context, repositoryPath: state.repositoryPath }),
          feedback: { phase: config.phases.reviewing },
          ...resubmit
        } : {
          label: role,
          session: { kind: "existing", ...state.reviewer },
          prompt: config.prompts.writerToReviewer(must2(state.writerResponse, "writer response")),
          feedback: { phase: config.phases.rereviewing },
          ...resubmit
        },
        onResult: (_state, turn) => ({ turn, reviewer: turn.agent })
      }),
      readReview: l(async (ctx, state) => {
        const reviewer2 = must2(state.reviewer, "reviewer");
        const review = config.latestAssistantTurnText(await ctx.getConversationHistory(reviewer2.agentSessionId));
        if (review) return g({ update: { review } });
        return failStep(ctx, { phase: config.phases.failed, message: "No reviewer response was found" }, `reviewer session ${reviewer2.agentSessionId} has no complete assistant turn to inspect.`);
      }, { title: "Read the reviewer's reply" }),
      judge: u({
        graph: judgment,
        title: "Route the review",
        parameters: (state) => ({
          label: "reviewer",
          profile: config.profiles.reviewerJudgment,
          prompt: config.prompts.reviewerRouting({ review: must2(state.review, "review") }),
          feedback: { phase: config.phases.routingReview }
        }),
        onResult: (_state, { output }) => output.outcome === "judged" ? { verdict: output.route.outcome, routingReason: output.route.reason } : { verdict: null, routingReason: null }
      })
    },
    edges: {
      afterPrompt: f({ from: "prompt", to: ["readReview", "failed"], choose: (state) => afterTurn(state, role, "readReview") }),
      afterReadReview: f({ from: "readReview", to: ["judge"], choose: () => ({ to: "judge" }) }),
      afterJudge: f({
        from: "judge",
        to: ["reviewed", "readReview"],
        choose: (state) => {
          if (state.verdict === null) return { to: "readReview" };
          return { to: "reviewed" };
        }
      })
    },
    outcomes: {
      reviewed: p({
        kind: "success",
        title: "Reviewed",
        output: (state) => {
          const verdict = must2(state.verdict, "verdict");
          return { outcome: "reviewed", verdict, reason: must2(state.routingReason, "review routing reason"), reviewer: must2(state.reviewer, "reviewer"), review: must2(state.review, "review"), round: state.round };
        }
      }),
      failed: p({ kind: "failure", title: "Review failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
    }
  });
}
async function artifactFileExists(path) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}
function afterTurn(state, label, next) {
  const turn = must2(state.turn, "agent turn");
  if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: `${label} failed because its agent session ended.`, diagnostic: turn.reason } } };
  return { to: next };
}
function must2(value, label) {
  if (value === null) throw new Error(`Reviewed artifact state is missing its ${label}.`);
  return value;
}

// ../../workflow-libraries/common-graphs/src/artifact-routing.ts
var WRITER_ROUTING_INSTRUCTIONS = `Return exactly one JSON object with exactly these fields:
{"outcome":"ready","reason":"The writing or revision is complete and ready for review."}

Apply this precedence:
1. Return "human-decision" when the writer identifies a specific unresolved user decision or input that blocks further writing or acceptance. This takes precedence even when the file exists and the writer says it is ready for review. Name the decision in reason. Writer and reviewer agreement does not remove the need for the user's decision.
2. Return "ready" when the artifact file exists and the writer reports completed writing or revisions for review, including an evidence-backed response that applies some findings and pushes back on others. Ready for review is separate from reviewer acceptance. Findings the reviewer can adjudicate and nonblocking recorded uncertainty do not make a completed turn incomplete.
3. Return "incomplete" when the artifact file is missing or the writer reports unfinished writing, only intended future work, or no completed artifact turn. Explain what remains in reason.

Every outcome is valid on every invocation. Return a concise, nonempty reason and no confidence, commentary, markdown, or extra JSON fields.`;
var REVIEWER_ROUTING_INSTRUCTIONS = `Return exactly one JSON object with exactly these fields:
{"outcome":"revise","reason":"The artifact needs corrections."}

Apply this precedence:
1. Return "human-decision" when the reviewer identifies a specific unresolved decision or input that requires the user before writing or acceptance can proceed, or explicitly escalates a fundamental impasse. Name the decision in reason. A required user decision takes precedence over closure language or a contradictory "No escalation." section. An ordinary disagreement or held finding that the agents can resolve is not a human decision.
2. Return "complete" when the reviewer explicitly closes the loop with "No re-review needed." and does not simultaneously report an open Blocker, Concern, or human decision. Optional findings may coexist with completion.
3. Return "revise" for every other response, including any Blocker or Concern the writer can address, incomplete corrections, held findings, new findings, ambiguous closure language, and requests for another review round.

Every outcome is valid on every invocation. Return a concise, nonempty reason and no confidence, commentary, markdown, or extra JSON fields.`;
var REVIEWER_ESCALATION_AND_CLOSURE = `Always include a Human Escalation section. When a specific unresolved user decision or input blocks further writing or acceptance, explicitly state "Escalation required:", explain the decision, the recommendation, alternatives, and consequences. Escalate this decision even when you and the writer agree. Also escalate a fundamental impasse when repeated substantive disagreement is unlikely to be resolved by another exchange, explaining both positions. Otherwise state "No escalation." An ordinary disagreement or held finding the agents can resolve is not an escalation.

When no Blocker, Concern, or blocking human decision remains, end with the exact line: No re-review needed.`;
var WRITER_INPUT_POLICY = `When a specific user decision or input blocks further writing or acceptance, preserve the completed work and clearly state the decision needed, your recommendation, alternatives, and consequences. Distinguish this blocking decision from nonblocking uncertainty and findings the reviewer can adjudicate. Keep scope decisions with the user.`;
var WRITER_CONTINUATION_INSTRUCTIONS = `Incorporate the decisions and changes from our conversation into the artifact and any affected predecessor artifacts. Preserve completed work and verify the updated artifacts. Then provide a fresh response for the reviewer explaining the incorporated decisions, changes, and any remaining evidence-backed pushback. State whether a specific unresolved user decision still blocks progress. Produce an updated reviewer-facing response rather than repeating an outdated reply.`;
function parseWriterRoute(output) {
  return parseJudgment(output, ["ready", "incomplete", "human-decision"], "writer");
}
function parseReviewerRoute(output) {
  return parseJudgment(output, ["complete", "revise", "human-decision"], "reviewer");
}
function parseJudgment(output, allowed, label) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Judgment output did not contain a JSON object.");
  const value = JSON.parse(output.slice(first, last + 1));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} judgment must be a JSON object.`);
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("outcome") || !keys.includes("reason")) throw new Error(`${label} judgment must contain exactly two fields: outcome and reason.`);
  if (typeof record.outcome !== "string" || !allowed.includes(record.outcome)) throw new Error(`${label} judgment outcome must be one of: ${allowed.join(", ")}.`);
  if (typeof record.reason !== "string" || record.reason.trim().length === 0) throw new Error(`${label} judgment reason must be nonempty text.`);
  return { outcome: record.outcome, reason: record.reason.trim() };
}

// src/constants.ts
var reviewer = {
  harness: "codex",
  model: "gpt-6.1-sol",
  effort: "high"
};
var writer = {
  harness: "claude",
  model: "opus",
  effort: "high"
};
var writerJudgment = {
  harness: "codex",
  model: "gpt-6-luna",
  effort: "medium"
};
var reviewerJudgment = {
  harness: "codex",
  model: "gpt-6-luna",
  effort: "medium"
};

// src/prompts.ts
var PROMPT_FOOTER = "Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";
var DESIGN_SCOPE = `The story defines the bounded scope through its acceptance criteria, provided contracts, and explicitly agreed design decisions. Treat initial thinking, plans, and other suggested approaches recorded in the story as strong starting suggestions rather than requirements, except where they record those binding commitments. Treat the current-state analysis as completed predecessor work to build on, correcting substantive factual flaws when necessary. Ground factual constraints in repository evidence. Prefer the simplest architecture that fulfills the binding scope; revise suggested approaches when a simpler one meets it. Keep behavior and edge-case coverage to what that scope requires. Surface any needed scope change as a decision for the user rather than adopting it unattended.`;
var ARCHITECTURE_REVIEW_CONTRACT = `${DESIGN_SCOPE}

Review the artifact through each of these sections:

- **Contradictions:** Decisions or claims that conflict with the story, verified current-state facts, repository constraints, applicable engineering guidance, another architectural decision, or the architecture's own boundaries and flows. Distinguish repository facts from proposed design choices.
- **Important Simplifications:** A simpler architecture that preserves the same story outcomes with fewer new components, abstractions, boundaries, state owners, or integration paths. Prefer existing extension seams and one clear source of authority. Explain which outcomes and quality drivers the simpler design preserves.
- **Missing Architectural Decisions:** Unsettled ownership, responsibilities, dependency direction, major success or failure flows, state authority, compatibility or transition policy, quality drivers, risks, assumptions, or story traceability that would force program design to invent or revise the system shape.
- **Other Significant Issues:** Feasibility problems, circular dependencies, duplicated authority, design choices presented as repository facts, unresolved branches passed downstream, weak evidence, inappropriate scope, and conflicts with applicable engineering guidance that do not fit the sections above.

For every finding, assign one severity and order findings by severity within each section:

- **Blocker:** The architecture cannot satisfy the story, contradicts a verified constraint, is internally incoherent, or would force downstream program design to replace the system shape. It must be corrected before acceptance.
- **Concern:** The issue creates material complexity, ambiguity, weak rationale, a missing architectural decision, or an unmitigated risk. It should be corrected or resolved through an evidence-backed response.
- **Optional:** A worthwhile local improvement that does not affect whether program design can safely proceed.

State "None." under a section with no findings. Consolidate findings with the same root cause. Give every Blocker and Concern concrete evidence and a clear correction target. Optional findings may coexist with closure; Blockers and Concerns may not. Keep findings within the binding scope above. A departure from an initial suggestion recorded in the story alone is not a defect.

Keep the review at the architecture boundary. Do not treat absent exact API signatures or routes, schema fields, concrete types, validation rules, detailed state machines, error taxonomies, algorithms, pseudocode, transaction or retry mechanics, or component-level collaboration as gaps unless their absence leaves ownership, boundary semantics, major behavior, or the system shape unresolved.`;
function initialWriterPrompt(input) {
  return withPromptFooter(`Design the target architecture for the supplied story and write the complete artifact at the requested path.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture artifact path: ${input.artifactPath}

${DESIGN_SCOPE}

Work unattended. Preserve the story, use the current-state analysis and repository as evidence, and converge on one recommended system shape within the binding scope. Finish with the architecture artifact ready for an independent review, making any unresolved user decision explicit. ${WRITER_INPUT_POLICY} If architecture work exposes a substantive flaw in the current-state analysis, correct that predecessor artifact and keep both artifacts coherent.`);
}
function reviewToWriterPrompt(review) {
  return withPromptFooter(`Here is the review of the target architecture:

${review}

${DESIGN_SCOPE}

Evaluate every finding against the binding scope, current-state analysis, and repository evidence. Update the architecture artifact wherever the review improves its correctness, simplicity, coherence, or decision quality within that scope. Correct the current-state artifact only when resolving a substantive predecessor flaw. Push back with concrete evidence and tradeoff reasoning when a finding is incorrect, expands the binding scope, treats a suggestion as a requirement, or would make the architecture worse. Finish with the artifacts ready for another independent review. ${WRITER_INPUT_POLICY}`);
}
function retryWriterPrompt() {
  return withPromptFooter(
    `Resume the architecture work from the current conversation, worktree, and artifacts. Reassess the original request against their current state, including whether any commands or delegated work from the previous turn are still running or have now completed. Preserve completed work, finish the requested writing or revision, verify the artifact, and provide a completed response for review. ${WRITER_INPUT_POLICY}`
  );
}
function continueWriterPrompt(review) {
  return withPromptFooter(`${WRITER_CONTINUATION_INSTRUCTIONS}${review ? `

Review to address:
${review}` : ""}`);
}
function initialReviewerPrompt(input) {
  return withPromptFooter(`Independently review the target architecture from first principles.

Repository: ${input.repositoryPath}
Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture artifact path: ${input.artifactPath}

Inspect the repository and predecessor artifact directly. Give concrete, actionable findings with retrievable evidence. Focus on whether the architecture is the simplest coherent system shape that satisfies the story and gives program design a stable boundary to elaborate.

${ARCHITECTURE_REVIEW_CONTRACT}

${REVIEWER_ESCALATION_AND_CLOSURE}`);
}
function writerToReviewerPrompt(writerResponse) {
  return withPromptFooter(`Here is the architecture writer's response to your review:

${writerResponse}

Re-review the current architecture from first principles. Verify claimed corrections directly, adjudicate pushback on its merits, inspect the current-state analysis wherever the architecture depends on it, and review the full architecture for remaining or newly introduced issues. Do not preserve a finding when the writer's evidence resolves it, and do not silently drop an unresolved finding.

${ARCHITECTURE_REVIEW_CONTRACT}

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
  return withPromptFooter(`You are an unattended routing judgment for an architecture writer.

Architecture artifact path: ${input.artifactPath}

Nonempty artifact file exists: ${input.artifactExists}

Writer response:
${input.writerResponse}

${WRITER_ROUTING_INSTRUCTIONS}`);
}
function reviewerRoutingPrompt(input) {
  return withPromptFooter(`You are an unattended routing judgment for an architecture reviewer.

Reviewer response:
${input.review}

${REVIEWER_ROUTING_INSTRUCTIONS}`);
}
function completeMessageText(message) {
  return message.parts.filter((part) => part.type === "text" && part.state !== "streaming").map((part) => part.text).join("\n").trim();
}

// src/graph.ts
var DesignArchitectureGraph = createReviewedArtifactGraph({
  key: "DesignArchitecture",
  title: "Design architecture",
  skill: "design-architecture",
  roles: { writer: "Architecture writer", reviewer: "Architecture reviewer" },
  roundLabel: "architecture review round",
  profiles: { writer, reviewer, writerJudgment, reviewerJudgment },
  phases: {
    writing: "Designing architecture",
    checkingWriter: "Checking architecture writer progress",
    reviewing: "Reviewing architecture",
    routingReview: "Routing architecture review",
    revising: "Revising architecture",
    rereviewing: "Re-reviewing architecture",
    recoveringWriter: "Recovering architecture writer",
    complete: "Architecture complete",
    failed: "Design architecture failed"
  },
  prompts: {
    initialWriter: initialWriterPrompt,
    reviewToWriter: reviewToWriterPrompt,
    retryWriter: retryWriterPrompt,
    continueWriter: continueWriterPrompt,
    initialReviewer: initialReviewerPrompt,
    writerToReviewer: writerToReviewerPrompt,
    writerRouting: writerRoutingPrompt,
    reviewerRouting: reviewerRoutingPrompt
  },
  parse: { writerRoute: parseWriterRoute, reviewerRoute: parseReviewerRoute },
  latestAssistantTurnText
});

// src/index.ts
var index_default = h({
  command: () => ({
    title: "Design Architecture",
    description: "Create and independently review a story-scoped target architecture.",
    inputs: [
      {
        kind: "text",
        key: "story",
        label: "Story or story URL",
        placeholder: "https://github.com/owner/repository/issues/123"
      },
      {
        kind: "text",
        key: "currentStatePath",
        label: "Current-state analysis path",
        placeholder: "scratch/current-state/issue-123.md"
      },
      {
        kind: "text",
        key: "artifactPath",
        label: "Architecture artifact path",
        placeholder: "scratch/architecture/issue-123.md"
      }
    ]
  }),
  parse: (_origin, inputs) => ({
    story: parseText(inputs.story, "story"),
    currentStatePath: parseText(inputs.currentStatePath, "currentStatePath"),
    artifactPath: parseText(inputs.artifactPath, "artifactPath")
  }),
  graph: DesignArchitectureGraph
});
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
export {
  index_default as default
};
