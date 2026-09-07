import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { END, START, patchInstructionBlock } from "./instruction-block.ts";
import { applyInstructions, readInstructions } from "./instructions.ts";
import commonInstructions, { loadInstructions } from "../source/harnesses/pi/extensions/common-instructions/index.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harnesses = ["codex", "opencode", "claude", "pi"];
const nativeFile = (name: string) => name === "claude" ? "CLAUDE.md" : "AGENTS.md";

async function put(file: string, content: string) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content);
}

async function generated(root: string, instructions: Record<string, string>) {
	await fs.rm(path.join(root, "instructions"), { recursive: true, force: true });
	await put(path.join(root, "instructions", "manifest.json"), JSON.stringify(Object.keys(instructions)));
	for (const [name, body] of Object.entries(instructions)) await put(path.join(root, "instructions", name), body);
}

test("explicit CLI reconciliation is independent of normal installs and clears drift without generated sources", async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "instructions-cli-"));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	await put(path.join(root, "package.json"), '{"type":"module"}');
	await fs.symlink(path.join(repo, "node_modules"), path.join(root, "node_modules"), "dir");
	for (const file of ["harness-install.ts", "instructions.ts", "instruction-block.ts", "fs.ts"]) {
		await put(path.join(root, "generator", file), await fs.readFile(path.join(repo, "generator", file), "utf8"));
	}
	const home = (name: string) => path.join(root, "homes", name);
	const env = { ...process.env, HOME: path.join(root, "homes"), CODEX_HOME: home("codex"), OPENCODE_CONFIG_DIR: home("opencode"), CLAUDE_CONFIG_DIR: home("claude"), PI_CODING_AGENT_DIR: home("pi") };
	const run = (command: string, name = "all") => execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), path.join(root, "generator", "harness-install.ts"), command, name], { env, encoding: "utf8" });
	await fs.mkdir(path.join(root, "isagi"));
	for (const name of harnesses) {
		await generated(path.join(root, name), { "02-style.md": "Style", "01-locations.md": "Locations" });
		await put(path.join(root, name, "skills", "example", "SKILL.md"), "Skill");
		if (name === "pi" || name === "opencode") await put(path.join(root, name, "settings.operations.json"), "[]");
		if (name === "pi") await put(path.join(home(name), "instructions", "99-personal.md"), "Personal");
		else await put(path.join(home(name), nativeFile(name)), "Personal before\n");
	}
	run("install");
	for (const name of harnesses) {
		if (name === "pi") assert.deepEqual(await fs.readdir(path.join(home(name), "instructions")), ["99-personal.md"]);
		else assert.equal(await fs.readFile(path.join(home(name), nativeFile(name)), "utf8"), "Personal before\n");
	}
	run("instructions");
	for (const name of harnesses) {
		const inventory = JSON.parse(await fs.readFile(path.join(root, ".install-manifests", `${name}.instructions.json`), "utf8"));
		assert.deepEqual(inventory.files, ["01-locations.md", "02-style.md"]);
		if (name !== "pi") {
			const file = path.join(home(name), nativeFile(name));
			const content = await fs.readFile(file, "utf8");
			assert.ok(content.includes("Locations\n\nStyle"));
			assert.ok(!content.includes("01-locations.md"));
			await fs.writeFile(file, content.replace("Locations\n\nStyle", "Local drift") + "Personal after\n");
		} else await put(path.join(home(name), "instructions", "01-locations.md"), "Local drift");
		await generated(path.join(root, name), { "03-new.md": "New", "02-style.md": "Updated style" });
	}
	const snapshots = await Promise.all(harnesses.map((name) => fs.readFile(name === "pi" ? path.join(home(name), "instructions", "01-locations.md") : path.join(home(name), nativeFile(name)), "utf8")));
	run("install");
	for (const [index, name] of harnesses.entries()) {
		assert.equal(await fs.readFile(name === "pi" ? path.join(home(name), "instructions", "01-locations.md") : path.join(home(name), nativeFile(name)), "utf8"), snapshots[index]);
	}
	run("instructions");
	for (const name of harnesses) {
		if (name === "pi") {
			assert.deepEqual((await fs.readdir(path.join(home(name), "instructions"))).sort(), ["02-style.md", "03-new.md", "99-personal.md"]);
			await put(path.join(home(name), "instructions", "02-style.md"), "Drift again");
		} else {
			const file = path.join(home(name), nativeFile(name));
			const content = await fs.readFile(file, "utf8");
			assert.ok(content.includes("Updated style\n\nNew"));
			assert.ok(content.startsWith("Personal before\n") && content.endsWith("Personal after\n"));
			await fs.writeFile(file, content.replace("Updated style\n\nNew", "Drift again"));
		}
		await fs.rm(path.join(root, name), { recursive: true });
	}
	run("clear");
	run("clear");
	for (const name of harnesses) {
		if (name === "pi") assert.deepEqual(await fs.readdir(path.join(home(name), "instructions")), ["99-personal.md"]);
		else {
			const content = await fs.readFile(path.join(home(name), nativeFile(name)), "utf8");
			assert.ok(content.startsWith("Personal before\n") && content.endsWith("Personal after\n"));
			assert.ok(!content.includes("Drift") && !content.includes(START));
		}
		await assert.rejects(fs.stat(path.join(home(name), "skills", "example")), { code: "ENOENT" });
		await assert.rejects(fs.stat(path.join(root, ".install-manifests", `${name}.instructions.json`)), { code: "ENOENT" });
	}
});

test("instruction-only installs reconcile to empty and protect unowned Pi files and symlink referents", async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "instructions-owned-"));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const options = { home: path.join(root, "home"), generatedRoot: path.join(root, "generated"), manifestPath: path.join(root, "inventory.json") };
	await generated(options.generatedRoot, { "01.md": "Owned" });
	await put(path.join(options.home, "instructions", "01.md"), "Personal");
	await assert.rejects(applyInstructions(options, "install"), /Unowned instruction/);
	assert.equal(await fs.readFile(path.join(options.home, "instructions", "01.md"), "utf8"), "Personal");
	await fs.rm(path.join(options.home, "instructions", "01.md"));
	await applyInstructions(options, "install");
	await put(path.join(root, "outside.md"), "Outside");
	await fs.rm(path.join(options.home, "instructions", "01.md"));
	await fs.symlink(path.join(root, "outside.md"), path.join(options.home, "instructions", "01.md"));
	await applyInstructions(options, "install");
	assert.equal(await fs.readFile(path.join(root, "outside.md"), "utf8"), "Outside");
	await generated(options.generatedRoot, {});
	await applyInstructions(options, "install");
	await assert.rejects(fs.stat(path.join(options.home, "instructions", "01.md")), { code: "ENOENT" });
	await assert.rejects(applyInstructions({ ...options, home: path.join(root, "different") }, "clear"), /mismatched instruction inventory/);
	await fs.rm(options.generatedRoot, { recursive: true });
	await applyInstructions(options, "clear");
});

test("native blocks replace drift, preserve surrounding content, and reject broken ownership boundaries", () => {
	const current = `Before\n${START}\nDrift\n${END}\nAfter`;
	assert.equal(patchInstructionBlock(current, "New", "install"), `Before\n${START}\nNew\n${END}\nAfter`);
	assert.equal(patchInstructionBlock(current, "", "install"), "Before\n\nAfter");
	assert.equal(patchInstructionBlock(current, "", "clear"), "Before\n\nAfter");
	for (const broken of [START, END, `${END}${START}`, `${START}${START}${END}`, `${START}${END}${END}`]) {
		assert.throws(() => patchInstructionBlock(broken, "New", "install"), /Malformed/);
	}
});

test("Pi loader reads ordered bodies on each run and preserves chained system prompts", async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "instructions-loader-"));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const directory = path.join(root, "instructions");
	assert.equal(await loadInstructions(directory), "");
	assert.deepEqual(await readInstructions(directory), []);
	await put(path.join(directory, "02.md"), " Second \n");
	await put(path.join(directory, "01.md"), "First\n");
	await put(path.join(directory, "03.md"), "\n");
	await put(path.join(directory, "ignore.txt"), "Ignored");
	await put(path.join(directory, "nested", "00.md"), "Ignored nested");
	assert.deepEqual((await readInstructions(directory)).map(({ name }) => name), ["01.md", "02.md", "03.md"]);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = root;
	t.after(() => { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; });
	let handler: (event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>;
	commonInstructions({ on: (name: string, callback: typeof handler) => { assert.equal(name, "before_agent_start"); handler = callback; } } as never);
	assert.deepEqual(await handler!({ systemPrompt: "Base + other extension" }), { systemPrompt: "Base + other extension\n\nFirst\n\nSecond" });
	await fs.rm(path.join(directory, "01.md"));
	assert.deepEqual(await handler!({ systemPrompt: "Base" }), { systemPrompt: "Base\n\nSecond" });
	await fs.rm(directory, { recursive: true });
	assert.equal(await handler!({ systemPrompt: "Base" }), undefined);
});
