# Parallel-Search

Registers `parallel_search` in Pi using Parallel's `POST https://api.parallel.ai/v1/search` endpoint and Node's built-in fetch, with no additional runtime dependencies.

## Setup

Export `PARALLEL_API_KEY` before starting Pi. If you added the export to `~/.zshrc` after starting Pi, run `source ~/.zshrc` in your terminal and restart Pi from that shell; sourcing a child shell or using `/reload` cannot update the running parent process's environment. The extension does not read or source shell configuration.

Make changes in this canonical source directory, then run `pnpm run generate` and `pnpm run harness:install` from the repository root to refresh generated assets and global installs.

## Tool inputs

- `objective` (required): self-contained search goal, up to 5,000 characters.
- `search_queries` (required): 1–3 non-empty keyword queries, up to 200 characters each, using Parallel's recommended tool descriptions.
- `mode` (optional): `fast`, `advanced`, or `turbo`. The extension explicitly sends `fast` when omitted, overriding Parallel's upstream Advanced default.
- `max_results` (optional): integer from 1 to 20. The extension explicitly sends 10 when omitted, mapped to `advanced_settings.max_results`; fewer results may be returned.

Fast is the normal choice for exploration, factual lookups, and mapping breadth. Advanced is for well-defined objectives needing deeper evidence or multi-hop retrieval; direct and successive Advanced calls are allowed. Turbo is reserved for occasional latency-sensitive, human-in-the-loop brainstorming. Mode choice is model-guided, without approval gates, quotas, or a mandatory Fast-first sequence. Basic is excluded.

## Display and results

The call view shows the full objective, all queries, effective mode, and effective result limit, marking defaults. The normal result view shows the returned source count, request duration, and top three titles/domains with excerpt previews of up to 240 characters. Expanded results show every title, full URL, available publication date, and excerpt previews of up to 600 characters. Warnings, errors, and output truncation notices remain visible in the normal view.

The model receives the API response as JSON, including excerpts, warnings, search/session identifiers, and usage. UI previews do not shorten model evidence. Responses exceeding Pi's 2,000-line/50KB output limit are saved in full to a private temporary file, with a path in the tool result. Temporary files remain available for subsequent reads and follow the operating system's temporary-file cleanup policy.

Requests support cancellation and a 30-second timeout, with no automatic retries or mode escalation. Authentication is sent only to the fixed Parallel endpoint; redirects are rejected. The extension registers only its own tool and renderers, preserving `webfetch` and other extensions. Subagents inherit the tool when it is active through the existing subagent extension.

## References

- [Parallel recommended tool definition](https://docs.parallel.ai/search/best-practices.md)
- [Search modes](https://docs.parallel.ai/search/modes.md)
- [Search API reference](https://docs.parallel.ai/api-reference/search/search.md)
- [Result limits and advanced settings](https://docs.parallel.ai/search/advanced-search-settings.md)
