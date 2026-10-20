---
name: fix-bug
description: |
  Take a described bug through subagent reproduction, class-versus-instance fix analysis, a user decision, and verification against the original reproduction. Invoke only when explicitly asked to fix a bug with this process.
---

# Fix Bug

Take the bug the user has described from a confirmed reproduction to a verified fix, with the user choosing which fix to make. This process guards against three failures: fixing a different bug from the one the user saw, patching the symptom when the defect calls for a structural change, and finishing without evidence that the bug is gone.

## Reproduce and trace

Delegate reproduction to a subagent, giving it the observed and expected behavior and everything the user shared.

The reproducer builds an executable reproduction that fails because of the bug. It prefers the cheapest faithful route: existing tests or commands, then fixtures and mocks, and running the app only as a last resort after the user agrees. Static analysis helps decide where to look but does not count as reproduction. Mocks stay away from the suspected defect so the reproduction exercises the real faulty code and cannot fail or later pass because of the mocks.

Reproduction code is throwaway. The reproducer keeps it together in the project's gitignored scratch directory, or in its fixtures directory when that fits better, and reports:

- the single command that runs the reproduction
- the observed and expected outcomes
- the mechanical cause: the chain from input to the point where behavior goes wrong, with evidence

When the reproduction diverges from what the user described, or the bug cannot be reproduced, stop and bring that back to the user with what was reproduced or tried, the remaining hypotheses, and what information would help. Otherwise continue.

## Analyze fixes

Delegate fix analysis to one subagent, giving it the reproducer's report. The analyst first establishes the structural cause: what this bug is an instance of, which layer should own the responsibility that failed, and where else the same weakness exists. It derives the class fix from that before considering the instance fix, so the quick fix does not anchor the ideal one.

- **Class fix:** the change that removes the whole category of bug at the layer that should own it, including re-architecture, a new ADR, or changes to existing ADRs when the fix calls for them.
- **Instance fix:** the smallest change that makes the reproduction pass where the symptom appears.

When the defect already sits in the owning layer, the two fixes are the same and the analyst says so. The analyst describes what each fix involves and its consequences; whether the class fix is worth doing now is the user's call.

## Decide with the user

Read the code the analysis depends on before presenting, so you can reason about the fixes with the user rather than relay a summary. Present the reproduction, the mechanical and structural causes, and both fixes. Discuss freely; implementation begins once the user chooses a fix.

## Fix and verify

Implement the chosen fix, including any ADR changes, yourself or through a subagent only after explicit human approval. Verify by running the original reproduction unchanged: it failed before the fix and must pass now. Then delete the reproduction code and confirm none of it remains in the working tree.
