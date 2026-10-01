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

// src/graph.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve3 } from "node:path";

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
        return _({
          update: { agent: { agentSessionId: spawned.agentSessionId, paneId: spawned.paneId }, turn: { agentSessionId: spawned.agentSessionId, sentAt: spawned.sentAt } },
          wait: y.agentTurn(spawned)
        });
      }
      const { agentSessionId, paneId } = request.session;
      const sent = await ctx.sendAgentPrompt({ agentSessionId, prompt: request.prompt, modifiers: request.modifiers });
      return _({ update: { agent: { agentSessionId, paneId }, turn: sent }, wait: y.agentTurn(sent) });
    }, { title: "Send the prompt", label: (state) => state.request.label }),
    resubmit: l2(async (ctx, state) => {
      const { label, prompt, modifiers } = state.request;
      const agent = must(state.agent, "agent");
      const role = label.toLowerCase();
      await ctx.setUiFeedback({ kind: "warning", phase: `Retrying ${role}`, message: `The ${role} harness turn failed. Resubmitting its previous message.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: agent.agentSessionId, prompt, modifiers });
      await ctx.log("warning", `Resubmitted the previous message after harness_error ${state.resubmits + 1}/${state.request.resubmitOnHarnessError ?? 0} to ${role} session ${agent.agentSessionId}.`);
      return _({ update: { turn: sent, resubmits: state.resubmits + 1 }, wait: y.agentTurn(sent) });
    }, { title: "Resubmit after a harness error" }),
    askUser: l2(async (ctx, state) => {
      const { label } = state.request;
      const { paneId } = must(state.agent, "agent");
      const where = paneId === null ? "its pane" : `pane ${paneId}`;
      await ctx.setUiFeedback({ kind: "warning", phase: `${label} stopped`, message: `Continue the agent in ${where} by hand until it finishes, then select Continue.` });
      await ctx.log("warning", must(state.stalled, "stalled turn"));
      return _({ wait: y.userContinue(`${label} stopped. Continue the agent by hand, then Continue.`) });
    }, { title: "Ask the user to finish the agent" }),
    recheck: l2(async (_ctx, state) => _({ wait: y.agentTurn(must(state.turn, "turn")) }), { title: "Check the latest turn" })
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

// ../../workflow-libraries/common-graphs/src/fail-step.ts
async function failStep(ctx, feedback, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", ...feedback });
  await ctx.log("error", diagnostic);
  throw new Error(diagnostic);
}

// src/constants.ts
var curriculumDesigner = {
  harness: "codex",
  model: "gpt-6.1-sol",
  effort: "high"
};

// src/contracts.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// src/types.ts
var coverageRoles = ["primary", "supporting", "reference"];
var coverageVisibilities = ["required", "optional"];
var cognitionBudgetConstraints = ["outcome-limit", "neighborhood-limit"];

// src/contracts.ts
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

// src/inputs.ts
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

// src/prompts.ts
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

// src/graph.ts
function designCurriculumParameters(repositoryPath, variables) {
  const { repositoryPath: _repositoryPath, ...parameters } = parseInputs(repositoryPath, variables);
  return parameters;
}
var DesignCurriculumGraph = m({
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
    input: c.replace(),
    designer: c.replace(),
    turn: c.replace(),
    analysis: c.replace(),
    created: c.replace(),
    failure: c.replace()
  },
  entry: "prepareOutput",
  nodes: {
    prepareOutput: l(async (_ctx, state) => {
      mkdirSync(resolve3(state.input.repositoryPath, state.input.paths.outputDirectory), { recursive: true });
      return g();
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
    readAnalysis: l(async (ctx, state) => {
      try {
        const analysis = readAnalysis(state.input.repositoryPath, state.input.learningGoal, state.input.audience, state.input.sources, state.input.paths);
        return g({ update: { analysis } });
      } catch (error) {
        return failStep(ctx, { phase: "Curriculum design failed", message: "The curriculum analysis artifact is invalid. Its pane remains open." }, errorText(error));
      }
    }, { title: "Read the curriculum analysis" }),
    designCurriculum: agentTurn({
      title: "Design the curriculum",
      parameters: (state) => ({
        label: "Curriculum design",
        session: { kind: "existing", ...must2(state.designer, "designer") },
        prompt: curriculumPrompt(state.input, must2(state.analysis, "analysis")),
        feedback: { phase: "Designing the curriculum", message: "Organizing outcomes and coverage obligations." }
      }),
      onResult: (_state, turn) => ({ turn })
    }),
    finish: l(async (ctx, state) => {
      const analysis = must2(state.analysis, "analysis");
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
        return failStep(ctx, { phase: "Curriculum design failed", message: "The curriculum artifact is invalid. Its pane remains open." }, errorText(error));
      }
      await ctx.closePane(ownedPane(must2(state.designer, "designer")));
      return g({ update: { created } });
    }, { title: "Read the curriculum and close the designer" }),
    reportFailure: l(async (ctx, state) => {
      const failure = must2(state.failure, "failure");
      await ctx.setUiFeedback({ kind: "error", phase: "Curriculum design failed", message: failure.message });
      await ctx.log("error", failure.diagnostic);
      return g();
    }, { title: "Report the failure" })
  },
  edges: {
    afterPrepareOutput: f({ from: "prepareOutput", to: ["analyzeSources"], choose: () => ({ to: "analyzeSources" }) }),
    afterAnalyzeSources: afterAgentTurn("analyzeSources", "readAnalysis", "Curriculum analysis failed because the designer session ended."),
    afterReadAnalysis: f({ from: "readAnalysis", to: ["designCurriculum"], choose: () => ({ to: "designCurriculum" }) }),
    afterDesignCurriculum: afterAgentTurn("designCurriculum", "finish", "Curriculum design failed because the designer session ended."),
    afterFinish: f({ from: "finish", to: ["created"], choose: () => ({ to: "created" }) }),
    afterReportFailure: f({ from: "reportFailure", to: ["failed"], choose: () => ({ to: "failed" }) })
  },
  outcomes: {
    created: p({ kind: "success", title: "Curriculum created", output: (state) => must2(state.created, "created curriculum") }),
    failed: p({ kind: "failure", title: "Curriculum design failed", output: (state) => ({ outcome: "failed", reason: must2(state.failure, "failure").diagnostic }) })
  }
});
function afterAgentTurn(from, next, message) {
  return f({
    from,
    to: [next, "reportFailure"],
    choose: (state) => {
      const turn = must2(state.turn, "agent turn");
      if (turn.outcome === "interrupted") return { to: "reportFailure", update: { failure: { message, diagnostic: turn.reason } } };
      return { to: next };
    }
  });
}
function must2(value, label) {
  if (value === null) throw new Error(`Design curriculum state is missing its ${label}.`);
  return value;
}
function errorText(value) {
  return value instanceof Error ? value.message : String(value);
}

// src/index.ts
var index_default = h({
  command: () => ({
    title: "Design Curriculum",
    description: "Create a focused curriculum from one or more Markdown sources.",
    inputs: [
      { kind: "text", key: "sources", label: "Markdown source paths, one per line", placeholder: "docs/source-one.md\ndocs/source-two.md" },
      { kind: "text", key: "learningGoal", label: "What should the audience understand or be able to decide?" },
      { kind: "text", key: "audienceFamiliarity", label: "Describe what the audience already knows", default: "The audience is new to the subject and needs essential context." },
      { kind: "text", key: "audienceDepth", label: "Describe the depth of understanding needed", default: "The audience needs enough depth to understand and make the decision described by the learning goal." },
      { kind: "text", key: "teachingBrief", label: "Optional teaching guidance", default: "Choose the clearest storyline for this audience and learning goal." },
      { kind: "text", key: "outputDirectory", label: "Curriculum output directory", default: "scratch/story/curriculum" }
    ]
  }),
  parse: (origin, inputs) => designCurriculumParameters(origin.worktreePath, inputs),
  graph: DesignCurriculumGraph
});
export {
  index_default as default
};
