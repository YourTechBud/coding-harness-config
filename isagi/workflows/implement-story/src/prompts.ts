export const PROMPT_FOOTER =
  'Do not run any tasks in the background, but you are allowed to run tasks and shell commands in the foreground.';

export function plannerPrompt(input: {
  readonly repositoryPath: string;
  readonly story: string;
  readonly planDirectory: string;
  readonly entryPlanPath: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
  readonly uiBriefPath: string;
}): string {
  return withPromptFooter(`Create the complete implementation plan using the create-implementation-plan skill for this story using the engineering documents and UI brief.

Repository: ${input.repositoryPath}
Story: ${input.story}
Explicit plan directory: ${input.planDirectory}
Entry plan path: ${input.entryPlanPath}
Current-state analysis: ${input.currentStatePath}
Architecture: ${input.architecturePath}
Program design: ${input.programDesignPath}
UI brief: ${input.uiBriefPath}

Read the inputs and inspect the relevant repository code and referenced mocks. Use the explicit plan directory exactly. Treat files under its artifacts directory as read-only inputs and place index.md and every phase file in the plan directory root.

For this plan, omit mock-UI phases and repository documentation work. UI exploration has already happened under human direction; the brief captures its outcome and decisions. Treat the session-created mocks as throwaway artifacts and account for their removal or replacement with production implementation within the implementation phases.

If you encounter consequential ambiguity, missing UI context, or inconsistency between the mocks, brief, and engineering documents, explain the concern and stop for human reconciliation.

Write index.md last, only when the complete plan is ready and there are no unresolved escalations. Finish by reporting the entry plan path.`);
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
