# Persistence

Use `docs/issue-tracking-guidance.md` as the repository-specific source of truth for active epic, candidate epic, and story representation. It defines the configured tracker, exact formats, headings, fields, metadata, relationships, and publication behavior for that repository.

## Using Repository Guidance

Read the complete repository guidance before drafting persisted artifacts. Apply its representation choices while preserving the epic and story semantics defined by this skill. Do not assume GitHub, Linear, or another provider; the repository guidance chooses the tracker and exact operations.

When persistence is requested and `docs/issue-tracking-guidance.md` is absent, help the user establish it before publishing epic or story objects. Treat setup as a brainstorming branch: understand the target tracker and desired review experience, converge on the mapping, and write the guidance only after the user approves persistence.

## Persistence Operations

Repository guidance maps active and candidate epics, the epic-to-story relationship, and story kinds defined in `SKILL.md` onto its chosen issue tracker. It also maps these persistence operations and conditional relationships:

- Create, retrieve, revise, remove, activate, complete, preview, and publish active epics, candidate epics, and stories.
- Preserve navigation through the epic-to-story relationship.
- Distinguish uncommitted candidate epics and preserve them without stories.
- Represent story acceptance criteria.
- Represent dependencies when one story genuinely gates another.
- Identify the epic or downstream stories that consume an exploration story's conclusions.
- Support splitting and merging by revising the affected story set and relationships.

The issue tracker may express these semantics through issue types, relationships, fields, labels, links, or native primitives. Repository guidance chooses the representation.

## Creating Repository Guidance

Help the user decide the mappings their repository needs:

- Where epics and stories live and how they are identified.
- The exact epic and story formats, including required and optional content.
- How candidate epics are identified, represented without stories, and returned to shaping when activated.
- How parent-child navigation, dependencies, and exploration consumers are represented.
- How story kinds, lifecycle state, priority, or other useful metadata are represented.
- Whether persistence is previewed before publication or published directly after approval.
- How revisions, removals, completion, and historical scope changes appear.
- Which tools or commands perform repository-specific reads and writes.

Write the resulting decisions to `docs/issue-tracking-guidance.md`. Keep the document specific enough that a fresh agent can retrieve and persist the repository's epics and stories without reconstructing the mapping.

## Persisting Shared Understanding

Mine the conversation for product intent, decisions, rationale, serious alternatives, tradeoffs, unresolved areas, boundaries, and story context that would be expensive to rediscover. Use the repository guidance's structure and include only sections supported by meaningful content.

Preserve existing user-written context and material historical reasoning when revising artifacts. Prefer focused updates when the epic's scope or story set changes, and keep ordinary engineering execution detail with the story's working conversation or temporary plan.

For candidate epics, preserve the possible outcome, its value, the reason it was deferred, and any additional context the conversation established as useful for resuming shaping. Keep the representation lightweight and omit stories until a fresh shaping discussion activates and hardens the candidate.

For exploration stories, acceptance requires reconciliation through this skill: apply the conclusions to the parent epic and every affected downstream story, then persist those changes through the repository guidance.
