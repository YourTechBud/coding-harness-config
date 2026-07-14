export function reviewToFixerPrompt(review: string): string {
  return `Heres the feedback from the reviewer:

${review}

How to interpret and act on this review:
- **Blocker**: fix before returning to me.
- **Concern**: fix directly when the resolution is clear. Surface it to me instead when it requires a design-level tradeoff or conflicts with the direction Ive stated.
- **Nit**: terminal. Apply only if trivial and safe; otherwise list them back to me untouched.
- Never silently dismiss a Blocker or Concern — dismissing either one requires my explicit acknowledgement.
- **Architectural Reflection**, if present, is a proposal, not a finding to fix. Treat it as a decision: if it is in scope and clearly aligned with our plan, you may adopt it as a deliberate "yes, this fits" call — never a reflex patch. If it is beyond the original scope, structural, or in tension with the plan, stop and bring me in with two paths: re-architect now, or ship the current fixes and capture it as a follow-up. You estimate nothing here — the reviewer estimated the blast radius; I own the plan and intent judgment.
- Evaluate every finding on its merits before acting. Anything that reads as overbearing, over-engineered, or beyond our actual scope and use case: do not implement it — flag it to me with your reasoning instead.
- Don't run background tasks or shell commands.`;
}

export function fixerToReviewerPrompt(fixerResponse: string): string {
  return `Heres the implementers response to your review:

${fixerResponse}

Now run a re-review round:
1. **Verify the fixes.** For every finding the implementer claims to have addressed, read the current code and confirm the fix is real and complete. Do not trust the summary.
2. **Adjudicate the pushbacks.** Where the implementer declined or deferred a finding, weigh the reasoning. Withdraw the finding if the reasoning holds, or hold it if it doesnt. Never silently drop a Blocker or Concern — anything you still hold after pushback is a decision for me, not for either of you. So flag such disagreements immediately, with your justification and what it costs if unfixed.
3. **Review again.** Do a full pass over the current change set at the same standard as your original review. The fixes are new code; anything you missed earlier is fair game. Zero new findings is a valid outcome — do not pad.

Report in your usual output format, adding a fix-verification result per prior finding (verified / incomplete / not done) and your adjudication per pushback (withdrawn / held — held items listed for my decision).

You have final authority on when this loop ends. If all Blockers and Concerns are verified fixed or withdrawn — none open, none held — and nothing new beyond Nits emerged, end your response with the exact line **No re-review needed.** and state plainly that the review loop is complete. Never use that phrase in any other situation, so it stays a reliable signal that the loop is closed. Otherwise, end with exactly what must happen before the next round.`;
}
