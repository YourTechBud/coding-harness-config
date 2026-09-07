export const START = "<!-- coding-harness-config:common-instructions:start -->";
export const END = "<!-- coding-harness-config:common-instructions:end -->";

/** Replace our owned block regardless of content drift, preserving surrounding text. */
export function patchInstructionBlock(current: string, instructions: string, command: "install" | "clear"): string {
	const start = current.indexOf(START);
	const end = current.indexOf(END);
	const block = `${START}\n${instructions.trim()}\n${END}`;
	const remove = command === "clear" || instructions.trim().length === 0;
	if (start === -1 && end === -1) {
		if (remove) return current;
		return `${current}${current.length > 0 ? "\n\n" : ""}${block}\n`;
	}
	if (start === -1 || end < start || current.indexOf(START, start + START.length) !== -1 || current.indexOf(END, end + END.length) !== -1) {
		throw new Error("Malformed or duplicate common-instructions markers; file preserved.");
	}
	return current.slice(0, start) + (remove ? "" : block) + current.slice(end + END.length);
}
