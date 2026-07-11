# coding-harness-config

Shared config directory containing **skills**, **commands/prompts**, **agents**, and **extensions** for the various coding harnesses YourTechBud uses (OpenCode, Pi, Claude Code, Codex).

Canonical assets live under `source/`. Harness outputs are generated as direct root directories (`opencode`, `pi`, `claude`, `codex`) and committed for direct consumption.

## Install / sync

Generated assets are copied into each harness home. The installer tracks managed top-level units in repo-local manifests under `.install-manifests/`, which is gitignored. Each manifest records the resolved harness home so installs and clears do not accidentally reuse ownership state for a different destination.

The ownership unit is the first child under each installed prefix, such as `skills/brainstorming`, `commands/plan-docs.md`, `agents/reviewer.md`, or `extensions/webfetch`. On install, previously managed units are replaced, stale managed units are removed, and exact unowned matches are adopted into the manifest. Unowned destination collisions that differ from generated output are skipped and reported. `clear` removes manifest-owned units even if they no longer exist in generated output.

Install or refresh all harnesses after generation:

```sh
pnpm run harness:install
```

Regenerate once, then install all harnesses:

```sh
pnpm run harness:sync
```

Remove only files installed by this repo:

```sh
pnpm run harness:clear
```

Per-harness install/clear scripts are also available:

```sh
pnpm run codex:install   # or codex:clear
pnpm run opencode:install
pnpm run pi:install
pnpm run claude:install
```

## Install locations

| Harness     | Destination                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| Codex       | `${CODEX_HOME:-~/.codex}/skills`, `${CODEX_HOME:-~/.codex}/agents`              |
| OpenCode    | `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/skills`, `commands`, `agents`       |
| Pi          | `${PI_CODING_AGENT_DIR:-~/.pi/agent}/skills`, `prompts`, `agents`, `extensions` |
| Claude Code | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills`, `agents`                              |

## Settings operations

Some harnesses have generated `settings.operations.json` files. During install, these operations are merged into the harness settings without overwriting conflicting user settings:

- `setIfMissing` sets a whole settings path only when that path is absent.
- `appendIfMissing` appends an array item only when a matching item is absent.

During clear, the inverse is applied safely: settings are removed only when the current value still exactly matches the generated operation value. Malformed destination JSON causes the install or clear command to fail.

OpenCode settings operations target `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/opencode.json`. Pi settings operations target `${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json`.

The installer copies Pi skills, prompts, agents, and extensions directly from `pi/` into `${PI_CODING_AGENT_DIR:-~/.pi/agent}`, so Pi settings do not need repo-local `skills`, `prompts`, `agents`, or `extensions` paths.

`pnpm run generate` runs `npm install` for generated Pi extensions that contain a `package.json`. `pnpm run harness:install` then copies the generated extensions, including installed `node_modules`, into the Pi agent home.

The Pi `codex-fast-model` extension reads `codexFastModels` and registers `openai-codex/gpt-5.5-fast` as a local alias that sends upstream requests to `gpt-5.5` with `service_tier: "priority"`.

## Maintenance

Edit canonical assets under `source/`, then run:

```sh
pnpm run generate
pnpm run harness:install
pnpm run check
```

Do not edit `opencode`, `pi`, `claude`, or `codex` directly; they are destructively regenerated.

## Credits

Here's a couple of skill I have taken heavy inspiration from:

1. Matt Pocock's Skill library: https://github.com/mattpocock/skills
   - Code Review Skill

Do check those repo's our and consider leaving them a star!
