# Sub-agents

The `task` tool runs a configured agent with isolated conversation history and waits for its response. Independent calls can run in parallel; it does not inject background completion prompts into the parent.

## New tasks and follow-ups

Create a child by supplying `agent`, `description`, and `prompt`. The response includes `task_id`. Prefer a new child for independent work.

Continue a child's task by supplying the returned `task_id`, the same `agent`, a new `description`, and a follow-up `prompt`. The child reloads its saved Pi session, including its conversation history. IDs are restored when the owning parent session is resumed or Pi is reloaded. Unknown IDs, missing session files, mismatched agent names, and concurrent calls to the same child return errors. There is no deletion operation.

```json
{"agent":"general","description":"Check the library's API","prompt":"Verify the documented API for version X. Return the supported signatures and source URLs."}
```

```json
{"agent":"general","task_id":"<returned ID>","description":"Check compatibility","prompt":"Using the API you found, verify whether it supports the supplied compatibility requirement."}
```

`/subagents` shows each child's latest invocation. Earlier messages remain in the child's session file.

## Configuration and inheritance

Agent Markdown frontmatter supplies `model` and `thinkingLevel` (or `thinking`). The parent cannot override them through the tool. Missing values use the child's previous effective settings on follow-up, or the parent's current settings for a new child. An unknown configured model returns an error rather than silently selecting another model. Agent definitions must remain discoverable for follow-ups.

Children use normal Pi resource discovery, commands, skills, context files, and extensions, with the existing base system prompt plus the agent's instructions. The runtime excludes the extension that owns `task`, including its commands and hooks, and removes `task` from the inherited active tool list. Other extensions still receive normal child-session lifecycle events, including shutdown after each invocation. Sessions share the working directory; parallel implementation tasks should have non-overlapping file scopes.

The canonical `general` agent is selected through its description when the user requests sub-agents and no specialist fits. It uses `openai-codex/gpt-5.6-sol` with low thinking and benefits from a tightly scoped prompt containing intent, outcome, context, and a procedure when useful.
