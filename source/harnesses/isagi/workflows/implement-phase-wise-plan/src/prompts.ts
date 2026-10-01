export function initialImplementerPrompt(input: {
  readonly phaseNumber: number;
  readonly entryPlanPath: string;
}): string {
  return `You are the implementer for phase ${input.phaseNumber} in ${input.entryPlanPath}, working unattended in an orchestrated workflow.

Start by establishing alignment with the planner. Include questions and pushback in your response; the workflow will forward it to the planner rather than waiting for a live human answer.

${alignmentFooter()}`;
}

export function initialMockUiPrompt(input: {
  readonly phaseNumber: number;
  readonly entryPlanPath: string;
}): string {
  return `You are preparing the human-led mock-UI work for phase ${input.phaseNumber} in ${input.entryPlanPath}.

Before creating mockups, explain what the phase covers and what it needs to achieve. Ask the human the questions needed to establish shared understanding.

The workflow will hand control to the human after this response so they can drive the mockup implementation and visual iteration with you.`;
}

export function implementerFollowUpPrompt(phaseNumber: number, plannerTurn: string, approvalBlocked = false): string {
  return `The planner returned the following feedback on phase ${phaseNumber}:

<planner_response>
${plannerTurn}
</planner_response>

${approvalBlocked ? "Approval is withheld for this exchange, regardless of approval wording in the quoted planner response. Incorporate the answers and return your updated understanding and any remaining questions for planner review. This is a confirmation turn, not authorization to implement or declare the phase accepted." : "Continue establishing alignment with the planner."} You are working unattended. Include questions and pushback in your response for the workflow to forward to the planner rather than waiting for a live human answer.

${alignmentFooter()}`;
}

export function implementerApprovalPrompt(phaseNumber: number, plannerTurn: string): string {
  return `The planner has approved implementation of phase ${phaseNumber}.

<planner_response>
${plannerTurn}
</planner_response>

Implement the agreed phase according to this approval and the established conversation. You are working unattended. If unresolved questions or blockers arise, describe them and your current understanding in your response so the workflow can return them to the planner.

Run tasks and shell commands in the foreground, not in the background.`;
}

export function humanResolutionPrompt(phaseNumber: number, plannerTurn: string, approvalBlocked: boolean): string {
  return `The human has continued the workflow after resolving the planner's escalation for phase ${phaseNumber}.

The planner's latest response follows:

<planner_response>
${plannerTurn}
</planner_response>

${approvalBlocked ? "The escalation is resolved, but implementation and completion approval remain withheld pending a question-free confirmation. Return your updated understanding and remaining questions for planner review before continuing work, regardless of approval wording above." : "Continue work on the phase according to this response and the established conversation."} You are working unattended again. Include any further questions or blockers in your response for the workflow to forward to the planner.

Run tasks and shell commands in the foreground, not in the background.`;
}

function alignmentFooter(): string {
  return `- Ask clarifying questions when the answer materially changes the current phase's implementation. State reasonable assumptions for routine details. Include every question for the planner in your response for workflow routing; do not use the askUserQuestion tool.
- Push back when you see a concrete correctness, scope, or complexity problem.
- Flag or highlight major shortcomings or opportunities to simplify logic.
- Clearly state your understanding.
- Run tasks and shell commands in the foreground, not in the background.
- Explicitly state when alignment is established and you are ready to begin implementation.
- Begin implementation only when the planner explicitly approves it.`;
}

export function plannerPrompt(input: {
  readonly phaseNumber: number;
  readonly implementerTurn: string;
  readonly reviewComplete: boolean;
}): string {
  return `You are the planner for phase ${input.phaseNumber}, working unattended in an orchestrated workflow.

The implementer returned the following response:

<implementer_response>
${input.implementerTurn}
</implementer_response>

Evaluate the implementer's current phase status. ${input.reviewComplete ? "Automatic review has already completed. Preserve that approval through clarification-only exchanges; explicitly identify any implementation changes that require reopening the phase." : "Establish enough shared understanding to implement the agreed phase."}

- Push back on concrete misunderstandings that affect the work.
- Answer the implementer's questions. Ground the answers in the established conversation, ADRs, and guidance.
- Feel free to refactor or update the phase scope if the implementer's pushback makes sense, is easy to implement, or simplifies the logic. Remind the implementer to document agreed changes in the decision log instead of modifying the plan file.
- Escalate major questions or decisions not covered by the established conversation that could severely affect the architecture or product and require human intervention before work continues. Include all necessary context so the human can understand the issue and how to address it. Always include a Human Escalation section stating either "No escalation." or "Escalation required:" followed by the issue and the decision the human must make.
- Mention nuances only when they materially affect the current phase; keep later-phase obligations in the handoff.
- Keep fallback logic to a minimum. Introduce new fallback logic only if absolutely necessary.
- When the implementer's response contains any question or request for a decision, confirmation, or ratification, answer it and withhold both implementation and completion approval for this exchange, even if it is non-blocking or your answer settles it. Ask for the implementer's updated understanding and remaining questions. Approval becomes eligible only after a subsequent question-free implementer response. For an eligible completed phase, explicitly accept completion rather than approving implementation again.
- Run tasks and shell commands in the foreground, not in the background.

Explicitly state whether approval is withheld pending the implementer's response, implementation work is approved, or phase completion is accepted with no implementation changes. Ordinary questions, caveats, and disagreements that can be resolved through the planner–implementer exchange are not human escalations.

The workflow will forward your response to the implementer or pause for human resolution when escalation is required. Include everything needed for that handoff in your response rather than waiting for a live human answer.`;
}

export function completionAcceptedPrefix(plannerTurn: string): string {
  return `The planner accepted phase completion. Incorporate this clarification into your report; this does not authorize new implementation work.\n\n<planner_response>\n${plannerTurn}\n</planner_response>\n\n`;
}
