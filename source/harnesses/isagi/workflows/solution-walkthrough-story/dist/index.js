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
      let n = Array.isArray(t) ? t : [t], r = new Set(e), i4 = [...e];
      for (let e2 of n) r.has(e2) || (r.add(e2), i4.push(e2));
      return i4;
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
            let n2 = e(t2), i4 = r.findIndex((t3) => e(t3) === n2);
            i4 === -1 ? r.push(t2) : r[i4] = t2;
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

// src/graphs/context.ts
var SHOW_ME_MODIFIER = [{ kind: "skill", name: "show-me" }];
function promptInput(state) {
  return { repositoryPath: state.repositoryPath, ...state.context };
}
function must(value, label) {
  if (value === null) throw new Error(`Solution walkthrough state is missing its ${label}.`);
  return value;
}
function errorText(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if (record.reason !== void 0) return errorText(record.reason);
    if (record.message !== void 0) return errorText(record.message);
    if (record.error !== void 0) return errorText(record.error);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

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
      let n = Array.isArray(t) ? t : [t], r = new Set(e), i4 = [...e];
      for (let e2 of n) r.has(e2) || (r.add(e2), i4.push(e2));
      return i4;
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
            let n2 = e(t2), i4 = r.findIndex((t3) => e(t3) === n2);
            i4 === -1 ? r.push(t2) : r[i4] = t2;
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

// ../../workflow-libraries/common-graphs/src/agent-turn.ts
function ownedPane(agent) {
  if (agent.paneId === null) throw new Error(`Agent session ${agent.agentSessionId} has no pane owned by this workflow.`);
  return agent.paneId;
}
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
      const agent = must2(state.agent, "agent");
      const role = label.toLowerCase();
      await ctx.setUiFeedback({ kind: "warning", phase: `Retrying ${role}`, message: `The ${role} harness turn failed. Resubmitting its previous message.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: agent.agentSessionId, prompt, modifiers });
      await ctx.log("warning", `Resubmitted the previous message after harness_error ${state.resubmits + 1}/${state.request.resubmitOnHarnessError ?? 0} to ${role} session ${agent.agentSessionId}.`);
      return _2({ update: { turn: sent, resubmits: state.resubmits + 1 }, wait: y2.agentTurn(sent) });
    }, { title: "Resubmit after a harness error" }),
    askUser: l2(async (ctx, state) => {
      const { label } = state.request;
      const { paneId } = must2(state.agent, "agent");
      const where = paneId === null ? "its pane" : `pane ${paneId}`;
      await ctx.setUiFeedback({ kind: "warning", phase: `${label} stopped`, message: `Continue the agent in ${where} by hand until it finishes, then select Continue.` });
      await ctx.log("warning", must2(state.stalled, "stalled turn"));
      return _2({ wait: y2.userContinue(`${label} stopped. Continue the agent by hand, then Continue.`) });
    }, { title: "Ask the user to finish the agent" }),
    recheck: l2(async (_ctx, state) => _2({ wait: y2.agentTurn(must2(state.turn, "turn")) }), { title: "Check the latest turn" })
  },
  edges: {
    afterSend: f2({ from: "send", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterResubmit: f2({ from: "resubmit", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn }),
    afterAskUser: f2({ from: "askUser", to: ["recheck"], choose: () => ({ to: "recheck" }) }),
    afterRecheck: f2({ from: "recheck", to: ["ended", "resubmit", "askUser", "interrupted"], choose: routeTurn })
  },
  outcomes: {
    ended: p2({ kind: "success", title: "Turn ended", output: (state) => ({ outcome: "ended", agent: must2(state.agent, "agent") }) }),
    interrupted: p2({ kind: "failure", title: "Agent session ended", output: (state) => ({ outcome: "interrupted", agent: must2(state.agent, "agent"), reason: must2(state.interruption, "interruption") }) })
  }
});
function routeTurn(state, event) {
  const { label } = state.request;
  if (event.kind !== "agent_turn") throw new Error(`${label} resumed with an unexpected ${event.kind} event.`);
  const { agentSessionId, paneId } = must2(state.agent, "agent");
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
function must2(value, label) {
  if (value === null) throw new Error(`Agent turn state is missing its ${label}.`);
  return value;
}

// ../../workflow-libraries/common-graphs/src/fail-step.ts
async function failStep(ctx, feedback, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", ...feedback });
  await ctx.log("error", diagnostic);
  throw new Error(diagnostic);
}

// ../design-curriculum/src/graph.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve3 } from "node:path";

// ../design-curriculum/node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.1.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function i3(e) {
  return {
    isagiContract: 5,
    isagiKind: e
  };
}
function s3(e) {
  return {
    ...i3("state-field"),
    reduce: e.reduce
  };
}
var c3 = {
  replace() {
    return s3({ reduce: (e, t) => t });
  },
  add() {
    return s3({ reduce: (e, t) => e + t });
  },
  append() {
    return s3({ reduce: (e, t) => [...e, ...Array.isArray(t) ? t : [t]] });
  },
  union() {
    return s3({ reduce: (e, t) => {
      let n = Array.isArray(t) ? t : [t], r = new Set(e), i4 = [...e];
      for (let e2 of n) r.has(e2) || (r.add(e2), i4.push(e2));
      return i4;
    } });
  },
  collection(e) {
    return s3({ reduce: (t, n) => {
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
            let n2 = e(t2), i4 = r.findIndex((t3) => e(t3) === n2);
            i4 === -1 ? r.push(t2) : r[i4] = t2;
          }
          return r;
        }
      }
    } });
  },
  optional() {
    return s3({ reduce: (e, t) => "clear" in t ? null : t.set });
  },
  custom(e) {
    return s3({ reduce: e });
  }
};
function l3(e, t) {
  return {
    ...i3("operation-node"),
    title: t?.title,
    description: t?.description,
    label: t?.label,
    run: e
  };
}
function f3(e) {
  return {
    ...i3("edge"),
    from: e.from,
    to: e.to,
    choose: e.choose,
    title: e.title
  };
}
function p3(e) {
  return {
    ...i3("outcome"),
    kind: e.kind,
    reason: e.reason,
    title: e.title,
    output: e.output
  };
}
function m3(e) {
  return {
    ...i3("graph"),
    ...e
  };
}
function g3(e) {
  return e && "update" in e ? {
    ...i3("operation-result"),
    type: "complete",
    update: e.update
  } : {
    ...i3("operation-result"),
    type: "complete"
  };
}

// ../design-curriculum/src/constants.ts
var curriculumDesigner = {
  harness: "codex",
  model: "gpt-6.1-sol",
  effort: "high"
};

// ../design-curriculum/src/contracts.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ../design-curriculum/src/types.ts
var coverageRoles = ["primary", "supporting", "reference"];
var coverageVisibilities = ["required", "optional"];
var cognitionBudgetConstraints = ["outcome-limit", "neighborhood-limit"];

// ../design-curriculum/src/contracts.ts
function readAnalysis(repositoryPath, learningGoal, audience, sources, paths) {
  const value = object(readJson(repositoryPath, paths.analysisPath), "curriculum analysis");
  if (value.schemaVersion !== 3) throw new Error("curriculum analysis schemaVersion must be 3.");
  if (value.learningGoal !== learningGoal) throw new Error("curriculum analysis learningGoal must match the workflow input.");
  const parsedAudience = parseAudience(value.audience, "curriculum analysis audience");
  if (!sameAudience(parsedAudience, audience)) throw new Error("curriculum analysis audience must match the workflow input.");
  const parsedSources = parseSources(value.sources, "curriculum analysis sources");
  if (JSON.stringify(parsedSources) !== JSON.stringify(sources)) throw new Error("curriculum analysis sources must match the workflow inputs.");
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, "curriculum analysis guidingQuestions");
  if (guidingQuestions.length === 0) throw new Error("curriculum analysis requires at least one guiding question.");
  const questionIds = new Set(guidingQuestions.map(({ id }) => id));
  const coverageItems = array(value.coverageItems, "curriculum analysis coverageItems").map((item, index) => parseCoverageItem(item, index, sources, questionIds));
  if (coverageItems.length === 0) throw new Error("curriculum analysis requires at least one coverage item.");
  unique(coverageItems.map(({ id }) => id), "curriculum coverage item IDs");
  const itemIds = new Set(coverageItems.map(({ id }) => id));
  for (const item of coverageItems) {
    for (const prerequisite of item.prerequisiteItemIds) if (!itemIds.has(prerequisite)) throw new Error(`Coverage item ${item.id} references unknown prerequisite ${prerequisite}.`);
  }
  for (const question of guidingQuestions) {
    if (!coverageItems.some((item) => item.guidingQuestionIds.includes(question.id))) throw new Error(`Guiding question ${question.id} is not represented by any coverage item.`);
  }
  return { schemaVersion: 3, learningGoal, audience, sources, guidingQuestions, coverageItems };
}
function readCurriculum(repositoryPath, teachingBrief, paths, analysis) {
  const value = object(readJson(repositoryPath, paths.curriculumPath), "curriculum");
  if (value.schemaVersion !== 3) throw new Error("curriculum schemaVersion must be 3.");
  if (value.analysisPath !== paths.analysisPath || value.learningGoal !== analysis.learningGoal || value.teachingBrief !== teachingBrief) throw new Error("curriculum inputs must match the workflow inputs.");
  const audience = parseAudience(value.audience, "curriculum audience");
  if (!sameAudience(audience, analysis.audience)) throw new Error("curriculum audience must match the analysis.");
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, "curriculum guidingQuestions");
  if (JSON.stringify(guidingQuestions) !== JSON.stringify(analysis.guidingQuestions)) throw new Error("curriculum guidingQuestions must match the analysis.");
  const storylineValue = object(value.storyline, "curriculum storyline");
  const cognitionBudget = parseCognitionBudget(value.cognitionBudget);
  const neighborhoods = array(value.neighborhoods, "curriculum neighborhoods").map((neighborhood, index) => parseNeighborhood(neighborhood, index, analysis));
  if (neighborhoods.length === 0) throw new Error("curriculum requires at least one neighborhood.");
  unique(neighborhoods.map(({ id }) => id), "curriculum neighborhood IDs");
  const omissions = array(value.omissions, "curriculum omissions").map((omission, index) => {
    const parsed = object(omission, `curriculum omission ${index + 1}`);
    return { itemId: kebab(parsed.itemId, `curriculum omission ${index + 1} itemId`), reason: text(parsed.reason, `curriculum omission ${index + 1} reason`) };
  });
  validateCurriculum(neighborhoods, omissions, analysis);
  return {
    schemaVersion: 3,
    analysisPath: paths.analysisPath,
    learningGoal: analysis.learningGoal,
    audience,
    teachingBrief,
    guidingQuestions,
    storyline: {
      title: text(storylineValue.title, "curriculum storyline title"),
      throughline: text(storylineValue.throughline, "curriculum storyline throughline"),
      rationale: text(storylineValue.rationale, "curriculum storyline rationale")
    },
    cognitionBudget,
    neighborhoods,
    omissions
  };
}
function assertArtifact(repositoryPath, artifactPath) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`Expected curriculum artifact ${artifactPath} was not created.`);
}
function parseCoverageItem(value, index, sources, questionIds) {
  const label = `curriculum coverage item ${index + 1}`;
  const item = object(value, label);
  const guidingQuestionIds = strings(item.guidingQuestionIds, `${label} guidingQuestionIds`);
  if (guidingQuestionIds.length === 0) throw new Error(`${label} requires guidingQuestionIds.`);
  unique(guidingQuestionIds, `${label} guidingQuestionIds`);
  for (const questionId of guidingQuestionIds) if (!questionIds.has(questionId)) throw new Error(`${label} references unknown guiding question ${questionId}.`);
  const details = strings(item.details, `${label} details`);
  if (details.length === 0) throw new Error(`${label} requires details.`);
  const sourceReferences = sourceReferencesFor(item.sourceReferences, `${label} sourceReferences`, sources);
  if (sourceReferences.length === 0) throw new Error(`${label} requires sourceReferences.`);
  return {
    id: kebab(item.id, `${label} id`),
    title: text(item.title, `${label} title`),
    kind: text(item.kind, `${label} kind`),
    significance: text(item.significance, `${label} significance`),
    details,
    guidingQuestionIds,
    prerequisiteItemIds: strings(item.prerequisiteItemIds, `${label} prerequisiteItemIds`),
    sourceReferences
  };
}
function parseCognitionBudget(value) {
  const budget = object(value, "curriculum cognitionBudget");
  const exceptions = array(budget.exceptions, "curriculum cognitionBudget exceptions").map((exception, index) => {
    const parsed = object(exception, `curriculum cognitionBudget exception ${index + 1}`);
    return { constraint: enumeration(parsed.constraint, cognitionBudgetConstraints, `curriculum cognitionBudget exception ${index + 1} constraint`), reason: text(parsed.reason, `curriculum cognitionBudget exception ${index + 1} reason`) };
  });
  unique(exceptions.map(({ constraint }) => constraint), "curriculum cognitionBudget exception constraints");
  return {
    outcomeLimit: positiveInteger(budget.outcomeLimit, "curriculum cognitionBudget outcomeLimit"),
    neighborhoodLimit: positiveInteger(budget.neighborhoodLimit, "curriculum cognitionBudget neighborhoodLimit"),
    exceptions
  };
}
function parseNeighborhood(value, neighborhoodIndex, analysis) {
  const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
  const neighborhood = object(value, label);
  const knownQuestionIds = new Set(analysis.guidingQuestions.map(({ id }) => id));
  const knownItemIds = new Set(analysis.coverageItems.map(({ id }) => id));
  const outcomes = array(neighborhood.outcomes, `${label} outcomes`).map((value2, outcomeIndex) => {
    const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
    const outcome = object(value2, outcomeLabel);
    const guidingQuestionIds = strings(outcome.guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    if (guidingQuestionIds.length === 0) throw new Error(`${outcomeLabel} requires guidingQuestionIds.`);
    unique(guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    for (const questionId of guidingQuestionIds) if (!knownQuestionIds.has(questionId)) throw new Error(`${outcomeLabel} references unknown guiding question ${questionId}.`);
    const coverage = array(outcome.coverage, `${outcomeLabel} coverage`).map((entry, coverageIndex) => {
      const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
      const parsed = object(entry, coverageLabel);
      const itemId = kebab(parsed.itemId, `${coverageLabel} itemId`);
      if (!knownItemIds.has(itemId)) throw new Error(`${coverageLabel} references unknown coverage item ${itemId}.`);
      return {
        itemId,
        role: enumeration(parsed.role, coverageRoles, `${coverageLabel} role`),
        visibility: enumeration(parsed.visibility, coverageVisibilities, `${coverageLabel} visibility`),
        rationale: text(parsed.rationale, `${coverageLabel} rationale`)
      };
    });
    if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
    return {
      id: kebab(outcome.id, `${outcomeLabel} id`),
      title: text(outcome.title, `${outcomeLabel} title`),
      objective: text(outcome.objective, `${outcomeLabel} objective`),
      guidingQuestionIds,
      prerequisiteOutcomeIds: strings(outcome.prerequisiteOutcomeIds, `${outcomeLabel} prerequisiteOutcomeIds`),
      coverage
    };
  });
  if (outcomes.length === 0) throw new Error(`${label} requires outcomes.`);
  return {
    id: kebab(neighborhood.id, `${label} id`),
    title: text(neighborhood.title, `${label} title`),
    purpose: text(neighborhood.purpose, `${label} purpose`),
    narrativeBridge: text(neighborhood.narrativeBridge, `${label} narrativeBridge`),
    outcomes
  };
}
function validateCurriculum(neighborhoods, omissions, analysis) {
  const outcomes = neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
  unique(outcomes.map(({ id }) => id), "curriculum outcome IDs");
  const encounteredOutcomeIds = /* @__PURE__ */ new Set();
  for (const outcome of outcomes) {
    for (const prerequisiteId of outcome.prerequisiteOutcomeIds) if (!encounteredOutcomeIds.has(prerequisiteId)) throw new Error(`Outcome ${outcome.id} prerequisite ${prerequisiteId} must appear earlier.`);
    encounteredOutcomeIds.add(outcome.id);
  }
  const accountedItemIds = [
    ...outcomes.flatMap((outcome) => outcome.coverage.map(({ itemId }) => itemId)),
    ...omissions.map(({ itemId }) => itemId)
  ];
  unique(accountedItemIds, "accounted curriculum coverage item IDs");
  const expectedItemIds = analysis.coverageItems.map(({ id }) => id);
  if (accountedItemIds.length !== expectedItemIds.length || expectedItemIds.some((id) => !accountedItemIds.includes(id))) throw new Error("curriculum must map or omit every analysis coverage item exactly once.");
  for (const omission of omissions) if (!expectedItemIds.includes(omission.itemId)) throw new Error(`Curriculum omission references unknown coverage item ${omission.itemId}.`);
  const representedQuestions = new Set(outcomes.flatMap((outcome) => outcome.guidingQuestionIds));
  for (const question of analysis.guidingQuestions) if (!representedQuestions.has(question.id)) throw new Error(`Curriculum does not address guiding question ${question.id}.`);
}
function sourceReferencesFor(value, label, sources) {
  return array(value, label).map((reference, index) => {
    const sourceId2 = typeof reference === "string" ? text(reference, `${label}[${index}]`) : text(object(reference, `${label}[${index}]`).sourceId, `${label}[${index}].sourceId`);
    if (!sources.some(({ id }) => id === sourceId2)) throw new Error(`${label}[${index}] references unknown source ${sourceId2}.`);
    return { sourceId: sourceId2 };
  });
}
function parseGuidingQuestions(value, label) {
  const questions = array(value, label).map((question, index) => {
    const parsed = object(question, `${label}[${index}]`);
    return { id: kebab(parsed.id, `${label}[${index}].id`), question: text(parsed.question, `${label}[${index}].question`), whyItMatters: text(parsed.whyItMatters, `${label}[${index}].whyItMatters`) };
  });
  unique(questions.map(({ id }) => id), `${label} IDs`);
  return questions;
}
function parseAudience(value, label) {
  const audience = object(value, label);
  return { familiarity: text(audience.familiarity, `${label} familiarity`), depth: text(audience.depth, `${label} depth`) };
}
function parseSources(value, label) {
  return array(value, label).map((source, index) => {
    const parsed = object(source, `${label}[${index}]`);
    return { id: kebab(parsed.id, `${label}[${index}].id`), path: text(parsed.path, `${label}[${index}].path`), description: nullableText(parsed.description, `${label}[${index}].description`) };
  });
}
function readJson(repositoryPath, artifactPath) {
  assertArtifact(repositoryPath, artifactPath);
  try {
    return JSON.parse(readFileSync(resolve(repositoryPath, artifactPath), "utf8"));
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function strings(value, label) {
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}
function nullableText(value, label) {
  if (value === null) return null;
  return text(value, label);
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}
function kebab(value, label) {
  const result = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function enumeration(value, allowed, label) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
}
function sameAudience(left, right) {
  return left.familiarity === right.familiarity && left.depth === right.depth;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// ../design-curriculum/src/inputs.ts
import { existsSync as existsSync2, realpathSync, statSync as statSync2 } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve as resolve2 } from "node:path";
function parseInputs(repositoryPath, variables) {
  const sources = parseSources2(variables.sources);
  for (const source of sources) assertSourceFile(repositoryPath, source.path);
  const outputDirectory = relativePath(variables.outputDirectory, "outputDirectory", "scratch/story/curriculum");
  assertInsideRepository(repositoryPath, outputDirectory, "outputDirectory");
  return {
    repositoryPath,
    sources,
    learningGoal: text2(variables.learningGoal, "learningGoal"),
    audience: {
      familiarity: text2(variables.audienceFamiliarity, "audienceFamiliarity"),
      depth: text2(variables.audienceDepth, "audienceDepth")
    },
    teachingBrief: optionalText(variables.teachingBrief) ?? "Choose the clearest storyline for this audience and learning goal.",
    paths: {
      outputDirectory,
      analysisPath: `${outputDirectory}/curriculum-analysis.json`,
      curriculumPath: `${outputDirectory}/curriculum.json`
    }
  };
}
function parseSources2(value) {
  const raw = typeof value === "string" ? value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : value;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("sources must contain at least one Markdown path.");
  const sources = raw.map((item, index) => parseSource(item, index));
  unique2(sources.map(({ id }) => id), "source IDs");
  unique2(sources.map(({ path }) => path), "source paths");
  return sources;
}
function parseSource(value, index) {
  if (typeof value === "string") {
    const path = relativePath(value, `sources[${index}]`);
    return { id: sourceId(path), path, description: null };
  }
  const record = exactRecord(value, ["id", "path", "description"], `sources[${index}]`);
  return {
    id: kebab2(record.id, `sources[${index}].id`),
    path: relativePath(record.path, `sources[${index}].path`),
    description: nullableText2(record.description, `sources[${index}].description`)
  };
}
function assertSourceFile(repositoryPath, path) {
  assertInsideRepository(repositoryPath, path, "source path");
  if (extname(path).toLocaleLowerCase("en-US") !== ".md") throw new Error(`Source ${path} must be a Markdown file.`);
  const absolute = resolve2(repositoryPath, path);
  if (!existsSync2(absolute) || !statSync2(absolute).isFile()) throw new Error(`Source Markdown file ${path} does not exist.`);
  const repositoryRealPath = realpathSync(repositoryPath);
  const sourceRealPath = realpathSync(absolute);
  const fromRepository = relative(repositoryRealPath, sourceRealPath);
  if (fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepository)) throw new Error(`Source ${path} resolves outside the repository.`);
}
function assertInsideRepository(repositoryPath, path, label) {
  const fromRepository = relative(resolve2(repositoryPath), resolve2(repositoryPath, path));
  if (fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepository)) throw new Error(`${label} must stay inside the repository.`);
}
function sourceId(path) {
  const stem = basename(path, extname(path)).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!stem) throw new Error(`Could not derive a source ID from ${path}. Pass an object with an explicit id.`);
  return stem;
}
function relativePath(value, label, fallback) {
  const path = value === void 0 ? fallback : value;
  const result = text2(path, label);
  if (isAbsolute(result)) throw new Error(`${label} must be workspace-relative.`);
  return result.replaceAll("\\", "/").replace(/\/$/u, "");
}
function text2(value, label) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${label} must be non-empty text.`);
}
function optionalText(value) {
  if (value === void 0 || value === null || value === "") return null;
  return text2(value, "teachingBrief");
}
function nullableText2(value, label) {
  if (value === null) return null;
  return text2(value, label);
}
function kebab2(value, label) {
  const result = text2(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function exactRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new Error(`${label} must contain exactly: ${keys.join(", ")}.`);
  return record;
}
function unique2(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// ../design-curriculum/src/prompts.ts
var CURRICULUM_CONVENTIONS = `Curriculum conventions:
- Produce a planning handoff for a downstream technical architect or content architect, not audience-facing copy.
- Keep the learning path small while preserving a complete inventory of consequential concepts, artifacts, contracts, evidence, and decisions.
- Organize related coverage into contextual neighborhoods and outcomes. The source-file boundaries do not determine the curriculum.
- Role and visibility answer different questions. Primary coverage creates an outcome, supporting coverage helps explain it, and reference coverage is a concrete artifact or evidence to inspect. Required coverage must reach the audience in some form; optional coverage may remain available as additional detail.
- A consequential contract can be reference coverage and still be required. Database schemas, APIs, wire contracts, events, state machines, security policies, and similar decision evidence do not need separate outcomes, but they must not disappear.
- Aim to stay within 6 outcomes and 5 neighborhoods. These are cognition guides for the learning path, not quotas or limits on the coverage inventory.
- Choose the clearest storyline for the learning goal, audience, sources, and teaching brief. Explain the choice without applying a predetermined teaching template.`;
var UNATTENDED_FOOTER = `Work unattended and finish the requested file in this turn. Inspect the actual Markdown sources and audit the completed JSON against the requested shape before reporting completion.`;
function analysisPrompt(input) {
  return `Analyze the supplied Markdown sources for a curriculum handoff.

Repository: ${input.repositoryPath}
Learning goal: ${input.learningGoal}
Audience familiarity: ${input.audience.familiarity}
Audience depth: ${input.audience.depth}
Sources: ${JSON.stringify(input.sources, null, 2)}
Output: ${input.paths.analysisPath}

Derive the smallest useful set of questions whose answers would satisfy the learning goal. Then build a complete coverage inventory of the source-supported concepts, artifacts, evidence, and decisions a downstream architect may need.

Each coverage item should be distinct enough that its downstream representation obligation is unambiguous. Consolidate repeated explanation, but do not hide consequential artifacts inside a broad topic. For technical sources, identify consequential database schemas, APIs, wire contracts, events, state machines, configuration boundaries, security policies, operational flows, tradeoffs, and verification evidence by name when they affect understanding or approval. Use a concise descriptive kind appropriate to the subject rather than treating those examples as a universal checklist.

This turn identifies coverage. It does not choose neighborhoods, learning outcomes, roles, visibility, or omissions.

Write one JSON object using this shape:
{
  "schemaVersion": 3,
  "learningGoal": ${JSON.stringify(input.learningGoal)},
  "audience": ${JSON.stringify(input.audience)},
  "sources": ${JSON.stringify(input.sources)},
  "guidingQuestions": [{
    "id": "short-kebab-id",
    "question": "Question the audience must be able to answer",
    "whyItMatters": "How the answer contributes to the learning goal"
  }],
  "coverageItems": [{
    "id": "short-kebab-id",
    "title": "Concept or artifact name",
    "kind": "A concise subject-appropriate kind",
    "significance": "Why this item affects understanding or judgment",
    "details": ["Enough grounded detail for a downstream architect to know what must be represented"],
    "guidingQuestionIds": ["guiding-question-id"],
    "prerequisiteItemIds": [],
    "sourceReferences": ["source-id"]
  }]
}

IDs are unique kebab-case. Every coverage item contributes to at least one guiding question and cites at least one supplied source ID. Prerequisites reference items in this file. Every guiding question is represented by at least one coverage item. The repeated learningGoal, audience, and sources keep the artifact self-describing and protect against stale output. Write only ${input.paths.analysisPath}.

${UNATTENDED_FOOTER}`;
}
function curriculumPrompt(input, analysis) {
  return `Create the final curriculum handoff from the completed coverage analysis.

Learning goal: ${input.learningGoal}
Audience familiarity: ${input.audience.familiarity}
Audience depth: ${input.audience.depth}
Teaching brief: ${input.teachingBrief}
Analysis: ${input.paths.analysisPath}
Analysis scope: ${analysis.guidingQuestions.length} guiding questions and ${analysis.coverageItems.length} coverage items
Output: ${input.paths.curriculumPath}

${CURRICULUM_CONVENTIONS}

Choose the storyline, neighborhoods, outcomes, and disposition of every coverage item together. Give each mapped item one contextual home. The downstream architect can combine several required items into one representation; required does not mean a dedicated outcome or slide.

Use role to describe how an item contributes to its outcome:
- primary: creates the understanding or judgment expressed by the outcome
- supporting: helps explain or substantiate the primary understanding
- reference: a concrete artifact, contract, evidence set, or exact detail to inspect

Use visibility independently:
- required: the downstream artifact must make it available to the audience
- optional: it may remain additional detail without weakening the learning goal

Consequential contracts and decision evidence are normally required even when their role is reference. Omit an item only when it does not affect this audience's learning goal.

Write one JSON object using this shape:
{
  "schemaVersion": 3,
  "analysisPath": ${JSON.stringify(input.paths.analysisPath)},
  "learningGoal": ${JSON.stringify(input.learningGoal)},
  "audience": ${JSON.stringify(input.audience)},
  "teachingBrief": ${JSON.stringify(input.teachingBrief)},
  "guidingQuestions": ${JSON.stringify(analysis.guidingQuestions)},
  "storyline": {
    "title": "Curriculum title",
    "throughline": "The idea connecting the learning path",
    "rationale": "Why this storyline fits the inputs"
  },
  "cognitionBudget": {
    "outcomeLimit": 6,
    "neighborhoodLimit": 5,
    "exceptions": [{ "constraint": "outcome-limit", "reason": "Why an additional outcome protects understanding" }]
  },
  "neighborhoods": [{
    "id": "short-kebab-id",
    "title": "Contextual neighborhood",
    "purpose": "What this neighborhood establishes",
    "narrativeBridge": "How it follows and prepares what comes next",
    "outcomes": [{
      "id": "short-kebab-id",
      "title": "Outcome title",
      "objective": "The understanding or judgment this outcome creates",
      "guidingQuestionIds": ["question addressed by this outcome"],
      "prerequisiteOutcomeIds": [],
      "coverage": [{
        "itemId": "coverage-item-id",
        "role": "reference",
        "visibility": "required",
        "rationale": "Why this item belongs here and must remain inspectable"
      }]
    }]
  }],
  "omissions": [{ "itemId": "coverage-item-id", "reason": "Why it does not affect the learning goal" }]
}

Copy guidingQuestions unchanged from the analysis. Budget exceptions use outcome-limit or neighborhood-limit and are needed only when the corresponding guide is exceeded. Neighborhood and outcome IDs are unique kebab-case. Prerequisite outcomes appear earlier. Map every analysis coverage item exactly once through one outcome or one omission. Preserve the analysis details by reference rather than rewriting them into presentation copy. Write only ${input.paths.curriculumPath}.

${UNATTENDED_FOOTER}`;
}

// ../design-curriculum/src/graph.ts
function designCurriculumParameters(repositoryPath, variables) {
  const { repositoryPath: _repositoryPath, ...parameters } = parseInputs(repositoryPath, variables);
  return parameters;
}
var DesignCurriculumGraph = m3({
  key: "DesignCurriculum",
  title: "Design curriculum",
  init: (destination, parameters) => ({
    input: { ...parameters, repositoryPath: destination.worktreePath },
    designer: null,
    turn: null,
    analysis: null,
    created: null,
    failure: null
  }),
  state: {
    input: c3.replace(),
    designer: c3.replace(),
    turn: c3.replace(),
    analysis: c3.replace(),
    created: c3.replace(),
    failure: c3.replace()
  },
  entry: "prepareOutput",
  nodes: {
    prepareOutput: l3(async (_ctx, state) => {
      mkdirSync(resolve3(state.input.repositoryPath, state.input.paths.outputDirectory), { recursive: true });
      return g3();
    }, { title: "Prepare the output directory" }),
    analyzeSources: agentTurn({
      title: "Analyze the curriculum sources",
      parameters: (state) => ({
        label: "Curriculum analysis",
        session: { kind: "spawn", ...curriculumDesigner },
        prompt: analysisPrompt(state.input),
        feedback: { phase: "Analyzing curriculum sources" }
      }),
      onResult: (_state, turn) => ({ designer: turn.agent, turn })
    }),
    // An invalid artifact fails the step: fix it with the designer, then Retry reads it again.
    readAnalysis: l3(async (ctx, state) => {
      try {
        const analysis = readAnalysis(state.input.repositoryPath, state.input.learningGoal, state.input.audience, state.input.sources, state.input.paths);
        return g3({ update: { analysis } });
      } catch (error) {
        return failStep(ctx, { phase: "Curriculum design failed", message: "The curriculum analysis artifact is invalid. Its pane remains open." }, errorText2(error));
      }
    }, { title: "Read the curriculum analysis" }),
    designCurriculum: agentTurn({
      title: "Design the curriculum",
      parameters: (state) => ({
        label: "Curriculum design",
        session: { kind: "existing", ...must3(state.designer, "designer") },
        prompt: curriculumPrompt(state.input, must3(state.analysis, "analysis")),
        feedback: { phase: "Designing the curriculum", message: "Organizing outcomes and coverage obligations." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    finish: l3(async (ctx, state) => {
      const analysis = must3(state.analysis, "analysis");
      let created;
      try {
        const curriculum = readCurriculum(state.input.repositoryPath, state.input.teachingBrief, state.input.paths, analysis);
        const outcomes = curriculum.neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
        const coverage = outcomes.flatMap((outcome) => outcome.coverage);
        created = {
          outcome: "curriculum-created",
          analysisPath: state.input.paths.analysisPath,
          curriculumPath: state.input.paths.curriculumPath,
          sourceCount: state.input.sources.length,
          coverageItemCount: analysis.coverageItems.length,
          primaryCoverageCount: coverage.filter(({ role }) => role === "primary").length,
          supportingCoverageCount: coverage.filter(({ role }) => role === "supporting").length,
          referenceCoverageCount: coverage.filter(({ role }) => role === "reference").length,
          requiredCoverageCount: coverage.filter(({ visibility }) => visibility === "required").length,
          optionalCoverageCount: coverage.filter(({ visibility }) => visibility === "optional").length,
          omissionCount: curriculum.omissions.length,
          neighborhoodCount: curriculum.neighborhoods.length,
          outcomeCount: outcomes.length,
          budgetExceptionCount: curriculum.cognitionBudget.exceptions.length
        };
      } catch (error) {
        return failStep(ctx, { phase: "Curriculum design failed", message: "The curriculum artifact is invalid. Its pane remains open." }, errorText2(error));
      }
      await ctx.closePane(ownedPane(must3(state.designer, "designer")));
      return g3({ update: { created } });
    }, { title: "Read the curriculum and close the designer" }),
    reportFailure: l3(async (ctx, state) => {
      const failure = must3(state.failure, "failure");
      await ctx.setUiFeedback({ kind: "error", phase: "Curriculum design failed", message: failure.message });
      await ctx.log("error", failure.diagnostic);
      return g3();
    }, { title: "Report the failure" })
  },
  edges: {
    afterPrepareOutput: f3({ from: "prepareOutput", to: ["analyzeSources"], choose: () => ({ to: "analyzeSources" }) }),
    afterAnalyzeSources: afterAgentTurn("analyzeSources", "readAnalysis", "Curriculum analysis failed because the designer session ended."),
    afterReadAnalysis: f3({ from: "readAnalysis", to: ["designCurriculum"], choose: () => ({ to: "designCurriculum" }) }),
    afterDesignCurriculum: afterAgentTurn("designCurriculum", "finish", "Curriculum design failed because the designer session ended."),
    afterFinish: f3({ from: "finish", to: ["created"], choose: () => ({ to: "created" }) }),
    afterReportFailure: f3({ from: "reportFailure", to: ["failed"], choose: () => ({ to: "failed" }) })
  },
  outcomes: {
    created: p3({ kind: "success", title: "Curriculum created", output: (state) => must3(state.created, "created curriculum") }),
    failed: p3({ kind: "failure", title: "Curriculum design failed", output: (state) => ({ outcome: "failed", reason: must3(state.failure, "failure").diagnostic }) })
  }
});
function afterAgentTurn(from, next, message) {
  return f3({
    from,
    to: [next, "reportFailure"],
    choose: (state) => {
      const turn = must3(state.turn, "agent turn");
      if (turn.outcome === "interrupted") return { to: "reportFailure", update: { failure: { message, diagnostic: turn.reason } } };
      return { to: next };
    }
  });
}
function must3(value, label) {
  if (value === null) throw new Error(`Design curriculum state is missing its ${label}.`);
  return value;
}
function errorText2(value) {
  return value instanceof Error ? value.message : String(value);
}

// src/curriculum-v3.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, rmSync, statSync as statSync3 } from "node:fs";
import { resolve as resolve4 } from "node:path";
var coverageRoles2 = ["primary", "supporting", "reference"];
var coverageVisibilities2 = ["required", "optional"];
function deckPlanExists(repositoryPath, paths) {
  return artifactExists(repositoryPath, paths.deckPlanPath);
}
function inspectPlanningArtifacts(repositoryPath, paths) {
  const analysisExists = artifactExists(repositoryPath, paths.curriculumAnalysisPath);
  const curriculumExists = artifactExists(repositoryPath, paths.curriculumPath);
  const planExists = artifactExists(repositoryPath, paths.deckPlanPath);
  if (!analysisExists && !curriculumExists) {
    if (planExists) throw new Error("deck plan exists without its curriculum artifacts.");
    return { curriculum: false, deckPlan: false };
  }
  if (analysisExists !== curriculumExists) throw new Error("curriculum analysis and curriculum must either both exist or both be absent.");
  const bundle = readGenericCurriculumBundle(repositoryPath, paths);
  if (!planExists) return { curriculum: true, deckPlan: false };
  readArchitectedDeckPlan(repositoryPath, paths, bundle);
  return { curriculum: true, deckPlan: true };
}
function removePlanningArtifacts(repositoryPath, paths) {
  const removed = [];
  for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
    const absolutePath = resolve4(repositoryPath, artifactPath);
    if (!existsSync3(absolutePath)) continue;
    rmSync(absolutePath, { force: true });
    removed.push(artifactPath);
  }
  return removed;
}
function readGenericCurriculumBundle(repositoryPath, paths) {
  const curriculum = parseCurriculum(readJson2(repositoryPath, paths.curriculumPath), paths);
  const analysis = parseAnalysis(readJson2(repositoryPath, curriculum.analysisPath));
  validateCurriculum2(curriculum, analysis);
  return { curriculum, analysis };
}
function readArchitectedDeckPlan(repositoryPath, paths, bundle) {
  return parseDeckPlan(readJson2(repositoryPath, paths.deckPlanPath), paths, bundle);
}
function parseAnalysis(value) {
  const record = object2(value, "curriculum analysis");
  if (record.schemaVersion !== 3) throw new Error("curriculum analysis schemaVersion must be 3.");
  const coverageItems = array2(record.coverageItems, "curriculum analysis coverageItems").map((value2, index) => {
    const label = `curriculum analysis coverage item ${index + 1}`;
    const item = object2(value2, label);
    const sourceReferences = array2(item.sourceReferences, `${label} sourceReferences`).map((value3, referenceIndex) => {
      const reference = typeof value3 === "string" ? { sourceId: value3 } : object2(value3, `${label} source reference ${referenceIndex + 1}`);
      return { sourceId: text3(reference.sourceId, `${label} source reference ${referenceIndex + 1} sourceId`) };
    });
    if (sourceReferences.length === 0) throw new Error(`${label} requires source references.`);
    return {
      id: kebab3(item.id, `${label} id`),
      title: text3(item.title, `${label} title`),
      kind: text3(item.kind, `${label} kind`),
      significance: text3(item.significance, `${label} significance`),
      details: nonEmptyStrings(item.details, `${label} details`),
      sourceReferences
    };
  });
  if (coverageItems.length === 0) throw new Error("curriculum analysis requires coverage items.");
  unique3(coverageItems.map(({ id }) => id), "curriculum analysis coverage item IDs");
  return { schemaVersion: 3, coverageItems };
}
function parseCurriculum(value, paths) {
  const record = object2(value, "curriculum");
  if (record.schemaVersion !== 3) throw new Error("curriculum schemaVersion must be 3.");
  const analysisPath = text3(record.analysisPath, "curriculum analysisPath");
  if (analysisPath !== paths.curriculumAnalysisPath) {
    throw new Error(`curriculum analysisPath must be ${paths.curriculumAnalysisPath}.`);
  }
  const storyline = object2(record.storyline, "curriculum storyline");
  const neighborhoods = array2(record.neighborhoods, "curriculum neighborhoods").map((value2, neighborhoodIndex) => {
    const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object2(value2, label);
    const outcomes = array2(neighborhood.outcomes, `${label} outcomes`).map((value3, outcomeIndex) => {
      const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
      const outcome = object2(value3, outcomeLabel);
      const coverage = array2(outcome.coverage, `${outcomeLabel} coverage`).map((value4, coverageIndex) => {
        const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
        const entry = object2(value4, coverageLabel);
        return {
          itemId: kebab3(entry.itemId, `${coverageLabel} itemId`),
          role: enumeration2(entry.role, coverageRoles2, `${coverageLabel} role`),
          visibility: enumeration2(entry.visibility, coverageVisibilities2, `${coverageLabel} visibility`),
          rationale: text3(entry.rationale, `${coverageLabel} rationale`)
        };
      });
      if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
      return {
        id: kebab3(outcome.id, `${outcomeLabel} id`),
        title: text3(outcome.title, `${outcomeLabel} title`),
        objective: text3(outcome.objective, `${outcomeLabel} objective`),
        coverage
      };
    });
    if (outcomes.length === 0) throw new Error(`${label} requires outcomes.`);
    return {
      id: kebab3(neighborhood.id, `${label} id`),
      title: text3(neighborhood.title, `${label} title`),
      purpose: text3(neighborhood.purpose, `${label} purpose`),
      narrativeBridge: text3(neighborhood.narrativeBridge, `${label} narrativeBridge`),
      outcomes
    };
  });
  if (neighborhoods.length === 0) throw new Error("curriculum requires neighborhoods.");
  unique3(neighborhoods.map(({ id }) => id), "curriculum neighborhood IDs");
  const outcomeIds = neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  unique3(outcomeIds, "curriculum outcome IDs");
  const omissions = array2(record.omissions, "curriculum omissions").map((value2, index) => {
    const omission = object2(value2, `curriculum omission ${index + 1}`);
    return { itemId: kebab3(omission.itemId, `curriculum omission ${index + 1} itemId`), reason: text3(omission.reason, `curriculum omission ${index + 1} reason`) };
  });
  return {
    schemaVersion: 3,
    analysisPath,
    learningGoal: text3(record.learningGoal, "curriculum learningGoal"),
    storyline: {
      title: text3(storyline.title, "curriculum storyline title"),
      throughline: text3(storyline.throughline, "curriculum storyline throughline"),
      rationale: text3(storyline.rationale, "curriculum storyline rationale")
    },
    neighborhoods,
    omissions
  };
}
function validateCurriculum2(curriculum, analysis) {
  const accounted = [
    ...curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId))),
    ...curriculum.omissions.map(({ itemId }) => itemId)
  ];
  unique3(accounted, "curriculum coverage and omission item IDs");
  const expected = analysis.coverageItems.map(({ id }) => id);
  if (accounted.length !== expected.length || expected.some((id) => !accounted.includes(id))) {
    throw new Error("curriculum must map or omit every analysis coverage item exactly once.");
  }
}
function parseDeckPlan(value, paths, bundle) {
  const record = object2(value, "deck plan");
  if (record.schemaVersion !== 7) throw new Error("deck plan schemaVersion must be 7.");
  if (record.curriculumPath !== paths.curriculumPath || record.analysisPath !== bundle.curriculum.analysisPath || record.outputPath !== paths.htmlPath) {
    throw new Error("deck plan paths must match the curriculum and workflow outputs.");
  }
  const story = object2(record.story, "deck plan story");
  const strategy = object2(record.presentationStrategy, "deck plan presentationStrategy");
  const opening = object2(record.openingSlide, "deck plan openingSlide");
  const momentIds = [kebab3(opening.id, "deck plan openingSlide id")];
  const mappedOutcomes = [];
  const mappedItems = [];
  const neighborhoods = array2(record.neighborhoods, "deck plan neighborhoods").map((value2, neighborhoodIndex) => {
    const label = `deck plan neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object2(value2, label);
    const expectedNeighborhood = bundle.curriculum.neighborhoods[neighborhoodIndex];
    if (!expectedNeighborhood || neighborhood.curriculumNeighborhoodId !== expectedNeighborhood.id) {
      throw new Error(`${label} must map curriculum neighborhood ${expectedNeighborhood?.id ?? "absent"}.`);
    }
    const contentMoments = array2(neighborhood.contentMoments, `${label} contentMoments`).map((value3, momentIndex) => {
      const momentLabel = `${label} content moment ${momentIndex + 1}`;
      const moment = object2(value3, momentLabel);
      const outcomeIds = nonEmptyStrings(moment.outcomeIds, `${momentLabel} outcomeIds`);
      for (const outcomeId of outcomeIds) {
        if (!expectedNeighborhood.outcomes.some(({ id: id2 }) => id2 === outcomeId)) throw new Error(`${momentLabel} outcome ${outcomeId} does not belong to ${expectedNeighborhood.id}.`);
        mappedOutcomes.push(outcomeId);
      }
      const coverageItemIds = nonEmptyStrings(moment.coverageItemIds, `${momentLabel} coverageItemIds`).map((value4, coverageIndex) => {
        const itemId = kebab3(value4, `${momentLabel} coverageItemIds ${coverageIndex + 1}`);
        const expectedCoverage = expectedNeighborhood.outcomes.flatMap(({ coverage }) => coverage).find((candidate) => candidate.itemId === itemId);
        if (!expectedCoverage) throw new Error(`${momentLabel} coverage item ${itemId} does not belong to ${expectedNeighborhood.id}.`);
        mappedItems.push(itemId);
        return itemId;
      });
      const id = kebab3(moment.id, `${momentLabel} id`);
      momentIds.push(id);
      return {
        id,
        audienceConclusion: text3(moment.audienceConclusion, `${momentLabel} audienceConclusion`),
        outcomeIds,
        coverageItemIds
      };
    });
    if (contentMoments.length === 0) throw new Error(`${label} requires contentMoments.`);
    return {
      id: kebab3(neighborhood.id, `${label} id`),
      curriculumNeighborhoodId: expectedNeighborhood.id,
      title: text3(neighborhood.title, `${label} title`),
      purpose: text3(neighborhood.purpose, `${label} purpose`),
      transition: text3(neighborhood.transition, `${label} transition`),
      contentMoments
    };
  });
  if (neighborhoods.length !== bundle.curriculum.neighborhoods.length) throw new Error("deck plan must preserve every curriculum neighborhood in order.");
  unique3(momentIds, "deck plan opening and content moment IDs");
  const expectedOutcomeIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  if (expectedOutcomeIds.some((id) => !mappedOutcomes.includes(id))) {
    throw new Error("deck plan must represent every curriculum outcome.");
  }
  unique3(mappedItems, "deck plan coverage item IDs");
  const expectedItemIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId)));
  if (mappedItems.length !== expectedItemIds.length || expectedItemIds.some((id) => !mappedItems.includes(id))) {
    throw new Error("deck plan must map every retained curriculum coverage item exactly once.");
  }
  return {
    schemaVersion: 7,
    curriculumPath: paths.curriculumPath,
    analysisPath: bundle.curriculum.analysisPath,
    outputPath: paths.htmlPath,
    story: {
      title: text3(story.title, "deck plan story title"),
      openingPromise: text3(story.openingPromise, "deck plan story openingPromise"),
      throughline: text3(story.throughline, "deck plan story throughline"),
      endingResolution: text3(story.endingResolution, "deck plan story endingResolution")
    },
    presentationStrategy: {
      audienceExperience: text3(strategy.audienceExperience, "deck plan presentationStrategy audienceExperience"),
      compactnessRationale: text3(strategy.compactnessRationale, "deck plan presentationStrategy compactnessRationale")
    },
    openingSlide: {
      id: momentIds[0],
      titleIntent: text3(opening.titleIntent, "deck plan openingSlide titleIntent"),
      decisionPromise: text3(opening.decisionPromise, "deck plan openingSlide decisionPromise")
    },
    neighborhoods
  };
}
function readJson2(repositoryPath, artifactPath) {
  const absolutePath = resolve4(repositoryPath, artifactPath);
  if (!existsSync3(absolutePath) || !statSync3(absolutePath).isFile()) throw new Error(`Expected ${artifactPath} to exist.`);
  try {
    return JSON.parse(readFileSync2(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function artifactExists(repositoryPath, artifactPath) {
  const absolutePath = resolve4(repositoryPath, artifactPath);
  return existsSync3(absolutePath) && statSync3(absolutePath).isFile();
}
function object2(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function array2(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function strings2(value, label) {
  return array2(value, label).map((item, index) => text3(item, `${label}[${index}]`));
}
function nonEmptyStrings(value, label) {
  const values = strings2(value, label);
  if (values.length === 0) throw new Error(`${label} must not be empty.`);
  return values;
}
function text3(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}
function kebab3(value, label) {
  const result = text3(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function enumeration2(value, allowed, label) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
}
function unique3(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// src/graphs/curriculum.ts
var WalkthroughCurriculumGraph = m({
  key: "WalkthroughCurriculum",
  title: "Prepare the walkthrough curriculum",
  init: (destination, parameters) => ({
    repositoryPath: destination.worktreePath,
    ...parameters,
    curriculumReusable: false,
    curriculumParameters: null,
    curriculum: null,
    failure: null
  }),
  state: {
    repositoryPath: c.replace(),
    context: c.replace(),
    deliveryMechanism: c.replace(),
    curriculumReusable: c.replace(),
    curriculumParameters: c.replace(),
    curriculum: c.replace(),
    failure: c.replace()
  },
  entry: "inspectPlanning",
  nodes: {
    // Preparing the curriculum parameters here keeps their file checks out of the pure mapping.
    inspectPlanning: l(async (ctx, state) => {
      const { paths } = state.context;
      let reusableArtifacts;
      try {
        reusableArtifacts = inspectPlanningArtifacts(state.repositoryPath, paths);
      } catch (error) {
        try {
          const removed = removePlanningArtifacts(state.repositoryPath, paths);
          await ctx.log("warning", `Reset walkthrough planning artifacts after deterministic validation failed: ${errorText(error)} Removed: ${removed.join(", ") || "none"}.`);
          reusableArtifacts = { curriculum: false, deckPlan: false };
        } catch (removalError) {
          return failStep(ctx, { phase: "Solution walkthrough failed", message: "Invalid walkthrough planning artifacts could not be reset." }, errorText(removalError));
        }
      }
      if (reusableArtifacts.curriculum) {
        const deckMessage = state.deliveryMechanism === "presentation" ? reusableArtifacts.deckPlan ? "The approved deck plan will also be reused." : "A new deck plan will be created." : "Continuing directly to Socratic learning.";
        await ctx.log("info", `Reusing existing curriculum ${paths.curriculumPath}; curriculum design is skipped.`);
        await ctx.setUiFeedback({ phase: "Reusing the approved curriculum", message: deckMessage });
        return g({ update: { curriculumReusable: true } });
      }
      await ctx.setUiFeedback({ phase: "Designing the walkthrough curriculum", message: "Creating the analysis and curriculum before continuing to the selected delivery mode." });
      const { sources, audienceProfile } = state.context;
      const curriculumParameters = designCurriculumParameters(state.repositoryPath, {
        sources: [
          { id: "current-state", path: sources.currentStatePath, description: "The current-state map and evidence the proposal changes." },
          { id: "architecture", path: sources.architecturePath, description: "The proposed architecture and its consequential decisions." },
          { id: "program-design", path: sources.programDesignPath, description: "The proposed program design and exact changed contracts." }
        ],
        learningGoal: "Understand the current-state map, proposed architecture, and program design well enough to approve or reject the proposed solution.",
        audienceFamiliarity: curriculumFamiliarity(audienceProfile),
        audienceDepth: curriculumDepth(audienceProfile),
        teachingBrief: "Establish enough of the current-state map to evaluate the proposal. Connect architecture and program realization wherever teaching them together preserves context. Keep exact changed contracts available as reference material needed for approval. Choose the final storyline from the actual sources when a different grouping is clearer.",
        outputDirectory: paths.walkthroughDirectory
      });
      return g({ update: { curriculumParameters } });
    }, { title: "Reuse or reset the planning artifacts" }),
    designCurriculum: u({
      graph: DesignCurriculumGraph,
      title: "Design the curriculum",
      parameters: (state) => must(state.curriculumParameters, "curriculum parameters"),
      onResult: (_state, result) => ({ curriculum: result.output })
    }),
    confirmCurriculum: l(async (ctx, state) => {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.context.paths);
        return g();
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The curriculum workflow did not complete successfully." }, errorText(error));
      }
    }, { title: "Confirm the designed curriculum" })
  },
  edges: {
    afterInspectPlanning: f({
      from: "inspectPlanning",
      to: ["ready", "designCurriculum"],
      choose: (state) => ({ to: state.curriculumReusable ? "ready" : "designCurriculum" })
    }),
    afterDesignCurriculum: f({
      from: "designCurriculum",
      to: ["confirmCurriculum", "failed"],
      choose: (state) => {
        const curriculum = must(state.curriculum, "curriculum result");
        const { paths } = state.context;
        if (curriculum.outcome === "failed") {
          return { to: "failed", update: { failure: { message: "The curriculum workflow did not complete successfully.", diagnostic: `Curriculum design failed: ${curriculum.reason}` } } };
        }
        if (curriculum.analysisPath !== paths.curriculumAnalysisPath || curriculum.curriculumPath !== paths.curriculumPath) {
          return { to: "failed", update: { failure: { message: "The curriculum workflow did not complete successfully.", diagnostic: `Curriculum design returned ${curriculum.analysisPath} and ${curriculum.curriculumPath} instead of ${paths.curriculumAnalysisPath} and ${paths.curriculumPath}.` } } };
        }
        return { to: "confirmCurriculum" };
      }
    }),
    afterConfirmCurriculum: f({
      from: "confirmCurriculum",
      to: ["ready"],
      choose: () => ({ to: "ready" })
    })
  },
  outcomes: {
    ready: p({ kind: "success", title: "Curriculum ready", output: () => ({ outcome: "ready" }) }),
    failed: p({ kind: "failure", title: "Curriculum not ready", output: (state) => ({ outcome: "failed", failure: must(state.failure, "failure") }) })
  }
});
function curriculumFamiliarity(profile) {
  return profile.familiarity === "new" ? "The audience is new to this codebase and needs the essential context required to evaluate the proposal." : "The audience is familiar with this codebase; emphasize consequential changes and include context only when it changes evaluation of the proposal.";
}
function curriculumDepth(profile) {
  switch (profile.technicalDepth) {
    case "product":
      return "Explain behavior, user and operational consequences, and tradeoffs while keeping exact technical evidence available for inspection.";
    case "system-design":
      return "Explain system boundaries, ownership, flows, state changes, tradeoffs, and the consequential contracts needed to evaluate the design.";
    case "implementation":
      return "Explain system intent together with implementation mechanics, exact changed contracts, failure behavior, and migration consequences.";
  }
}

// src/constants.ts
var deckBuilder = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var guide = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var deckArchitect = {
  harness: "claude",
  model: "opus",
  effort: "high"
};

// src/contracts.ts
import { existsSync as existsSync4, readFileSync as readFileSync3, statSync as statSync4 } from "node:fs";
import { resolve as resolve5 } from "node:path";
function assertExpectedFile(repositoryPath, artifactPath, label) {
  const absolutePath = resolve5(repositoryPath, artifactPath);
  if (!existsSync4(absolutePath) || !statSync4(absolutePath).isFile()) {
    throw new Error(`Expected ${label} at ${artifactPath}.`);
  }
}
function validatePresentation(repositoryPath, htmlPath, plan) {
  assertExpectedFile(repositoryPath, htmlPath, "walkthrough presentation");
  const rawHtml = readFileSync3(resolve5(repositoryPath, htmlPath), "utf8");
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
  requireElementCount(html, "data-walkthrough-deck", 1, "presentation root");
  requireElementCount(html, "data-slide-viewport", 1, "slide viewport");
  requireElementCount(html, "data-slide-navigation", 1, "slide navigation");
  if (rawHtml.includes("<!-- walkthrough-content-end -->")) {
    throw new Error("The completed presentation still contains the neighborhood insertion marker.");
  }
  const slideTags = elementsWithAttribute(html, "data-walkthrough-slide");
  if (slideTags.length < 2) {
    throw new Error("The completed presentation requires an opening slide and at least one substantive slide.");
  }
  const slideIds = slideTags.map((tag, index) => requiredAttribute(tag, "id", `slide ${index + 1}`));
  unique4(slideIds, "walkthrough slide IDs");
  if (slideIds[0] !== plan.openingSlide.id) {
    throw new Error(`The first slide must be the planned opening slide ${plan.openingSlide.id}.`);
  }
  if (slideIds.filter((id) => id === plan.openingSlide.id).length !== 1) {
    throw new Error(`The planned opening slide ${plan.openingSlide.id} must appear exactly once.`);
  }
  const plannedMomentIds = plan.neighborhoods.flatMap((neighborhood) => neighborhood.contentMoments.map((moment) => moment.id));
  const realizedMomentIds = slideTags.flatMap((tag) => optionalAttribute(tag, "data-content-moments")?.split(/\s+/).filter(Boolean) ?? []);
  const planned = new Set(plannedMomentIds);
  const unknown = [...new Set(realizedMomentIds.filter((id) => !planned.has(id)))];
  if (unknown.length > 0) {
    throw new Error(`The presentation contains unknown content moment IDs: ${unknown.join(", ")}.`);
  }
  const missing = plannedMomentIds.filter((id) => !realizedMomentIds.includes(id));
  if (missing.length > 0) {
    throw new Error(`The presentation does not realize these planned content moments: ${missing.join(", ")}.`);
  }
  return {
    neighborhoodCount: plan.neighborhoods.length,
    contentMomentCount: plannedMomentIds.length,
    substantiveSlideCount: slideTags.length - 1,
    totalSlideCount: slideTags.length,
    coverageItemCount: plan.neighborhoods.reduce(
      (count, neighborhood) => count + neighborhood.contentMoments.reduce(
        (momentCount, moment) => momentCount + moment.coverageItemIds.length,
        0
      ),
      0
    )
  };
}
function requireElementCount(html, attribute, expected, label) {
  const count = elementsWithAttribute(html, attribute).length;
  if (count !== expected) throw new Error(`Expected exactly ${expected} ${label}, found ${count}.`);
}
function elementsWithAttribute(html, attribute) {
  const expression = new RegExp("<[a-z][^>]*\\b" + escapeRegExp(attribute) + `(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*>`, "gi");
  return html.match(expression) ?? [];
}
function requiredAttribute(tag, attribute, label) {
  const value = optionalAttribute(tag, attribute);
  if (!value) throw new Error(`${label} requires a non-empty ${attribute} attribute.`);
  return value;
}
function optionalAttribute(tag, attribute) {
  const expression = new RegExp("(?:^|\\s)" + escapeRegExp(attribute) + `\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i");
  const match = expression.exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}
function unique4(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

// src/prompts.ts
var PREPARATION_FOOTER = "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";
var PLAIN_LANGUAGE_STANDARD = "Use direct, plain language. Lead with behavior or consequence, define unfamiliar terms before use, and keep exact identifiers where they add precision. Omit or merge material that does not change understanding.";
var DECK_EXPERIENCE = `Create a self-paced presentation whose main narrative is understandable at a glance. Each slide should feel like a composed presentation canvas rather than a document section. Show all primary content immediately; Next and Back move between slides and never reveal fragments within a slide. Keep exact contracts available without crowding the main narrative, using accessible details or dependable scrolling for optional evidence. Choose typography, composition, visual language, and representations that suit the material. Keep the result readable, responsive, non-overlapping, accessible, and coherent.`;
var VISUAL_STORYTELLING_STANDARD = `Use diagrams as the primary explanation when the material is fundamentally relational, sequential, or stateful. Sequence, state, flow, dependency, and data-model diagrams are especially useful. Mermaid is available when it produces the cleanest result; render diagrams in the finished deck rather than showing their source. Reuse or evolve a diagram across adjacent slides when that preserves context. Do not substitute a grid of prose cards for a relationship that one clear diagram can show directly.`;
function unattended(body) {
  return `${body}

${PREPARATION_FOOTER}`;
}
function genericDeckArchitecturePrompt(input) {
  return unattended(`Turn the approved curriculum into a concise narrative and coverage brief for a presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Future deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Read both curriculum files. The curriculum decides what the audience must understand and the analysis is the authority for grounded facts, details, and source references. Preserve the curriculum's storyline, neighborhood order, outcomes, coverage roles, visibility choices, and omissions.

This is narrative architecture, not slide allocation, copywriting, visual design, or HTML construction. Identify the sequence of conclusions the audience needs to reach and map every retained coverage item to that sequence. A content moment is one teaching move, not an eventual slide or a compressed summary of its evidence. State its audienceConclusion as one short, direct sentence. The coverage IDs carry the supporting facts and exact contracts, so do not repeat those details in the conclusion. Combine related outcomes when they support the same teaching move.

${PLAIN_LANGUAGE_STANDARD}

Create the smallest useful sequence of content moments without dropping load-bearing context or exact contracts such as schemas, APIs, events, state machines, security boundaries, and other reviewable system or implementation contracts. The deck creator will decide how many slides to use and how to represent the material. Describe the grouping logic in compactnessRationale without asserting a content-moment or slide count that could drift from the arrays.

Write exactly this JSON shape:
{
  "schemaVersion": 7,
  "curriculumPath": ${JSON.stringify(input.paths.curriculumPath)},
  "analysisPath": ${JSON.stringify(input.paths.curriculumAnalysisPath)},
  "outputPath": ${JSON.stringify(input.paths.htmlPath)},
  "story": {
    "title": "Presentation title",
    "openingPromise": "What the audience will be able to decide",
    "throughline": "The idea connecting the presentation",
    "endingResolution": "The approval-ready conclusion"
  },
  "presentationStrategy": {
    "audienceExperience": "How the presentation should feel and be consumed",
    "compactnessRationale": "Why this is the smallest useful sequence of audience conclusions"
  },
  "openingSlide": {
    "id": "opening",
    "titleIntent": "What the opening title should establish",
    "decisionPromise": "What the audience will be ready to decide"
  },
  "neighborhoods": [{
    "id": "presentation-neighborhood-id",
    "curriculumNeighborhoodId": "curriculum-neighborhood-id",
    "title": "Neighborhood title",
    "purpose": "What this movement establishes",
    "transition": "How it connects to the next movement",
    "contentMoments": [{
      "id": "unique-content-moment-id",
      "audienceConclusion": "The distinct conclusion the audience needs to reach",
      "outcomeIds": ["curriculum-outcome-id"],
      "coverageItemIds": ["curriculum-coverage-item-id"]
    }]
  }]
}

Create exactly the curriculum neighborhoods in order. Represent every curriculum outcome and map every retained coverage item exactly once within its neighborhood. The opening slide stays minimal and does not absorb curriculum outcomes or coverage. Do not prescribe slide boundaries, representations, layouts, typography, interactions, or overflow behavior. Write only ${input.paths.deckPlanPath}.`);
}
function genericDeckShellPrompt(input) {
  return unattended(`Create the opening slide and lightweight working shell for the approved standalone presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Read the deck plan and create one self-contained HTML file with embedded CSS and JavaScript. The presentation should use the full available browser viewport so diagrams and composed layouts have room to breathe. Constrain prose where that improves reading, but do not constrain the slide canvas or visual field. Make overflow and scrolling dependable wherever a slide needs more vertical space.

Create the minimal opening slide from openingSlide and establish an initial visual tone without imposing a rigid component system on later neighborhoods. Provide coherent navigation, progress, responsive and print behavior, accessibility, and focus behavior. Set up Mermaid so later creators can use it when it is the clearest way to express a sequence, state, flow, dependency, or data model. Make every rendered diagram independently inspectable with discoverable zoom, pan, and reset behavior that does not disrupt slide navigation or ordinary slide scrolling.

The workflow integration contract is small: place data-walkthrough-deck on the root, data-slide-viewport on the slide viewport, data-walkthrough-slide and the planned opening id on the opening section, and data-slide-navigation on the navigation. Leave <!-- walkthrough-content-end --> inside the slide viewport as the insertion point for neighborhoods. Derive displayed numbers, totals, and progress from the rendered slides.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}

Write ${input.paths.htmlPath}. This turn creates the opening and shared presentation environment, not any neighborhood content.`);
}
function genericDeckNeighborhoodPrompt(input, plan, neighborhood, neighborhoodIndex) {
  return unattended(`Create one complete neighborhood of the standalone presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Deck plan: ${input.paths.deckPlanPath}
Canonical sources: ${JSON.stringify(input.sources)}
Deck: ${input.paths.htmlPath}
Neighborhood ${neighborhoodIndex + 1} of ${plan.neighborhoods.length}:
${JSON.stringify(neighborhood, null, 2)}

Use the Show Me skill to turn this neighborhood into a compelling visual explanation. The content moments define the conclusions and coverage that must survive; they are not prescribed slides. Decide the number and order of slides, their titles, representations, layouts, and visual rhythm. Use the smallest sequence that communicates the neighborhood clearly.

Treat each content moment as one visual teaching movement by default. A slide may carry adjacent moments when one representation explains them together. Split a moment only when its primary understanding genuinely requires distinct steps; an exact contract is not by itself a reason for another slide.

Resolve coverage item IDs through the curriculum and analysis. Preserve exact schemas, APIs, events, state transitions, security boundaries, and other contracts needed for approval. Consult the canonical Markdown only when an exact detail remains ambiguous. Do not turn source references or the plan into audience-facing prose.

Inspect the opening and earlier neighborhoods. Preserve their content and mechanics while extending the visual language when this material calls for it. Add this neighborhood's sections immediately before <!-- walkthrough-content-end --> in story order. Give every section data-walkthrough-slide, a unique id, and data-walkthrough-neighborhood="${neighborhood.id}". Record the content moments realized by each slide as space-separated IDs in data-content-moments. Every content moment in this neighborhood must appear on at least one slide.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}
${VISUAL_STORYTELLING_STANDARD}

Modify only ${input.paths.htmlPath}. Complete the entire neighborhood in this turn and leave deck-wide assembly for the final turn.`);
}
function genericDeckAssemblyPrompt(input) {
  return unattended(`Complete the assembled neighborhoods as one polished standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

Inspect the complete deck and make the editorial and visual decisions needed for it to feel like one intentional presentation. Begin with a compression pass: compare the substantive slide count with the content moments in the plan and challenge every expansion. Merge adjacent slides that realize the same moment, let one strong visual carry adjacent moments when appropriate, and fold reference-only slides into inspectable detail. A large expansion is a diagnostic signal, not a hard quota. Split or redesign slides only when clarity genuinely requires it.

Preserve the opening promise, neighborhood order, every content moment, every retained coverage item, and the exact contracts needed for approval. Preserve and correct data-content-moments mappings as slides are merged or redesigned. Remove the insertion marker and finish neighborhood transitions, the ending, navigation, progress, focus behavior, accessibility, responsive behavior, scrolling, and print behavior.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}
${VISUAL_STORYTELLING_STANDARD}

No model reviewer follows this assembly. Render and inspect the completed deck at 1440\xD7900, 1280\xD7720, and 1024\xD7768. Exercise navigation and optional-detail controls, then correct overlap, clipping, unreadable content, broken scrolling, stale numbering, hidden primary content, and visible stacking between slides. Modify only ${input.paths.htmlPath}.`);
}
function genericSocraticPrompt(input) {
  return `Guide a self-paced Socratic walkthrough from the approved curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Canonical sources: ${JSON.stringify(input.sources)}

Read the curriculum and analysis. Use the curriculum's storyline, neighborhoods, outcomes, coverage roles, and visibility choices as the teaching contract. Use the analysis for grounded details and source references. Help the user build the intended model and reach their own approval judgment through concise explanations, focused questions, and checks for understanding. Preserve exact schemas, APIs, events, state transitions, and other contracts when they matter to the judgment.

Begin with a brief orientation and the first useful question. Let the user's answers determine clarification and pacing inside this pane. Group related obligations around the curriculum outcomes instead of turning every coverage item into a separate lesson. Use the Show Me skill when a focused representation materially helps.

${PLAIN_LANGUAGE_STANDARD}`;
}

// src/graphs/deck-neighborhoods.ts
var WalkthroughDeckNeighborhoodsGraph = m({
  key: "WalkthroughDeckNeighborhoods",
  title: "Build the deck neighborhoods",
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, neighborhoodIndex: 0, turn: null, failure: null }),
  state: {
    repositoryPath: c.replace(),
    context: c.replace(),
    plan: c.replace(),
    neighborhoodIndex: c.replace(),
    turn: c.replace(),
    failure: c.replace()
  },
  entry: "buildNeighborhood",
  nodes: {
    buildNeighborhood: agentTurn({
      title: "Build a neighborhood",
      label: (state) => `Build ${neighborhoodAt(state).title}`,
      parameters: (state) => {
        const neighborhood = neighborhoodAt(state);
        return {
          label: "Neighborhood construction",
          session: { kind: "spawn", ...deckBuilder },
          modifiers: SHOW_ME_MODIFIER,
          prompt: genericDeckNeighborhoodPrompt(promptInput(state), state.plan, neighborhood, state.neighborhoodIndex),
          feedback: { phase: `Creating ${neighborhood.title}`, message: `Neighborhood ${state.neighborhoodIndex + 1} of ${state.plan.neighborhoods.length} in a fresh Show Me session.` }
        };
      },
      onResult: (_state, turn) => ({ turn })
    }),
    checkNeighborhood: l(async (ctx, state) => {
      try {
        assertExpectedFile(state.repositoryPath, state.context.paths.htmlPath, "walkthrough deck");
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The walkthrough deck is missing after neighborhood construction. Its pane remains open." }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, "builder turn").agent));
      return g({ update: { neighborhoodIndex: state.neighborhoodIndex + 1 } });
    }, { title: "Check the neighborhood and close the builder" })
  },
  edges: {
    afterBuildNeighborhood: f({
      from: "buildNeighborhood",
      to: ["checkNeighborhood", "failed"],
      choose: (state) => {
        const turn = must(state.turn, "builder turn");
        if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: "Neighborhood construction failed because its agent session ended.", diagnostic: turn.reason } } };
        return { to: "checkNeighborhood" };
      }
    }),
    afterCheckNeighborhood: f({
      from: "checkNeighborhood",
      to: ["buildNeighborhood", "built"],
      choose: (state) => ({ to: state.neighborhoodIndex < state.plan.neighborhoods.length ? "buildNeighborhood" : "built" })
    })
  },
  outcomes: {
    built: p({ kind: "success", title: "Neighborhoods built", output: () => ({ outcome: "built" }) }),
    failed: p({ kind: "failure", title: "Neighborhoods not built", output: (state) => ({ outcome: "failed", failure: must(state.failure, "failure") }) })
  }
});
function neighborhoodAt(state) {
  const neighborhood = state.plan.neighborhoods[state.neighborhoodIndex];
  if (!neighborhood) throw new Error(`No deck neighborhood exists at index ${state.neighborhoodIndex}.`);
  return neighborhood;
}

// src/graphs/deck-build.ts
var WalkthroughDeckBuildGraph = m({
  key: "WalkthroughDeckBuild",
  title: "Build the presentation",
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, created: null, failure: null }),
  state: {
    repositoryPath: c.replace(),
    context: c.replace(),
    plan: c.replace(),
    turn: c.replace(),
    created: c.replace(),
    failure: c.replace()
  },
  entry: "buildShell",
  nodes: {
    buildShell: agentTurn({
      title: "Build the deck shell",
      parameters: (state) => ({
        label: "Deck shell creation",
        session: { kind: "spawn", ...deckBuilder },
        prompt: genericDeckShellPrompt(promptInput(state)),
        feedback: { phase: "Establishing the presentation design", message: "Creating the shared presentation environment and opening slide." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    checkShell: l(async (ctx, state) => {
      try {
        assertExpectedFile(state.repositoryPath, state.context.paths.htmlPath, "walkthrough deck shell");
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The deck shell is missing. Its pane remains open." }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, "builder turn").agent));
      return g();
    }, { title: "Check the deck shell and close the builder" }),
    buildNeighborhoods: u({
      graph: WalkthroughDeckNeighborhoodsGraph,
      title: "Build the neighborhoods",
      parameters: (state) => ({ context: state.context, plan: state.plan }),
      onResult: (_state, result) => result.output.outcome === "failed" ? { failure: result.output.failure } : {}
    }),
    assemble: agentTurn({
      title: "Assemble the presentation",
      parameters: (state) => ({
        label: "Final deck assembly",
        session: { kind: "spawn", ...deckBuilder },
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericDeckAssemblyPrompt(promptInput(state)),
        feedback: { phase: "Assembling the walkthrough presentation", message: "Making the neighborhood work feel like one polished presentation." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    finishPresentation: l(async (ctx, state) => {
      const { paths } = state.context;
      let metrics;
      try {
        metrics = validatePresentation(state.repositoryPath, paths.htmlPath, state.plan);
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The assembled walkthrough deck does not satisfy the presentation contract. Its pane remains open." }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, "builder turn").agent));
      await ctx.setUiFeedback({ phase: "Walkthrough presentation created", message: `Open ${paths.htmlPath}.` });
      return g({
        update: {
          created: {
            outcome: "presentation-created",
            curriculumPath: paths.curriculumPath,
            deckPlanPath: paths.deckPlanPath,
            presentationPath: paths.htmlPath,
            ...metrics
          }
        }
      });
    }, { title: "Validate the presentation and close the builder" })
  },
  edges: {
    afterBuildShell: afterAgentTurn2("buildShell", "checkShell", "Deck shell creation failed because its agent session ended."),
    afterCheckShell: f({ from: "checkShell", to: ["buildNeighborhoods"], choose: () => ({ to: "buildNeighborhoods" }) }),
    afterBuildNeighborhoods: afterCheck("buildNeighborhoods", "assemble"),
    afterAssemble: afterAgentTurn2("assemble", "finishPresentation", "Final deck assembly failed because its agent session ended."),
    afterFinishPresentation: f({ from: "finishPresentation", to: ["created"], choose: () => ({ to: "created" }) })
  },
  outcomes: {
    created: p({ kind: "success", title: "Presentation created", output: (state) => must(state.created, "created presentation") }),
    failed: p({ kind: "failure", title: "Presentation not created", output: (state) => ({ outcome: "failed", failure: must(state.failure, "failure") }) })
  }
});
function afterAgentTurn2(from, next, message) {
  return f({
    from,
    to: [next, "failed"],
    choose: (state) => {
      const turn = must(state.turn, "builder turn");
      if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message, diagnostic: turn.reason } } };
      return { to: next };
    }
  });
}
function afterCheck(from, next) {
  return f({ from, to: [next, "failed"], choose: (state) => ({ to: state.failure ? "failed" : next }) });
}

// src/graphs/deck-plan.ts
var WalkthroughDeckPlanGraph = m({
  key: "WalkthroughDeckPlan",
  title: "Plan the presentation",
  init: (destination, context) => ({ repositoryPath: destination.worktreePath, context, plan: null, turn: null, failure: null }),
  state: {
    repositoryPath: c.replace(),
    context: c.replace(),
    plan: c.replace(),
    turn: c.replace(),
    failure: c.replace()
  },
  entry: "inspectDeckPlan",
  nodes: {
    inspectDeckPlan: l(async (ctx, state) => {
      const { paths } = state.context;
      let bundle;
      try {
        bundle = readGenericCurriculumBundle(state.repositoryPath, paths);
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "Presentation creation cannot start because the curriculum is invalid." }, errorText(error));
      }
      if (!deckPlanExists(state.repositoryPath, paths)) return g();
      try {
        const plan = readArchitectedDeckPlan(state.repositoryPath, paths, bundle);
        await ctx.log("info", `Reusing existing deck plan ${paths.deckPlanPath}; deck architecture is skipped.`);
        await ctx.setUiFeedback({ phase: "Reusing the approved deck plan", message: `Rebuilding ${paths.htmlPath} neighborhood by neighborhood.` });
        return g({ update: { plan } });
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The existing deck plan cannot be reused." }, errorText(error));
      }
    }, { title: "Reuse the approved deck plan" }),
    architectDeck: agentTurn({
      title: "Architect the presentation",
      parameters: (state) => ({
        label: "Deck architecture",
        session: { kind: "spawn", ...deckArchitect },
        prompt: genericDeckArchitecturePrompt(promptInput(state)),
        feedback: { phase: "Architecting the presentation", message: "Planning the narrative, audience conclusions, and complete coverage before visual construction." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    readDeckPlan: l(async (ctx, state) => {
      let plan;
      try {
        const bundle = readGenericCurriculumBundle(state.repositoryPath, state.context.paths);
        plan = readArchitectedDeckPlan(state.repositoryPath, state.context.paths, bundle);
      } catch (error) {
        return failStep(ctx, { phase: "Solution walkthrough failed", message: "The deck architecture plan is invalid. Its pane remains open." }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.turn, "architect turn").agent));
      return g({ update: { plan } });
    }, { title: "Read the deck plan and close the architect" })
  },
  edges: {
    afterInspectDeckPlan: f({
      from: "inspectDeckPlan",
      to: ["planned", "architectDeck"],
      choose: (state) => ({ to: state.plan ? "planned" : "architectDeck" })
    }),
    afterArchitectDeck: f({
      from: "architectDeck",
      to: ["readDeckPlan", "failed"],
      choose: (state) => {
        const turn = must(state.turn, "architect turn");
        if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: "Deck architecture failed because its agent session ended.", diagnostic: turn.reason } } };
        return { to: "readDeckPlan" };
      }
    }),
    afterReadDeckPlan: f({
      from: "readDeckPlan",
      to: ["planned"],
      choose: () => ({ to: "planned" })
    })
  },
  outcomes: {
    planned: p({ kind: "success", title: "Deck planned", output: (state) => ({ outcome: "planned", plan: must(state.plan, "deck plan") }) }),
    failed: p({ kind: "failure", title: "Deck not planned", output: (state) => ({ outcome: "failed", failure: must(state.failure, "failure") }) })
  }
});

// src/graphs/socratic.ts
var WalkthroughSocraticGraph = m({
  key: "WalkthroughSocratic",
  title: "Socratic walkthrough",
  init: (destination, context) => ({ repositoryPath: destination.worktreePath, context, turn: null, failure: null }),
  state: {
    repositoryPath: c.replace(),
    context: c.replace(),
    turn: c.replace(),
    failure: c.replace()
  },
  entry: "startGuide",
  nodes: {
    startGuide: agentTurn({
      title: "Start the guide",
      parameters: (state) => ({
        label: "Socratic walkthrough",
        session: { kind: "spawn", ...guide },
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericSocraticPrompt(promptInput(state)),
        feedback: { phase: "Starting the Socratic walkthrough", message: "The guide will use the approved curriculum and grounded coverage analysis." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    awaitDiscussion: l(async (ctx) => {
      await ctx.setUiFeedback({ phase: "Socratic walkthrough in progress", message: "Continue the discussion in the guide pane. Press workflow Continue when you are finished." });
      return _({ wait: y.userContinue() });
    }, { title: "Wait for the discussion to finish" }),
    closeGuide: l(async (ctx, state) => {
      await ctx.closePane(ownedPane(must(state.turn, "guide turn").agent));
      return g();
    }, { title: "Close the guide" })
  },
  edges: {
    afterStartGuide: f({
      from: "startGuide",
      to: ["awaitDiscussion", "failed"],
      choose: (state) => {
        const turn = must(state.turn, "guide turn");
        if (turn.outcome === "interrupted") return { to: "failed", update: { failure: { message: "The Socratic guide failed.", diagnostic: turn.reason } } };
        return { to: "awaitDiscussion" };
      }
    }),
    afterAwaitDiscussion: f({
      from: "awaitDiscussion",
      to: ["closeGuide"],
      choose: (_state, event) => {
        if (event.kind !== "user_continue") throw new Error(`The Socratic walkthrough resumed with an unexpected ${event.kind} event.`);
        return { to: "closeGuide" };
      }
    }),
    afterCloseGuide: f({ from: "closeGuide", to: ["completed"], choose: () => ({ to: "completed" }) })
  },
  outcomes: {
    completed: p({ kind: "success", title: "Socratic walkthrough completed", output: (state) => ({ outcome: "socratic-walkthrough-completed", curriculumPath: state.context.paths.curriculumPath }) }),
    failed: p({ kind: "failure", title: "Socratic walkthrough failed", output: (state) => ({ outcome: "failed", failure: must(state.failure, "failure") }) })
  }
});

// src/paths.ts
function walkthroughPaths(reviewDirectory) {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    walkthroughDirectory,
    curriculumAnalysisPath: `${walkthroughDirectory}/curriculum-analysis.json`,
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    htmlPath: `${reviewDirectory}/walkthrough.html`
  };
}

// src/graph.ts
var SolutionWalkthroughGraph = m({
  key: "SolutionWalkthroughStory",
  title: "Solution walkthrough",
  init: (_destination, parameters) => ({
    context: {
      story: parameters.story,
      sources: parameters.sources,
      paths: walkthroughPaths(parameters.reviewDirectory),
      audienceProfile: parameters.audienceProfile
    },
    deliveryMechanism: parameters.deliveryMechanism,
    plan: null,
    delivered: null,
    failure: null
  }),
  state: {
    context: c.replace(),
    deliveryMechanism: c.replace(),
    plan: c.replace(),
    delivered: c.replace(),
    failure: c.replace()
  },
  entry: "prepareCurriculum",
  nodes: {
    prepareCurriculum: u({
      graph: WalkthroughCurriculumGraph,
      title: "Prepare the curriculum",
      parameters: (state) => ({ context: state.context, deliveryMechanism: state.deliveryMechanism }),
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : {}
    }),
    planDeck: u({
      graph: WalkthroughDeckPlanGraph,
      title: "Plan the presentation",
      parameters: (state) => state.context,
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { plan: output.plan }
    }),
    buildDeck: u({
      graph: WalkthroughDeckBuildGraph,
      title: "Build the presentation",
      parameters: (state) => ({ context: state.context, plan: must(state.plan, "deck plan") }),
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { delivered: output }
    }),
    runSocratic: u({
      graph: WalkthroughSocraticGraph,
      title: "Run the Socratic walkthrough",
      parameters: (state) => state.context,
      onResult: (_state, { output }) => output.outcome === "failed" ? { failure: output.failure } : { delivered: output }
    }),
    reportFailure: l(async (ctx, state) => {
      const failure = must(state.failure, "failure");
      await ctx.setUiFeedback({ kind: "error", phase: "Solution walkthrough failed", message: failure.message });
      await ctx.log("error", failure.diagnostic);
      return g();
    }, { title: "Report the failure" })
  },
  edges: {
    afterPrepareCurriculum: f({
      from: "prepareCurriculum",
      to: ["reportFailure", "planDeck", "runSocratic"],
      choose: (state) => {
        if (state.failure) return { to: "reportFailure" };
        return { to: state.deliveryMechanism === "presentation" ? "planDeck" : "runSocratic" };
      }
    }),
    afterPlanDeck: afterPhase("planDeck", "buildDeck"),
    afterBuildDeck: afterPhase("buildDeck", "presentationCreated"),
    afterRunSocratic: afterPhase("runSocratic", "socraticCompleted"),
    afterReportFailure: f({ from: "reportFailure", to: ["failed"], choose: () => ({ to: "failed" }) })
  },
  outcomes: {
    presentationCreated: p({ kind: "success", title: "Presentation created", output: (state) => must(state.delivered, "delivered walkthrough") }),
    socraticCompleted: p({ kind: "success", title: "Socratic walkthrough completed", output: (state) => must(state.delivered, "delivered walkthrough") }),
    failed: p({ kind: "failure", title: "Solution walkthrough failed", output: (state) => ({ outcome: "failed", reason: must(state.failure, "failure").diagnostic }) })
  }
});
function afterPhase(from, next) {
  return f({ from, to: [next, "reportFailure"], choose: (state) => ({ to: state.failure ? "reportFailure" : next }) });
}

// src/types.ts
var familiarityLevels = ["new", "familiar"];
var technicalDepthLevels = ["product", "system-design", "implementation"];
var deliveryMechanisms = ["presentation", "socratic-walkthrough"];

// src/index.ts
var index_default = h({
  command: () => ({
    title: "Solution Walkthrough Story",
    description: "Reuse or create the curriculum and deck plan, then build a presentation or start a Socratic walkthrough.",
    inputs: [
      { kind: "text", key: "story", label: "Story or story URL" },
      { kind: "text", key: "currentStatePath", label: "Current-state source path", default: "scratch/story/design/current-state.md" },
      { kind: "text", key: "architecturePath", label: "Architecture source path", default: "scratch/story/design/architecture.md" },
      { kind: "text", key: "programDesignPath", label: "Program-design source path", default: "scratch/story/design/program-design.md" },
      { kind: "text", key: "reviewDirectory", label: "Walkthrough output directory", default: "scratch/story/walkthrough" },
      {
        kind: "select",
        key: "familiarity",
        label: "Codebase familiarity",
        options: [
          { value: "new", label: "New to this codebase" },
          { value: "familiar", label: "Familiar with this codebase" }
        ],
        default: "new"
      },
      {
        kind: "select",
        key: "technicalDepth",
        label: "Technical depth",
        options: [
          { value: "product", label: "Product overview" },
          { value: "system-design", label: "System design" },
          { value: "implementation", label: "Implementation detail" }
        ],
        default: "system-design"
      },
      {
        kind: "select",
        key: "deliveryMechanism",
        label: "How should this walkthrough be delivered?",
        options: [
          { value: "presentation", label: "Presentation", hint: "Reuse approved planning artifacts when present and rebuild the standalone deck." },
          { value: "socratic-walkthrough", label: "Socratic walkthrough", hint: "Explore the approved curriculum through an interactive guide." }
        ],
        default: "presentation"
      }
    ]
  }),
  parse: (_origin, inputs) => parseVariables(inputs),
  graph: SolutionWalkthroughGraph
});
function parseVariables(variables) {
  return {
    story: parseText(variables.story, "story"),
    sources: {
      currentStatePath: parsePath(variables.currentStatePath, "currentStatePath", "scratch/story/design/current-state.md"),
      architecturePath: parsePath(variables.architecturePath, "architecturePath", "scratch/story/design/architecture.md"),
      programDesignPath: parsePath(variables.programDesignPath, "programDesignPath", "scratch/story/design/program-design.md")
    },
    reviewDirectory: parsePath(variables.reviewDirectory, "reviewDirectory", "scratch/story/walkthrough"),
    audienceProfile: {
      familiarity: parseEnum(variables.familiarity, "familiarity", familiarityLevels, "new"),
      technicalDepth: parseEnum(variables.technicalDepth, "technicalDepth", technicalDepthLevels, "system-design")
    },
    deliveryMechanism: parseEnum(variables.deliveryMechanism, "deliveryMechanism", deliveryMechanisms, "presentation")
  };
}
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new Error(`${key} must be non-empty text.`);
}
function parsePath(value, key, fallback) {
  if (value === void 0) return fallback;
  return parseText(value, key);
}
function parseEnum(value, key, options, fallback) {
  const candidate = value === void 0 ? fallback : value;
  if (typeof candidate === "string" && options.includes(candidate)) return candidate;
  throw new Error(`${key} must be one of ${options.join(", ")}.`);
}
export {
  index_default as default
};
