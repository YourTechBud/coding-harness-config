import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export async function loadInstructions(directory: string): Promise<string> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
		throw error;
	}
	const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
	const bodies = await Promise.all(names.map(async (name) => (await readFile(join(directory, name), "utf8")).trim()));
	return bodies.filter(Boolean).join("\n\n");
}

export default function commonInstructions(pi: ExtensionAPI) {
	const directory = join(resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")), "instructions");
	pi.on("before_agent_start", async (event) => {
		const instructions = await loadInstructions(directory);
		// Append to the chained prompt so other extensions retain their contributions.
		if (instructions) return { systemPrompt: `${event.systemPrompt}\n\n${instructions}` };
	});
}
