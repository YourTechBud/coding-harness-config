import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { WRITER_ROUTING_INSTRUCTIONS, REVIEWER_ROUTING_INSTRUCTIONS } from 'isagi-workflow-common-graphs';

import { withPromptFooter } from './prompts.js';

export { parseWriterRoute, parseReviewerRoute, type WriterRoute, type ReviewerRoute } from 'isagi-workflow-common-graphs';

export function latestAssistantTurnText(
  history: readonly WorkflowConversationMessage[],
): string | null {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant' && completeMessageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;

  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') {
      precedingUserIndex = index;
      break;
    }
  }

  const turn = history
    .slice(precedingUserIndex + 1, finalAssistantIndex + 1)
    .filter((message) => message.role === 'assistant')
    .map(completeMessageText)
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
  return turn.length > 0 ? turn : null;
}

export function writerRoutingPrompt(input: {
  readonly writerResponse: string;
  readonly artifactPath: string;
  readonly artifactExists: boolean;
}): string {
  return withPromptFooter(`You are an unattended routing judgment for an architecture writer.

Architecture artifact path: ${input.artifactPath}

Nonempty artifact file exists: ${input.artifactExists}

Writer response:
${input.writerResponse}

${WRITER_ROUTING_INSTRUCTIONS}`);
}

export function reviewerRoutingPrompt(input: { readonly review: string }): string {
  return withPromptFooter(`You are an unattended routing judgment for an architecture reviewer.

Reviewer response:
${input.review}

${REVIEWER_ROUTING_INSTRUCTIONS}`);
}

function completeMessageText(message: WorkflowConversationMessage): string {
  return message.parts
    .filter((part) => part.type === 'text' && part.state !== 'streaming')
    .map((part) => part.text)
    .join('\n')
    .trim();
}
