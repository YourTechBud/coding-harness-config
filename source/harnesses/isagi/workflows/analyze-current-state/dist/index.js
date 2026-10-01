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

// ../../workflow-libraries/common-graphs/src/fail-step.ts
async function failStep(ctx, feedback, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", ...feedback });
  await ctx.log("error", diagnostic);
  throw new Error(diagnostic);
}

// ../../workflow-libraries/common-graphs/src/reviewed-artifact.ts
function createReviewedArtifactGraph(config) {
  const writer2 = createWriterGraph(config);
  const review = createReviewGraph(config);
  return m({
    key: config.key,
    title: config.title,
    init: (_destination, context) => ({ context, writer: null, reviewer: null, writerResponse: null, review: null, reviewRound: 0, verdict: null, failure: null }),
    state: {
      context: c.replace(),
      writer: c.replace(),
      reviewer: c.replace(),
      writerResponse: c.replace(),
      review: c.replace(),
      reviewRound: c.replace(),
      verdict: c.replace(),
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
        onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { reviewer: output.reviewer, review: output.review, verdict: output.verdict, reviewRound: output.round }
      }),
      revise: u({
        graph: writer2,
        title: "Revise the artifact",
        parameters: (state) => ({ context: state.context, writer: must2(state.writer, "writer"), review: must2(state.review, "review") }),
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
        to: ["finish", "revise", "reportFailure"],
        choose: (state) => {
          if (state.failure) return { to: "reportFailure" };
          return { to: state.verdict === "complete" ? "finish" : "revise" };
        }
      }),
      afterRevise: f({ from: "revise", to: ["review", "reportFailure"], choose: (state) => ({ to: state.failure ? "reportFailure" : "review" }) }),
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
      mode: "normal",
      recoveredNewer: false,
      route: null,
      failure: null
    }),
    state: {
      repositoryPath: c.replace(),
      context: c.replace(),
      writer: c.replace(),
      review: c.replace(),
      turn: c.replace(),
      response: c.replace(),
      mode: c.replace(),
      recoveredNewer: c.replace(),
      route: c.replace(),
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
          prompt: config.prompts.reviewToWriter(must2(state.review, "review")),
          feedback: { phase: config.phases.revising },
          ...resubmit
        },
        onResult: (_state, turn) => ({ turn, writer: turn.agent })
      }),
      readResponse: l(async (ctx, state) => {
        const writer2 = must2(state.writer, "writer");
        const response = config.latestAssistantTurnText(await ctx.getConversationHistory(writer2.agentSessionId));
        if (response) return g({ update: { response } });
        return failStep(ctx, { phase: config.phases.failed, message: "No writer response was found" }, `writer session ${writer2.agentSessionId} has no complete assistant turn to inspect.`);
      }, { title: "Read the writer's reply" }),
      judge: u({
        graph: judgment,
        title: "Route the writer",
        parameters: (state) => ({
          label: "writer",
          profile: config.profiles.writerJudgment,
          prompt: config.prompts.writerRouting({ writerResponse: must2(state.response, "writer response"), artifactPath: state.context.artifactPath }),
          feedback: { phase: config.phases.checkingWriter }
        }),
        onResult: (_state, { output }) => ({ route: output.outcome === "judged" ? output.route : null })
      }),
      askUser: l(async (ctx, state) => {
        const writer2 = must2(state.writer, "writer");
        await ctx.setUiFeedback({ kind: "warning", phase: "The writer did not produce a reviewable artifact", message: "Resolve it with the writer, then select Continue." });
        await ctx.log("warning", `Writer session ${writer2.agentSessionId} did not complete its artifact turn. Latest response:
${must2(state.response, "writer response")}`);
        return _({ wait: y.userContinue("The writer did not produce a reviewable artifact. Resolve it with the writer, then Continue.") });
      }, { title: "Ask the user to resolve the writer" }),
      // A newer complete reply is judged without another prompt; otherwise the writer is nudged once.
      recover: l(async (ctx, state) => {
        const writer2 = must2(state.writer, "writer");
        const latest = config.latestAssistantTurnText(await ctx.getConversationHistory(writer2.agentSessionId));
        if (latest && latest !== state.response) {
          await ctx.log("info", `Found a newer complete turn in ${role.toLowerCase()} session ${writer2.agentSessionId}; routing the latest response.`);
          return g({ update: { response: latest, mode: "retry_recheck", recoveredNewer: true } });
        }
        return g({ update: { recoveredNewer: false } });
      }, { title: "Check for a newer writer reply" }),
      nudge: agentTurn({
        title: "Nudge the writer once",
        parameters: (state) => ({
          label: role,
          session: { kind: "existing", ...must2(state.writer, "writer") },
          prompt: config.prompts.retryWriter(),
          feedback: { phase: config.phases.recoveringWriter },
          ...resubmit
        }),
        onResult: (_state, turn) => ({ turn })
      })
    },
    edges: {
      afterPrompt: afterWriterTurn("prompt", role),
      afterReadResponse: f({ from: "readResponse", to: ["judge"], choose: () => ({ to: "judge" }) }),
      afterJudge: f({
        from: "judge",
        to: ["ready", "nudge", "askUser", "recover"],
        choose: (state) => {
          if (state.route === null) return { to: "recover" };
          if (state.route === "ready") return { to: "ready" };
          if (state.mode === "retry_recheck") return { to: "nudge", update: { mode: "normal" } };
          return { to: "askUser" };
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
      afterRecover: f({ from: "recover", to: ["judge", "nudge"], choose: (state) => ({ to: state.recoveredNewer ? "judge" : "nudge" }) }),
      afterNudge: afterWriterTurn("nudge", role, "readResponse")
    },
    outcomes: {
      ready: p({ kind: "success", title: "Writer ready", output: (state) => ({ outcome: "ready", writer: must2(state.writer, "writer"), response: must2(state.response, "writer response") }) }),
      failed: p({ kind: "failure", title: "Writer failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
    }
  });
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
    init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, review: null, verdict: null, failure: null }),
    state: {
      repositoryPath: c.replace(),
      context: c.replace(),
      reviewer: c.replace(),
      writerResponse: c.replace(),
      round: c.replace(),
      turn: c.replace(),
      review: c.replace(),
      verdict: c.replace(),
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
        onResult: (_state, { output }) => ({ verdict: output.outcome === "judged" ? output.route : null })
      }),
      askHuman: l(async (ctx, state) => {
        await ctx.setUiFeedback({ kind: "warning", phase: "Waiting for your decision", message: "The reviewer raised a human escalation. Resolve it with the reviewer, then continue the workflow." });
        await ctx.log("warning", `Reviewer raised a human escalation in ${config.roundLabel} ${state.round}.`);
        return _({ wait: y.userContinue() });
      }, { title: "Wait for your decision" })
    },
    edges: {
      afterPrompt: f({ from: "prompt", to: ["readReview", "failed"], choose: (state) => afterTurn(state, role, "readReview") }),
      afterReadReview: f({ from: "readReview", to: ["judge"], choose: () => ({ to: "judge" }) }),
      afterJudge: f({
        from: "judge",
        to: ["reviewed", "askHuman", "readReview"],
        choose: (state) => {
          if (state.verdict === null) return { to: "readReview" };
          return { to: state.verdict === "human-decision" ? "askHuman" : "reviewed" };
        }
      }),
      // After the human decision, the reviewer session's latest complete turn is judged again.
      afterAskHuman: f({
        from: "askHuman",
        to: ["readReview"],
        choose: (_state, event) => {
          if (event.kind !== "user_continue") throw new Error(`The human decision resumed with an unexpected ${event.kind} event.`);
          return { to: "readReview" };
        }
      })
    },
    outcomes: {
      reviewed: p({
        kind: "success",
        title: "Reviewed",
        output: (state) => {
          const verdict = must2(state.verdict, "verdict");
          if (verdict === "human-decision") throw new Error("A human decision cannot end a review round.");
          return { outcome: "reviewed", verdict, reviewer: must2(state.reviewer, "reviewer"), review: must2(state.review, "review"), round: state.round };
        }
      }),
      failed: p({ kind: "failure", title: "Review failed", output: (state) => ({ outcome: "failed", failure: must2(state.failure, "failure") }) })
    }
  });
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

// src/constants.ts
var writer = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var reviewer = {
  harness: "codex",
  model: "gpt-6.1-sol",
  effort: "medium"
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

// src/graph.ts
var AnalyzeCurrentStateGraph = createReviewedArtifactGraph({
  key: "AnalyzeCurrentState",
  title: "Analyze current state",
  skill: "analyze-current-state",
  roles: { writer: "Current-state writer", reviewer: "Current-state reviewer" },
  roundLabel: "review round",
  profiles: { writer, reviewer, writerJudgment, reviewerJudgment },
  phases: {
    writing: "Analyzing current state",
    checkingWriter: "Checking writer progress",
    reviewing: "Reviewing current-state analysis",
    routingReview: "Routing reviewer feedback",
    revising: "Revising current-state analysis",
    rereviewing: "Re-reviewing current-state analysis",
    recoveringWriter: "Recovering current-state writer",
    complete: "Current-state analysis complete",
    failed: "Analyze current state failed"
  },
  prompts: {
    initialWriter: initialWriterPrompt,
    reviewToWriter: reviewToWriterPrompt,
    retryWriter: retryWriterPrompt,
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
  parse: (_origin, inputs) => ({
    story: parseText(inputs.story, "story"),
    artifactPath: parseText(inputs.artifactPath, "artifactPath")
  }),
  graph: AnalyzeCurrentStateGraph
});
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}
export {
  index_default as default
};
