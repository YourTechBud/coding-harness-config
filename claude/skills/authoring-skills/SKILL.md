---
name: authoring-skills
description: Author a structurally valid skill from requirements already settled in the conversation
disable-model-invocation: true
---

# Authoring Skills

Author the skill now from the behavior, boundaries, and decisions already established in the conversation and any supplied specification.

User-supplied authoring request:

$ARGUMENTS

Treat the established decisions as the source of truth. Resolve details from the conversation, supplied materials, repository instructions, and target harness conventions before asking the user; ask only when a missing decision materially changes the skill and cannot be recovered from context.

## Guidance

Before writing, read the current versions of these guides completely:
- Fable 5.1: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
- GPT 6: https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra

Follow the applicable repository and harness instructions when they define the canonical source format, supported metadata, invocation policy, resource layout, or validation command.

## Authoring Standard

- Encode the intended behavior, outcome, decision boundaries, required evidence, and completion criteria. Prescribe a process only when its order or mechanics materially affect the result.
- Trust the model to choose among valid approaches. Match specificity to fragility: use exact instructions for invariants and failure-prone operations, and leave contextual judgment open.
- Make every instruction earn its context. Audit each sentence in isolation for a behavioral change relative to the target model's default, and delete the whole sentence when it is a no-op.
- Phrase the desired behavior positively. Use a prohibition only for a genuine guardrail that cannot be expressed positively, and pair it with the behavior to follow instead.
- Keep each meaning in one authoritative place. Treat repository files, tool help, and target specifications as sources of truth; point to them when lookup is cheap instead of copying facts that can drift.
- Add examples, scripts, references, assets, or auxiliary metadata only when they materially improve behavior, reliability, or discovery.
- Write the description for the intended invocation policy. For model-invoked skills, state what the skill does and the distinct contexts that should trigger it without padding the description with synonymous triggers or body content; for explicit-only skills, use a concise human-facing summary.
- Keep conditional detail behind direct, condition-bearing pointers. Inline material every invocation needs.

## Completion

Create the skill in its canonical source location and produce every file required by the target format. When a repository generates harness-specific outputs, change the canonical source and use its generator rather than editing generated files directly.

Validate the skill's name, required metadata, invocation policy, resource paths, links, and generated structure with the repository's relevant checks. Fix structural failures before finishing; if a required check cannot run, report the limitation and the strongest check completed instead.

Finish by reporting the authored files and validation results. Leave installation, publishing, and broader evaluation to a separate explicit request.
