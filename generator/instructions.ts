import * as fs from "node:fs/promises";
import * as path from "node:path";
import { END, START, patchInstructionBlock } from "./instruction-block.ts";

export interface Instruction {
	name: string;
	content: string;
}

function isInstructionName(name: unknown): name is string {
	return typeof name === "string" && name.endsWith(".md") && !name.includes("/") && !name.includes("\\") && !name.includes("\0");
}

export async function readInstructions(directory: string): Promise<Instruction[]> {
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const names = entries.filter((entry) => entry.isFile() && isInstructionName(entry.name)).map((entry) => entry.name).sort();
	return Promise.all(names.map(async (name) => ({ name, content: await fs.readFile(path.join(directory, name), "utf8") })));
}

interface InstructionManifest {
	version: 1;
	home: string;
	target: string;
	files: string[];
}

interface InstructionOptions {
	home: string;
	generatedRoot: string;
	manifestPath: string;
	/** Native global instruction file; absent for Pi's Markdown directory. */
	instructionsFile?: string;
}

async function statIfExists(file: string) {
	try {
		return await fs.lstat(file);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function readManifest(file: string, home: string, target: string): Promise<InstructionManifest | undefined> {
	if (!(await statIfExists(file))) return undefined;
	const value = JSON.parse(await fs.readFile(file, "utf8")) as InstructionManifest;
	if (!value || value.version !== 1 || value.home !== home || value.target !== target || !Array.isArray(value.files) || !value.files.every(isInstructionName) || new Set(value.files).size !== value.files.length) {
		throw new Error(`Invalid or mismatched instruction inventory: ${file}. Inventory and installed instructions preserved.`);
	}
	return value;
}

async function readGenerated(directory: string): Promise<Instruction[]> {
	// A committed index distinguishes an intentionally empty set from missing generation.
	const names: unknown = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
	if (!Array.isArray(names) || !names.every(isInstructionName) || new Set(names).size !== names.length) {
		throw new Error(`Invalid generated instruction index: ${directory}`);
	}
	const instructions = await Promise.all([...names].sort().map(async (name) => ({ name, content: await fs.readFile(path.join(directory, name), "utf8") })));
	for (const { name, content } of instructions) {
		if (content.includes(START) || content.includes(END)) throw new Error(`Instruction ${name} contains reserved ownership markers.`);
	}
	return instructions;
}

/** Only this explicit operation reconciles instruction content; resource installs never call it. */
export async function applyInstructions(options: InstructionOptions, command: "install" | "clear"): Promise<void> {
	const { home, generatedRoot, manifestPath, instructionsFile } = options;
	const target = instructionsFile ?? "instructions";
	const previous = await readManifest(manifestPath, home, target);
	if (command === "clear" && !previous) return;
	const desired = command === "install" ? await readGenerated(path.join(generatedRoot, "instructions")) : [];
	const destination = path.join(home, target);
	const destinationStat = await statIfExists(destination);
	if (destinationStat?.isSymbolicLink()) throw new Error(`Instruction destination is a symlink; preserved: ${destination}`);

	if (instructionsFile) {
		const current = destinationStat ? await fs.readFile(destination, "utf8") : "";
		const next = patchInstructionBlock(current, desired.map(({ content }) => content.trim()).filter(Boolean).join("\n\n"), command);
		if (next !== current) {
			await fs.mkdir(home, { recursive: true });
			if (next.trim().length === 0) await fs.rm(destination);
			else await fs.writeFile(destination, next);
		}
	} else {
		if (destinationStat && !destinationStat.isDirectory()) throw new Error(`Instruction destination is not a directory: ${destination}`);
		const owned = new Set(previous?.files ?? []);
		// Preflight collisions before removing stale files or overwriting owned content.
		for (const { name } of desired) {
			if (!owned.has(name) && await statIfExists(path.join(destination, name))) {
				throw new Error(`Unowned instruction already exists; preserved: ${path.join(destination, name)}`);
			}
		}
		const desiredNames = new Set(desired.map(({ name }) => name));
		for (const name of owned) {
			if (!desiredNames.has(name)) await fs.rm(path.join(destination, name), { recursive: true, force: true });
		}
		for (const { name, content } of desired) {
			await fs.mkdir(destination, { recursive: true });
			// Unlink owned paths first so drift to a symlink never overwrites its referent.
			if (owned.has(name)) await fs.rm(path.join(destination, name), { recursive: true, force: true });
			await fs.writeFile(path.join(destination, name), content);
		}
		try {
			await fs.rmdir(destination);
		} catch (error) {
			if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		}
	}

	if (command === "clear") {
		await fs.rm(manifestPath, { force: true });
	} else {
		const manifest: InstructionManifest = { version: 1, home, target, files: desired.map(({ name }) => name) };
		await fs.mkdir(path.dirname(manifestPath), { recursive: true });
		await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
	console.log(`Instructions ${command === "install" ? "reconciled" : "cleared"}: ${destination}`);
}
