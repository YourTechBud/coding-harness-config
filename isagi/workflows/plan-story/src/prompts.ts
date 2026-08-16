export const PROMPT_FOOTER =
  'Do not run any tasks in the background, but you are allowed to run tasks and shell commands in the foreground.';

export function slugPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
}): string {
  return withPromptFooter(`Choose a short, descriptive kebab-case directory slug for this implementation story.

Repository: ${input.repositoryPath}
Story: ${input.story}

Inspect the story source when needed. Return exactly one JSON object with exactly this field:
{"slug":"descriptive-story-name"}

Use lowercase ASCII letters, digits, and single hyphens. Keep the slug under 64 characters. Return no commentary, markdown, or extra JSON fields.`);
}

export function plannerPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly planDirectory: string;
  readonly entryPlanPath: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
}): string {
  return withPromptFooter(`Create the complete implementation plan for the supplied story using all three reviewed engineering artifacts.

Repository: ${input.repositoryPath}
Story: ${input.story}
Explicit plan directory: ${input.planDirectory}
Entry plan path: ${input.entryPlanPath}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program design: ${input.programDesignPath}

Use the explicit plan directory exactly. Treat the files under its artifacts directory as read-only inputs and place index.md and every phase file in the plan directory root. Work unattended, resolve uncertainty through grounded recommendations and recorded assumptions, and finish only when the complete plan is ready for implementation.`);
}

export function plannerRoutingPrompt(input: {
  readonly plannerResponse: string;
  readonly entryPlanPath: string;
}): string {
  return withPromptFooter(`You are an unattended routing judgment for an implementation-plan writer.

Expected entry plan path: ${input.entryPlanPath}

Writer response:
${input.plannerResponse}

Return exactly one JSON object with exactly this field:
{"outcome":"ready"}

Return "ready" when the writer reports that it created and finished the implementation plan at the expected directory. Return "failed" when it reports incomplete work, a different plan location, an unresolved blocker, intended future work, or a request for input instead of a completed plan.

Every outcome is valid. Return no confidence, commentary, markdown, or extra JSON fields.`);
}

export function withPromptFooter(body: string): string {
  return `${body}\n\n${PROMPT_FOOTER}`;
}
