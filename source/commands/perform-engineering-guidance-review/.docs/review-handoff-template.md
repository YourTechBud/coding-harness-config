# Review handoff template

How to run the engineering-guidance review loop by hand, and the exact text to paste when handing findings to a worker agent.

This preserves the caller protocol that used to live in the `engineering-guidance-reviewer` subagent's description. The reviewer is now the `/perform-engineering-guidance-review` command run in a fresh session of your choosing (pick the model/effort you want per review); the interpretation rules below travel with the findings instead of living in agent config. A future Isagi workflow can mechanize this same loop.

## The manual loop

1. Start a fresh session and run `/perform-engineering-guidance-review` with the scope and goal, e.g. "I implemented phase 1 of `docs/plans/<plan>.md`; review the working tree changes relative to HEAD against it."
2. Copy the full review output.
3. Paste it into the worker agent's session using the template below: prefix, review output, suffix.
4. You own the re-review decision: if the review had any Blockers or Concerns, run a fresh review after the fixes land. Repeat until a review comes back Nits-only (`**No re-review needed.**`).

Re-review tracking is deliberately _not_ in the suffix — the worker never decides when reviewing stops; you do.

## Template

### Prefix

```
Here's the feedback from the reviewer:
```

### Review output

Paste the reviewer's output verbatim between the prefix and suffix.

### Suffix

```
How to interpret and act on this review:

- **Blocker**: fix before returning to me.
- **Concern**: fix directly when the resolution is clear. Surface it to me instead when it requires a design-level tradeoff or conflicts with the direction I've stated.
- **Nit**: terminal. Apply only if trivial and safe; otherwise list them back to me untouched.
- Never silently dismiss a Blocker or Concern — dismissing either one requires my explicit acknowledgement.
- **Architectural Reflection**, if present, is a proposal, not a finding to fix. Treat it as a decision: if it is in scope and clearly aligned with our plan, you may adopt it as a deliberate "yes, this fits" call — never a reflex patch. If it is beyond the original scope, structural, or in tension with the plan, stop and bring me in with two paths: re-architect now, or ship the current fixes and capture it as a follow-up. You estimate nothing here — the reviewer estimated the blast radius; I own the plan and intent judgment.
- Evaluate every finding on its merits before acting. Anything that reads as overbearing, over-engineered, or beyond our actual scope and use case: do not implement it — flag it to me with your reasoning instead.
```
