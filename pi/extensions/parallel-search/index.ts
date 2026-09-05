import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { truncateHead, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const parameters = Type.Object({
	objective: Type.String({
		description: "Describe the search goal in a concise, standalone sentence. Name the key entity or topic.",
		minLength: 1,
		maxLength: 5000,
		pattern: "\\S",
	}),
	search_queries: Type.Array(Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }), {
		description: "Provide 1-3 keyword queries of 3-6 words each. Include the key entity or topic in every query. For multiple queries, vary names, synonyms, or angles. Do not use sentences, instructions, or site: operators.",
		minItems: 1,
		maxItems: 3,
	}),
	mode: Type.Optional(StringEnum(["turbo", "fast", "advanced"] as const, {
		description: "Defaults to fast. Use fast for most searches: quick exploration, factual lookups, and multiple calls to map breadth or clarify an undefined scope. Use advanced when the topic and research objective are well defined AND deeper evidence, cross-source synthesis, or multi-hop retrieval is needed; a narrow factual lookup still usually needs only fast. Direct and successive advanced searches are appropriate for focused depth, without a preliminary fast search. Reserve turbo for occasional quick brainstorming searches in a human-in-the-loop conversation where the user is waiting and latency matters. Turbo currently supports English and Japanese queries. Fast and turbo cost $1 per 1,000 requests; advanced costs $5 per 1,000 requests.",
	})),
	max_results: Type.Optional(Type.Integer({
		description: "Upper bound on the number of results to return. Defaults to 10 if not provided. Maximum 20; the API may return fewer results.",
		minimum: 1,
		maximum: 20,
	})),
}, { additionalProperties: false });

export type ParallelSearchInput = Static<typeof parameters>;

interface SearchResult {
	url: string;
	title?: string | null;
	publish_date?: string | null;
	excerpts: string[];
}

interface SearchResponse {
	search_id: string;
	session_id: string;
	results: SearchResult[];
	warnings?: { type: string; message: string }[] | null;
	usage?: { name: string; count: number }[] | null;
}

interface SearchDetails {
	response: SearchResponse;
	elapsedMs: number;
	fullOutputPath?: string;
}

// Retrieved text is untrusted terminal content; preserve ordinary text and line breaks.
function display(value: string): string {
	return stripVTControlCharacters(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

function preview(value: string, limit: number): string {
	const text = display(value).replace(/\s+/g, " ").trim();
	return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function domain(url: string): string {
	try { return new URL(url).hostname; } catch { return url; }
}

function validateResponse(value: unknown): asserts value is SearchResponse {
	const data = value as SearchResponse | null;
	if (!data || typeof data.search_id !== "string" || typeof data.session_id !== "string"
		|| !Array.isArray(data.results) || !data.results.every((item) => item
			&& typeof item.url === "string"
			&& (item.title == null || typeof item.title === "string")
			&& (item.publish_date == null || typeof item.publish_date === "string")
			&& Array.isArray(item.excerpts) && item.excerpts.every((text) => typeof text === "string"))
		|| (data.warnings != null && (!Array.isArray(data.warnings)
			|| !data.warnings.every((warning) => warning && typeof warning.message === "string")))) {
		throw new Error("Parallel Search returned an invalid response.");
	}
}

async function search(params: ParallelSearchInput, signal?: AbortSignal): Promise<SearchResponse> {
	signal?.throwIfAborted();
	const apiKey = process.env.PARALLEL_API_KEY?.trim();
	if (!apiKey) throw new Error("PARALLEL_API_KEY is not set. Export it in your shell and restart Pi from that shell.");
	const timeout = AbortSignal.timeout(30_000);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	try {
		const response = await fetch("https://api.parallel.ai/v1/search", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-api-key": apiKey },
			redirect: "error",
			signal: requestSignal,
			body: JSON.stringify({
				objective: params.objective,
				search_queries: params.search_queries,
				mode: params.mode ?? "fast",
				advanced_settings: { max_results: params.max_results ?? 10 },
			}),
		});
		if (!response.ok) {
			await response.body?.cancel();
			const hint = response.status === 401 || response.status === 403 ? " Check PARALLEL_API_KEY and account access."
				: response.status === 429 ? " Rate limit or quota reached; try later or check your Parallel account." : "";
			throw new Error(`Parallel Search failed (HTTP ${response.status}).${hint}`);
		}
		const data: unknown = await response.json();
		validateResponse(data);
		return data;
	} catch (error) {
		if (signal?.aborted) throw new Error("Parallel Search cancelled.");
		if (timeout.aborted) throw new Error("Parallel Search timed out after 30 seconds.");
		// Avoid leaking credentials through errors produced by networking libraries.
		const message = error instanceof Error ? error.message : "Unknown request error";
		throw new Error(message.split(apiKey).join("[REDACTED]"));
	}
}

export default function parallelSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "parallel_search",
		label: "Parallel-Search",
		description: "Search the web and return result titles, URLs, and excerpts. Defaults locally to fast mode. Output is limited to 2,000 lines or 50KB; larger responses are saved to a temporary file for reading in full.",
		promptSnippet: "Search the web with Parallel for relevant sources and excerpts; defaults to fast mode",
		parameters,
		async execute(_toolCallId, params, signal) {
			const started = performance.now();
			const response = await search(params, signal);
			const details: SearchDetails = { response, elapsedMs: Math.round(performance.now() - started) };
			const output = JSON.stringify(response, null, 2);
			const truncated = truncateHead(output);
			let text = truncated.content;
			if (truncated.truncated) {
				const directory = await mkdtemp(join(tmpdir(), "pi-parallel-search-"));
				details.fullOutputPath = join(directory, "results.json");
				await writeFile(details.fullOutputPath, output, { encoding: "utf8", mode: 0o600 });
				text += `\n\n[Output truncated. Full response saved to: ${details.fullOutputPath}]`;
			}
			return { content: [{ type: "text", text }], details };
		},
		renderCall(args, theme) {
			const lines = [theme.fg("toolTitle", theme.bold("Parallel-Search")),
				theme.bold("Objective"), display(args.objective ?? ""),
				theme.bold("Parameters"),
				`mode: ${display(args.mode ?? "fast")}${args.mode === undefined ? " (default)" : ""} · max_results: ${args.max_results ?? 10}${args.max_results === undefined ? " (default)" : ""}`];
			for (const [index, query] of (args.search_queries ?? []).entries()) {
				lines.push(`query ${index + 1}: ${display(query)}`);
			}
			return new Text(lines.join("\n"), 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("muted", "Searching…"), 0, 0);
			const details = result.details as SearchDetails | undefined;
			if (context.isError || !details?.response) {
				return new Text(theme.fg("error", display(result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n"))), 0, 0);
			}
			const { response, elapsedMs, fullOutputPath } = details;
			const lines = [theme.bold("Results") + theme.fg("success", ` · ${response.results.length} sources · ${(elapsedMs / 1000).toFixed(2)}s`)];
			for (const warning of response.warnings ?? []) lines.push(theme.fg("warning", `Warning: ${display(warning.message)}`));
			if (fullOutputPath) lines.push(theme.fg("warning", `Model output truncated. Full response: ${fullOutputPath}`));
			if (response.results.length === 0) lines.push(theme.fg("muted", "No results found."));
			const shown = expanded ? response.results : response.results.slice(0, 3);
			for (const [index, source] of shown.entries()) {
				lines.push(`${index + 1}. ${theme.fg("accent", display(source.title || "Untitled"))}`);
				lines.push(theme.fg("dim", display(expanded ? source.url : domain(source.url))));
				if (expanded && source.publish_date) lines.push(theme.fg("dim", `Published: ${display(source.publish_date)}`));
				const excerpt = preview(source.excerpts.join(" "), expanded ? 600 : 240);
				if (excerpt) lines.push(theme.fg("muted", excerpt));
			}
			if (!expanded && response.results.length > 3) lines.push(theme.fg("dim", `+ ${response.results.length - 3} more sources (expand to view)`));
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
