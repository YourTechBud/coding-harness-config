import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import { pathExists } from "./fs.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_ROOT = path.join(REPO_ROOT, ".install-manifests");
const LEGACY_MANIFEST_RELATIVE_PATH = path.join(".managed", "coding-harness-config", "manifest.json");

const HARNESSES = ["codex", "opencode", "pi", "claude", "isagi"] as const;
type HarnessName = (typeof HARNESSES)[number];
type Command = "install" | "clear";
type SettingsMode = "setIfMissing" | "appendIfMissing";

type JsonObject = Record<string, unknown>;

interface InstallMapping {
	sourcePrefix: string;
	destPrefix: string;
}

type UnitType = "file" | "directory";

interface InstallUnit {
	prefix: string;
	path: string;
	type: UnitType;
	source?: string;
}

interface InstallManifest {
	version: 1;
	harness: HarnessName;
	home: string;
	units: InstallUnit[];
}

interface SettingsOperationFile {
	source: string;
}

interface SettingsOperation {
	dest: string;
	path: string[];
	mode: SettingsMode;
	value: unknown;
	match?: {
		key?: string;
	};
}

interface HarnessConfig {
	displayName: string;
	generatedDir: string;
	home(): string;
	mappings: InstallMapping[];
	settings?: SettingsOperationFile[];
}

const HARNESS_CONFIG: Record<HarnessName, HarnessConfig> = {
	codex: {
		displayName: "Codex",
		generatedDir: "codex",
		home: () => path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
	},
	opencode: {
		displayName: "OpenCode",
		generatedDir: "opencode",
		home: () => path.resolve(process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "commands", destPrefix: "commands" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
		settings: [{ source: "settings.operations.json" }],
	},
	pi: {
		displayName: "Pi",
		generatedDir: "pi",
		home: () => path.resolve(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "prompts", destPrefix: "prompts" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
			{ sourcePrefix: "extensions", destPrefix: "extensions" },
		],
		settings: [{ source: "settings.operations.json" }],
	},
	claude: {
		displayName: "Claude Code",
		generatedDir: "claude",
		home: () => path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")),
		mappings: [
			{ sourcePrefix: "skills", destPrefix: "skills" },
			{ sourcePrefix: "agents", destPrefix: "agents" },
		],
	},
	isagi: {
		displayName: "Isagi",
		generatedDir: "isagi",
		home: () => path.join(os.homedir(), ".isagi"),
		mappings: [{ sourcePrefix: "workflows", destPrefix: "workflows" }],
	},
};

function toPortablePath(file: string): string {
	return file.split(path.sep).join("/");
}

function fromPortablePath(file: string): string {
	return file.split("/").join(path.sep);
}

function isPlainObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: JsonObject, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, index) => deepEqual(item, b[index]));
	}
	if (isPlainObject(a) || isPlainObject(b)) {
		if (!isPlainObject(a) || !isPlainObject(b)) return false;
		const aKeys = Object.keys(a).sort();
		const bKeys = Object.keys(b).sort();
		return deepEqual(aKeys, bKeys) && aKeys.every((key) => deepEqual(a[key], b[key]));
	}
	return false;
}

function formatSettingsPath(segments: string[]): string {
	return `/${segments.join("/")}`;
}

function validateSettingsOperation(value: unknown, context: string): SettingsOperation {
	if (!isPlainObject(value)) throw new Error(`${context}: operation must be an object`);
	if (typeof value.dest !== "string" || value.dest.trim().length === 0) throw new Error(`${context}: dest must be a non-empty string`);
	if (!Array.isArray(value.path) || value.path.length === 0 || !value.path.every((segment) => typeof segment === "string" && segment.length > 0)) {
		throw new Error(`${context}: path must be a non-empty string array`);
	}
	if (value.mode !== "setIfMissing" && value.mode !== "appendIfMissing") throw new Error(`${context}: mode must be setIfMissing or appendIfMissing`);
	if (!hasOwn(value, "value")) throw new Error(`${context}: value is required`);
	if (value.match !== undefined) {
		if (!isPlainObject(value.match)) throw new Error(`${context}: match must be an object`);
		if (value.match.key !== undefined && typeof value.match.key !== "string") throw new Error(`${context}: match.key must be a string`);
	}
	const matchKey = isPlainObject(value.match) && typeof value.match.key === "string" ? value.match.key : undefined;
	if (value.mode === "appendIfMissing" && matchKey !== undefined) {
		if (!isPlainObject(value.value) || !hasOwn(value.value, matchKey)) {
			throw new Error(`${context}: appendIfMissing with match.key requires value.${matchKey}`);
		}
	}
	return value as unknown as SettingsOperation;
}

async function readJsoncFile(file: string, context: string): Promise<unknown> {
	const errors: ParseError[] = [];
	const content = await fs.readFile(file, "utf8");
	const parsed = parseJsonc(content, errors, { allowTrailingComma: true, disallowComments: false });
	if (errors.length > 0) {
		const summary = errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ");
		throw new Error(`${context} contains malformed JSON: ${summary}`);
	}
	return parsed;
}

async function readDestinationSettings(file: string, displayName: string): Promise<JsonObject> {
	if (!(await pathExists(file))) return {};
	const parsed = await readJsoncFile(file, `${displayName} settings file ${file}`);
	if (!isPlainObject(parsed)) throw new Error(`${displayName} settings file ${file} must contain a JSON object`);
	return parsed;
}

async function readSettingsOperations(config: HarnessConfig): Promise<SettingsOperation[]> {
	const result: SettingsOperation[] = [];
	if (!config.settings) return result;
	const generatedRoot = path.join(REPO_ROOT, config.generatedDir);

	for (const settingsFile of config.settings) {
		const source = path.join(generatedRoot, settingsFile.source);
		if (!(await pathExists(source))) throw new Error(`Missing ${config.displayName} settings operations file: ${source}`);
		const parsed = await readJsoncFile(source, `${config.displayName} settings operations file ${source}`);
		if (!Array.isArray(parsed)) throw new Error(`${config.displayName} settings operations file ${source} must contain a JSON array`);
		parsed.forEach((operation, index) => result.push(validateSettingsOperation(operation, `${path.relative(REPO_ROOT, source)}[${index}]`)));
	}

	return result;
}

function getParent(root: JsonObject, segments: string[], create: boolean): { parent: JsonObject; key: string } | undefined {
	let current: JsonObject = root;
	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];
		if (!hasOwn(current, segment)) {
			if (!create) return undefined;
			current[segment] = {};
		}
		const next = current[segment];
		if (!isPlainObject(next)) return undefined;
		current = next;
	}
	return { parent: current, key: segments[segments.length - 1] };
}

function getValue(root: JsonObject, segments: string[]): { exists: boolean; value?: unknown } {
	let current: unknown = root;
	for (const segment of segments) {
		if (!isPlainObject(current) || !hasOwn(current, segment)) return { exists: false };
		current = current[segment];
	}
	return { exists: true, value: current };
}

function deletePath(root: JsonObject, segments: string[]): boolean {
	const parent = getParent(root, segments, false);
	if (!parent || !hasOwn(parent.parent, parent.key)) return false;
	delete parent.parent[parent.key];
	pruneEmptyObjectParents(root, segments.slice(0, -1));
	return true;
}

function pruneEmptyObjectParents(root: JsonObject, parentPath: string[]): void {
	for (let length = parentPath.length; length > 0; length -= 1) {
		const currentPath = parentPath.slice(0, length);
		const current = getValue(root, currentPath);
		if (!isPlainObject(current.value) || Object.keys(current.value).length > 0) return;
		const parent = getParent(root, currentPath, false);
		if (!parent) return;
		delete parent.parent[parent.key];
	}
}

function findMatchingArrayItem(array: unknown[], operation: SettingsOperation): number {
	const matchKey = operation.match?.key;
	if (!matchKey) return array.findIndex((item) => deepEqual(item, operation.value));
	if (!isPlainObject(operation.value)) return -1;
	const matchValue = operation.value[matchKey];
	return array.findIndex((item) => isPlainObject(item) && deepEqual(item[matchKey], matchValue));
}

function applySetIfMissing(root: JsonObject, operation: SettingsOperation, displayName: string): boolean {
	const parent = getParent(root, operation.path, true);
	const formattedPath = formatSettingsPath(operation.path);
	if (!parent) {
		console.warn(`Skipped ${displayName} setting ${formattedPath}; parent path is not an object.`);
		return false;
	}
	if (!hasOwn(parent.parent, parent.key)) {
		parent.parent[parent.key] = operation.value;
		return true;
	}
	if (deepEqual(parent.parent[parent.key], operation.value)) return false;
	console.warn(`Skipped ${displayName} setting conflict at ${formattedPath}; existing value preserved.`);
	return false;
}

function applyAppendIfMissing(root: JsonObject, operation: SettingsOperation, displayName: string): boolean {
	const formattedPath = formatSettingsPath(operation.path);
	const current = getValue(root, operation.path);
	if (!current.exists) {
		const parent = getParent(root, operation.path, true);
		if (!parent) {
			console.warn(`Skipped ${displayName} setting ${formattedPath}; parent path is not an object.`);
			return false;
		}
		parent.parent[parent.key] = [operation.value];
		return true;
	}
	if (!Array.isArray(current.value)) {
		console.warn(`Skipped ${displayName} setting ${formattedPath}; existing value is not an array.`);
		return false;
	}
	const index = findMatchingArrayItem(current.value, operation);
	if (index === -1) {
		current.value.push(operation.value);
		return true;
	}
	if (deepEqual(current.value[index], operation.value)) return false;
	console.warn(`Skipped ${displayName} setting conflict at ${formattedPath}; existing array item preserved.`);
	return false;
}

function clearSetIfSame(root: JsonObject, operation: SettingsOperation): boolean {
	const current = getValue(root, operation.path);
	if (!current.exists || !deepEqual(current.value, operation.value)) return false;
	return deletePath(root, operation.path);
}

function clearArrayItemIfSame(root: JsonObject, operation: SettingsOperation): boolean {
	const current = getValue(root, operation.path);
	if (!Array.isArray(current.value)) return false;
	const index = findMatchingArrayItem(current.value, operation);
	if (index === -1 || !deepEqual(current.value[index], operation.value)) return false;
	current.value.splice(index, 1);
	return true;
}

function applySettingsOperation(root: JsonObject, operation: SettingsOperation, command: Command, displayName: string): boolean {
	if (command === "install") {
		if (operation.mode === "setIfMissing") return applySetIfMissing(root, operation, displayName);
		return applyAppendIfMissing(root, operation, displayName);
	}
	if (operation.mode === "setIfMissing") return clearSetIfSame(root, operation);
	return clearArrayItemIfSame(root, operation);
}

async function applySettingsOperations(config: HarnessConfig, command: Command): Promise<number> {
	const operations = await readSettingsOperations(config);
	if (operations.length === 0) return 0;

	let changed = 0;
	const operationsByDest = new Map<string, SettingsOperation[]>();
	for (const operation of operations) {
		const relativeDest = toPortablePath(operation.dest);
		operationsByDest.set(relativeDest, [...(operationsByDest.get(relativeDest) ?? []), operation]);
	}

	const home = config.home();
	for (const [relativeDest, destOperations] of operationsByDest) {
		const target = path.join(home, fromPortablePath(relativeDest));
		const settings = await readDestinationSettings(target, config.displayName);
		let fileChanged = false;
		for (const operation of destOperations) {
			if (applySettingsOperation(settings, operation, command, config.displayName)) {
				changed += 1;
				fileChanged = true;
			}
		}
		if (fileChanged) {
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, `${JSON.stringify(settings, null, 2)}\n`);
		}
	}

	return changed;
}

function shouldSkipInstallEntry(name: string): boolean {
	return name === ".DS_Store" || path.extname(name) === ".log";
}

function unitKey(unit: Pick<InstallUnit, "path">): string {
	return unit.path;
}

function sortUnits(units: InstallUnit[]): InstallUnit[] {
	return [...units].sort((a, b) => a.path.localeCompare(b.path));
}

function dedupeUnits(units: InstallUnit[]): InstallUnit[] {
	const byPath = new Map<string, InstallUnit>();
	for (const unit of units) byPath.set(unitKey(unit), unit);
	return sortUnits([...byPath.values()]);
}

async function detectUnitType(target: string): Promise<UnitType> {
	const stat = await fs.lstat(target);
	return stat.isDirectory() ? "directory" : "file";
}

async function desiredUnits(config: HarnessConfig): Promise<InstallUnit[]> {
	const result: InstallUnit[] = [];
	const generatedRoot = path.join(REPO_ROOT, config.generatedDir);

	for (const mapping of config.mappings) {
		const sourceRoot = path.join(generatedRoot, mapping.sourcePrefix);
		if (!(await pathExists(sourceRoot))) continue;
		const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (shouldSkipInstallEntry(entry.name)) continue;
			if (!entry.isDirectory() && !entry.isFile() && !entry.isSymbolicLink()) continue;
			const source = path.join(sourceRoot, entry.name);
			const type = entry.isDirectory() ? "directory" : "file";
			result.push({
				prefix: toPortablePath(mapping.destPrefix),
				path: toPortablePath(path.join(mapping.destPrefix, entry.name)),
				type,
				source,
			});
		}
	}

	return dedupeUnits(result);
}

function stopDirsFor(home: string, config: HarnessConfig): Set<string> {
	return new Set([home, ...config.mappings.map((mapping) => path.join(home, fromPortablePath(mapping.destPrefix)))]);
}

async function pruneEmptyParents(home: string, config: HarnessConfig, relativeFile: string): Promise<void> {
	const stopDirs = stopDirsFor(home, config);
	let current = path.dirname(path.join(home, fromPortablePath(relativeFile)));
	while (!stopDirs.has(current) && current.startsWith(home)) {
		try {
			await fs.rmdir(current);
		} catch {
			return;
		}
		current = path.dirname(current);
	}
}

async function removeRelativePath(home: string, config: HarnessConfig, relativePath: string): Promise<boolean> {
	const target = path.join(home, fromPortablePath(relativePath));
	if (!(await pathExists(target))) return false;
	await fs.rm(target, { recursive: true, force: true });
	await pruneEmptyParents(home, config, relativePath);
	return true;
}

async function readLegacyManifestPaths(home: string): Promise<string[]> {
	const manifestPath = path.join(home, LEGACY_MANIFEST_RELATIVE_PATH);
	if (!(await pathExists(manifestPath))) return [];
	try {
		const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files?: Array<{ path?: unknown }> };
		return Array.isArray(parsed.files)
			? parsed.files.map((entry) => entry.path).filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

async function removeLegacyManifestDir(home: string): Promise<void> {
	const legacyDir = path.join(home, ".managed", "coding-harness-config");
	await fs.rm(legacyDir, { recursive: true, force: true });
	try {
		await fs.rmdir(path.join(home, ".managed"));
	} catch {
		// Keep .managed if something else still uses it.
	}
}

function manifestPathFor(name: HarnessName): string {
	return path.join(MANIFEST_ROOT, `${name}.json`);
}

function relativeToRepo(file: string): string {
	return toPortablePath(path.relative(REPO_ROOT, file));
}

function allowedPrefixes(config: HarnessConfig): Set<string> {
	return new Set(config.mappings.map((mapping) => toPortablePath(mapping.destPrefix)));
}

function isSafePortableRelativePath(value: string): boolean {
	if (value.length === 0 || value.includes("\\") || path.posix.isAbsolute(value)) return false;
	const normalized = path.posix.normalize(value);
	return normalized === value && value !== ".." && !value.startsWith("../") && !value.includes("/../");
}

function isAllowedUnit(unit: InstallUnit, config: HarnessConfig): boolean {
	const prefixes = allowedPrefixes(config);
	if (!prefixes.has(unit.prefix)) return false;
	if (!isSafePortableRelativePath(unit.path)) return false;
	if (!unit.path.startsWith(`${unit.prefix}/`)) return false;
	const relativeToPrefix = unit.path.slice(unit.prefix.length + 1);
	return relativeToPrefix.length > 0 && !relativeToPrefix.includes("/");
}

function manifestUnitFromValue(value: unknown, config: HarnessConfig): InstallUnit | undefined {
	if (!isPlainObject(value)) return undefined;
	if (typeof value.prefix !== "string" || typeof value.path !== "string") return undefined;
	if (value.type !== "file" && value.type !== "directory") return undefined;
	const unit: InstallUnit = { prefix: value.prefix, path: value.path, type: value.type };
	return isAllowedUnit(unit, config) ? unit : undefined;
}

async function readInstallManifest(
	name: HarnessName,
	config: HarnessConfig,
	home: string,
): Promise<{ manifest?: InstallManifest; warnings: string[]; homeMismatch?: string }> {
	const file = manifestPathFor(name);
	if (!(await pathExists(file))) return { warnings: [] };
	try {
		const parsed = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
		if (!isPlainObject(parsed)) return { warnings: [`Ignored ${relativeToRepo(file)} because it is not a JSON object.`] };
		if (parsed.version !== 1 || parsed.harness !== name || typeof parsed.home !== "string" || !Array.isArray(parsed.units)) {
			return { warnings: [`Ignored ${relativeToRepo(file)} because it has an unsupported manifest shape.`] };
		}
		const units = parsed.units.map((unit) => manifestUnitFromValue(unit, config)).filter((unit): unit is InstallUnit => unit !== undefined);
		const manifest: InstallManifest = { version: 1, harness: name, home: parsed.home, units: dedupeUnits(units) };
		if (manifest.home !== home) return { manifest, warnings: [], homeMismatch: manifest.home };
		return { manifest, warnings: [] };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { warnings: [`Ignored ${relativeToRepo(file)} because it could not be read: ${message}`] };
	}
}

async function writeInstallManifest(name: HarnessName, home: string, units: InstallUnit[]): Promise<void> {
	const manifest: InstallManifest = {
		version: 1,
		harness: name,
		home,
		units: sortUnits(units).map((unit) => ({ prefix: unit.prefix, path: unit.path, type: unit.type })),
	};
	const file = manifestPathFor(name);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function deleteInstallManifest(name: HarnessName): Promise<boolean> {
	const file = manifestPathFor(name);
	if (!(await pathExists(file))) return false;
	await fs.rm(file, { force: true });
	try {
		await fs.rmdir(MANIFEST_ROOT);
	} catch {
		// Keep the manifest root if other harness manifests still exist.
	}
	return true;
}

async function unitsFromLegacyPaths(home: string, config: HarnessConfig, legacyPaths: string[]): Promise<InstallUnit[]> {
	const units: InstallUnit[] = [];
	for (const legacyPath of legacyPaths) {
		const portablePath = toPortablePath(legacyPath);
		if (!isSafePortableRelativePath(portablePath)) continue;
		for (const mapping of config.mappings) {
			const prefix = toPortablePath(mapping.destPrefix);
			if (portablePath !== prefix && !portablePath.startsWith(`${prefix}/`)) continue;
			const relativeToPrefix = portablePath === prefix ? "" : portablePath.slice(prefix.length + 1);
			const firstSegment = relativeToPrefix.split("/").filter(Boolean)[0];
			if (!firstSegment) continue;
			const unitPath = `${prefix}/${firstSegment}`;
			const target = path.join(home, fromPortablePath(unitPath));
			const type = (await pathExists(target)) ? await detectUnitType(target) : relativeToPrefix.includes("/") ? "directory" : "file";
			units.push({ prefix, path: unitPath, type });
			break;
		}
	}
	return dedupeUnits(units);
}

async function copyInstallUnit(unit: InstallUnit, home: string): Promise<void> {
	if (!unit.source) throw new Error(`Missing source for install unit: ${unit.path}`);
	const target = path.join(home, fromPortablePath(unit.path));
	await fs.mkdir(path.dirname(target), { recursive: true });
	if (unit.type === "directory") {
		await fs.cp(unit.source, target, {
			recursive: true,
			filter: (source) => !shouldSkipInstallEntry(path.basename(source)),
		});
		return;
	}
	await fs.copyFile(unit.source, target);
}

async function readComparableDirEntries(root: string): Promise<Array<{ path: string; type: UnitType }>> {
	const entries: Array<{ path: string; type: UnitType }> = [];

	async function walk(current: string): Promise<void> {
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			if (shouldSkipInstallEntry(entry.name)) continue;
			const full = path.join(current, entry.name);
			const relative = toPortablePath(path.relative(root, full));
			if (entry.isDirectory()) {
				entries.push({ path: relative, type: "directory" });
				await walk(full);
			} else if (entry.isFile() || entry.isSymbolicLink()) {
				entries.push({ path: relative, type: "file" });
			}
		}
	}

	await walk(root);
	return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function filesEqual(source: string, target: string): Promise<boolean> {
	try {
		const [sourceContent, targetContent] = await Promise.all([fs.readFile(source), fs.readFile(target)]);
		return sourceContent.equals(targetContent);
	} catch {
		return false;
	}
}

function entryListsEqual(a: Array<{ path: string; type: UnitType }>, b: Array<{ path: string; type: UnitType }>): boolean {
	if (a.length !== b.length) return false;
	return a.every((entry, index) => entry.path === b[index].path && entry.type === b[index].type);
}

async function directoriesEqual(source: string, target: string): Promise<boolean> {
	try {
		const [sourceEntries, targetEntries] = await Promise.all([readComparableDirEntries(source), readComparableDirEntries(target)]);
		if (!entryListsEqual(sourceEntries, targetEntries)) return false;
		for (const entry of sourceEntries) {
			if (entry.type === "file" && !(await filesEqual(path.join(source, fromPortablePath(entry.path)), path.join(target, fromPortablePath(entry.path))))) {
				return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

async function installUnitMatchesTarget(unit: InstallUnit, home: string): Promise<boolean> {
	if (!unit.source) throw new Error(`Missing source for install unit: ${unit.path}`);
	const target = path.join(home, fromPortablePath(unit.path));
	if (!(await pathExists(target))) return false;
	const targetType = await detectUnitType(target);
	if (targetType !== unit.type) return false;
	if (unit.type === "directory") return directoriesEqual(unit.source, target);
	return filesEqual(unit.source, target);
}

function formatReportList(items: string[]): string {
	return items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
}

function printInstallReport(report: {
	displayName: string;
	home: string;
	manifestPath: string;
	warnings: string[];
	removedStale: string[];
	replaced: string[];
	installed: string[];
	adopted: string[];
	skipped: string[];
	settingsChanged: number;
	legacyUnits: string[];
	manifestWritten: boolean;
}): void {
	console.log(`${report.displayName} install report`);
	console.log(`Home: ${report.home}`);
	console.log(`Manifest: ${report.manifestPath}`);
	console.log("");
	console.log("Warnings:");
	console.log(formatReportList(report.warnings));
	console.log("");
	console.log("Removed stale units:");
	console.log(formatReportList(report.removedStale));
	console.log("");
	console.log("Replaced managed units:");
	console.log(formatReportList(report.replaced));
	console.log("");
	console.log("Installed new units:");
	console.log(formatReportList(report.installed));
	console.log("");
	console.log("Adopted exact existing units:");
	console.log(formatReportList(report.adopted));
	console.log("");
	console.log("Migrated legacy units:");
	console.log(formatReportList(report.legacyUnits));
	console.log("");
	console.log("Skipped:");
	console.log(formatReportList(report.skipped));
	console.log("");
	console.log("Summary:");
	console.log(`- removed stale: ${report.removedStale.length}`);
	console.log(`- replaced: ${report.replaced.length}`);
	console.log(`- installed new: ${report.installed.length}`);
	console.log(`- adopted exact existing: ${report.adopted.length}`);
	console.log(`- migrated legacy units: ${report.legacyUnits.length}`);
	console.log(`- settings operations applied: ${report.settingsChanged}`);
	console.log(`- manifest written: ${report.manifestWritten ? report.manifestPath : "no"}`);
	console.log("");
}

function printClearReport(report: {
	displayName: string;
	home: string;
	manifestPath: string;
	warnings: string[];
	removed: string[];
	missing: string[];
	skipped: string[];
	settingsChanged: number;
	legacyUnits: string[];
	manifestDeleted: boolean;
}): void {
	console.log(`${report.displayName} clear report`);
	console.log(`Home: ${report.home}`);
	console.log(`Manifest: ${report.manifestPath}`);
	console.log("");
	console.log("Warnings:");
	console.log(formatReportList(report.warnings));
	console.log("");
	console.log("Removed managed units:");
	console.log(formatReportList(report.removed));
	console.log("");
	console.log("Missing managed units:");
	console.log(formatReportList(report.missing));
	console.log("");
	console.log("Migrated legacy units:");
	console.log(formatReportList(report.legacyUnits));
	console.log("");
	console.log("Skipped:");
	console.log(formatReportList(report.skipped));
	console.log("");
	console.log("Summary:");
	console.log(`- removed: ${report.removed.length}`);
	console.log(`- missing: ${report.missing.length}`);
	console.log(`- migrated legacy units: ${report.legacyUnits.length}`);
	console.log(`- settings operations reverted: ${report.settingsChanged}`);
	console.log(`- manifest deleted: ${report.manifestDeleted ? report.manifestPath : "no"}`);
	console.log("");
}

async function installHarness(name: HarnessName): Promise<void> {
	const config = HARNESS_CONFIG[name];
	const home = config.home();
	const manifestPath = relativeToRepo(manifestPathFor(name));
	const generatedDir = path.join(REPO_ROOT, config.generatedDir);
	if (!(await pathExists(generatedDir))) {
		throw new Error(`Missing generated ${config.displayName} directory: ${generatedDir}. Run pnpm run generate first.`);
	}

	const desired = await desiredUnits(config);
	const desiredKeys = new Set(desired.map((unit) => unitKey(unit)));
	const manifestRead = await readInstallManifest(name, config, home);
	const legacyPaths = await readLegacyManifestPaths(home);
	const legacyUnits = await unitsFromLegacyPaths(home, config, legacyPaths);
	const warnings = [...manifestRead.warnings];
	if (manifestRead.homeMismatch) {
		warnings.push(`Ignored ${manifestPath} because it was written for ${manifestRead.homeMismatch}. Current home is ${home}.`);
	}

	const previousUnits = dedupeUnits([...(manifestRead.homeMismatch ? [] : (manifestRead.manifest?.units ?? [])), ...legacyUnits]);
	const previousKeys = new Set(previousUnits.map((unit) => unitKey(unit)));
	const removedStale: string[] = [];
	const replaced: string[] = [];
	const installed: string[] = [];
	const adopted: string[] = [];
	const skipped: string[] = [];
	const copiedUnits: InstallUnit[] = [];

	for (const unit of previousUnits.filter((unit) => !desiredKeys.has(unitKey(unit)))) {
		if (await removeRelativePath(home, config, unit.path)) removedStale.push(unit.path);
		else skipped.push(`${unit.path} (stale unit was already missing)`);
	}

	for (const unit of desired) {
		const target = path.join(home, fromPortablePath(unit.path));
		const exists = await pathExists(target);
		if (previousKeys.has(unitKey(unit))) {
			await removeRelativePath(home, config, unit.path);
			await copyInstallUnit(unit, home);
			replaced.push(unit.path);
			copiedUnits.push(unit);
			continue;
		}
		if (exists) {
			if (await installUnitMatchesTarget(unit, home)) {
				adopted.push(unit.path);
				copiedUnits.push(unit);
				continue;
			}
			skipped.push(`${unit.path} (destination exists but is not manifest-owned and does not exactly match generated output)`);
			continue;
		}
		await copyInstallUnit(unit, home);
		installed.push(unit.path);
		copiedUnits.push(unit);
	}

	const changedSettings = await applySettingsOperations(config, "install");
	await writeInstallManifest(name, home, copiedUnits);
	await removeLegacyManifestDir(home);

	printInstallReport({
		displayName: config.displayName,
		home,
		manifestPath,
		warnings,
		removedStale,
		replaced,
		installed,
		adopted,
		skipped,
		settingsChanged: changedSettings,
		legacyUnits: legacyUnits.map((unit) => unit.path),
		manifestWritten: true,
	});
}

async function clearHarness(name: HarnessName): Promise<void> {
	const config = HARNESS_CONFIG[name];
	const home = config.home();
	const manifestPath = relativeToRepo(manifestPathFor(name));
	const manifestRead = await readInstallManifest(name, config, home);
	const legacyPaths = await readLegacyManifestPaths(home);
	const legacyUnits = await unitsFromLegacyPaths(home, config, legacyPaths);
	const warnings = [...manifestRead.warnings];
	const skipped: string[] = [];

	if (manifestRead.homeMismatch) {
		warnings.push(`Skipped clear because ${manifestPath} was written for ${manifestRead.homeMismatch}. Current home is ${home}.`);
		printClearReport({
			displayName: config.displayName,
			home,
			manifestPath,
			warnings,
			removed: [],
			missing: [],
			skipped,
			settingsChanged: 0,
			legacyUnits: legacyUnits.map((unit) => unit.path),
			manifestDeleted: false,
		});
		return;
	}

	const units = dedupeUnits([...(manifestRead.manifest?.units ?? []), ...legacyUnits]);
	if (units.length === 0) skipped.push("No manifest-owned or legacy-owned units found.");

	const removed: string[] = [];
	const missing: string[] = [];
	for (const unit of units) {
		if (await removeRelativePath(home, config, unit.path)) removed.push(unit.path);
		else missing.push(unit.path);
	}

	const generatedDir = path.join(REPO_ROOT, config.generatedDir);
	const changedSettings = units.length > 0 && (await pathExists(generatedDir)) ? await applySettingsOperations(config, "clear") : 0;
	const manifestDeleted = manifestRead.manifest ? await deleteInstallManifest(name) : false;
	await removeLegacyManifestDir(home);

	printClearReport({
		displayName: config.displayName,
		home,
		manifestPath,
		warnings,
		removed,
		missing,
		skipped,
		settingsChanged: changedSettings,
		legacyUnits: legacyUnits.map((unit) => unit.path),
		manifestDeleted,
	});
}

function parseHarnesses(value: string | undefined): HarnessName[] {
	if (!value || value === "all") return [...HARNESSES];
	if (!HARNESSES.includes(value as HarnessName)) {
		throw new Error(`Unknown harness: ${value}. Expected one of: all, ${HARNESSES.join(", ")}`);
	}
	return [value as HarnessName];
}

async function main(): Promise<void> {
	const command = process.argv[2] as Command | undefined;
	const harnesses = parseHarnesses(process.argv[3]);
	if (command !== "install" && command !== "clear") {
		throw new Error(`Usage: tsx generator/harness-install.ts install|clear [all|${HARNESSES.join("|")}]`);
	}

	for (const harness of harnesses) {
		if (command === "install") await installHarness(harness);
		else await clearHarness(harness);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
