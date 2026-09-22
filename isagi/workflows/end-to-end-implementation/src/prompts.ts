type DesignInputs = {
  readonly story: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

function designContext(input: DesignInputs): string {
  return `Story: ${input.story}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program design: ${input.programDesignPath}`;
}

export function uiDiscoveryPrompt(input: DesignInputs): string {
  return `Let's brainstorm which UI pieces need to be mocked for this story.

${designContext(input)}

Read these documents and explore the relevant existing UI and code to ground the discussion. We will work together to create throwaway, presentation-only mocks using standalone HTML files or temporary routes in the relevant frontend environment.

Start with a concise assessment of the UI pieces worth exploring and any questions that would help me decide what to do. Keep this opening turn focused on discovery; I will steer the scope and subsequent mock creation.`;
}

export function uiBriefPrompt(uiBriefPath: string): string {
  return `Write a concise UI brief at ${uiBriefPath} summarizing the outcome of this session for a fresh implementation planner.

Capture decisions, what was created, and where the mocks exist, including relevant file paths, routes, and how to view them. Give the planner enough context to use the designs without access to this conversation.

If no UI mocks were needed or created, capture that outcome. Keep the brief simple and report its path when finished.`;
}

export function documentationDiscoveryPrompt(input: DesignInputs & {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
}): string {
  return `Let's brainstorm whether this implementation warrants any long-term documentation changes. Prefer leaving documentation unchanged.

${designContext(input)}
Implementation plan: ${input.entryPlanPath}
Implementation decision log: ${input.decisionLogPath}

Read the relevant inputs and existing documentation, and explore the code as needed to understand what was actually implemented.

Suggest only the smallest changes that correct existing documentation made wrong, misleading, irrelevant, or contradictory by the implementation, or fill a material gap in durable, 10,000-foot architectural understanding. Prefer a targeted correction to an existing document over a new document. New material should help future readers understand the system well beyond this story, rather than recap its implementation or duplicate details available in code, tests, plans, or the decision log.

Apply the same threshold to ADRs: propose one only for a consequential architectural decision whose rationale and trade-offs will matter to future decisions. A completed story or an entry in the implementation decision log is not by itself a reason for an ADR. Preserve historically accurate ADR context; use the repository's amendment or supersession conventions when a decision has changed.

Give a concise assessment. For each proposed change, identify the document or gap and explain the lasting value or specific misleading claim it fixes. If nothing clears this threshold, say that no documentation changes are needed and stop without offering optional additions. Keep this opening turn focused on assessment; I will decide what, if anything, we write or update.`;
}
