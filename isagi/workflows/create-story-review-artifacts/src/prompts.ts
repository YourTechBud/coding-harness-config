export const PROMPT_FOOTER =
  "Work unattended and finish the requested artifact in this turn. Do not run any tasks/shell commands in the background, but you are allowed to run tasks and shell commands in the foreground.";

type SharedPromptInput = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly sourcePath: string;
  readonly outputPath: string;
};

export function currentStatePrompt(
  input: SharedPromptInput & { readonly architectureOutputPath: string },
): string {
  return withPromptFooter(`Create the current-state review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Restore the reader's story-relevant understanding of how the code works today and how the relevant code is laid out.
Depth: Concise orientation. Make the overview useful for a quick memory refresh while allowing deeper inspection where it materially helps comprehension.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a “What's next?” section with an HTML link whose href is exactly "./architecture.html" and whose destination is ${input.architectureOutputPath}. That destination will be created by a later workflow turn; add the link now and do not create the destination in this turn.`);
}

export function architecturePrompt(
  input: SharedPromptInput & { readonly programDesignOutputPath: string },
): string {
  return withPromptFooter(`Create the architecture review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Explain the planned change from a 10,000-foot view, including the important boundaries, interactions, and consequential engineering decisions.
Depth: Moderate. Give enough context to judge the direction without turning the artifact into an implementation-level specification.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a “What's next?” section with an HTML link whose href is exactly "./program-design.html" and whose destination is ${input.programDesignOutputPath}. That destination will be created by a later workflow turn; add the link now and do not create the destination in this turn.`);
}

export function programDesignPrompt(input: SharedPromptInput): string {
  return withPromptFooter(`Create the program-design review artifact for this implementation story.

Story: ${input.story}
Repository: ${input.repositoryPath}
Source of truth: ${input.sourcePath}
Output: ${input.outputPath}

Objective: Make the proposed implementation shape reviewable, with emphasis on exact contracts, component interactions, state, failure behavior, and other mechanics where human feedback has the greatest impact.
Depth: Detailed, while keeping the first layer fast to scan.
Artifact: Create a self-contained HTML document at the exact output path. Lead with the overview, use visual explanations for concepts that are easier to scan than prose, and use progressive disclosure or lightweight interaction when useful. Treat the supplied source as authoritative and follow its references when that helps explain it.

Create only ${input.outputPath}. Include a “What's next?” section that tells the reader to return to the active Plan Story workflow, update the planning sources if desired, and press Continue when the design is approved. The implementation plan is intentionally created only after that approval.`);
}

function withPromptFooter(body: string): string {
  return `${body}\n\n${PROMPT_FOOTER}`;
}
