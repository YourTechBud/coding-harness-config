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
  return `Let's brainstorm which documentation updates would be valuable now that this story has been implemented.

${designContext(input)}
Implementation plan: ${input.entryPlanPath}
Implementation decision log: ${input.decisionLogPath}

Read the relevant inputs and existing documentation, and explore the code as needed to understand what was actually implemented.

Keep both new documentation and updates to existing documentation within ADRs and durable, high-level overviews that will remain useful over the longer term. No documentation changes may be necessary.

Start with a concise assessment of worthwhile changes and the questions or options we should discuss. Keep this opening turn focused on discovery; I will steer what we actually write or update.`;
}
