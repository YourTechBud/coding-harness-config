import { defineWorkflow } from "@yourtechbudstudio/isagi-workflow-sdk";

import { ImplementPhaseWisePlanGraph, type ImplementPhaseWisePlanParameters } from "./graph.js";

const autoCommitInput = {
  kind: "select" as const,
  key: "autoCommit",
  label: "Automatic commit",
  options: [
    { value: "yes", label: "Yes, create a commit after each phase" },
    { value: "no", label: "No, leave phase changes uncommitted" },
  ],
  default: "yes",
};

const autoReviewInput = {
  kind: "select" as const,
  key: "autoReview",
  label: "Automatic engineering guidance review",
  options: [
    { value: "yes", label: "Yes, review every completed phase" },
    { value: "no", label: "No, skip automatic review" },
  ],
  default: "yes",
};

const humanInTheLoopInput = {
  kind: "select" as const,
  key: "humanInTheLoop",
  label: "Human in the loop",
  options: [
    { value: "yes", label: "Yes, pause after each phase" },
    { value: "no", label: "No, run through phases" },
  ],
  default: "yes",
};

export default defineWorkflow({
  command: () => ({
    title: "Implement Phase-wise Plan",
    description:
      "Route a phase-wise plan through a fresh implementer per phase.",
    inputs: [humanInTheLoopInput, autoReviewInput, autoCommitInput],
  }),
  parse: (origin, inputs): ImplementPhaseWisePlanParameters => {
    if (origin.agentSessionId === null || origin.agentSessionId === undefined) {
      throw new Error("Start this workflow from the planner agent pane.");
    }
    return {
      options: {
        autoCommit: parseAutoCommit(inputs.autoCommit) === "yes",
        autoReview: parseAutoReview(inputs.autoReview) === "yes",
        humanInTheLoop: parseHumanInTheLoop(inputs.humanInTheLoop) === "yes",
      },
      plannerSessionId: origin.agentSessionId,
    };
  },
  graph: ImplementPhaseWisePlanGraph,
});

function parseHumanInTheLoop(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Human in the loop must be yes or no.");
}

function parseAutoReview(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic review must be yes or no.");
}

function parseAutoCommit(value: unknown): "yes" | "no" {
  if (value === undefined) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic commit must be yes or no.");
}
