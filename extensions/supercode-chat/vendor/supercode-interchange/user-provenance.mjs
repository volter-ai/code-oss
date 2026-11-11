// Generated from sdk/interchange/user-provenance.mjs by scripts/user-provenance-copies.mjs (the pre-commit hook
// runs it): edit that rule, not this file.
// Whose words a user-role record carries: the person's, or the harness's own.
// One rule for every reader (the live projection, replay, history, client
// transcripts, Teams' turn and mail readers, voice, trace). It imports nothing,
// so a host that cannot resolve this package (the VS Code extension, the browser
// observer, the hosted viewer, supercode-ui) carries its exact bytes; the
// pre-commit hook writes those copies (scripts/user-provenance-copies.mjs).
//
// The rule reads, in order:
//   1. a person's marker: the record says a person wrote it. A person who quotes
//      a frame (`<task-notification> showed up in my chat`) or types a reserved
//      notice is still the person.
//   2. a harness marker: the record says the harness wrote it.
//   3. only for a record with no marker either way, its text: a reserved notice
//      or a frame the harness opens its unmarked records with.
// A record with nothing of the three is the person's.
//
// Measured (local Claude Code corpus; Claude Code 2.1.312 stream-json):
//   - person records carry `origin.kind = "human"` or `promptSource` typed /
//     queued / sdk; no task notification carries either. Claude Code's relay of a
//     person's line into a busy fork ("The user sent a new message while you were
//     working: …") carries both `isMeta` and `origin.kind = "human"` (15): the
//     person's words, so the person's marker decides. `isMeta` records otherwise
//     carry `promptSource = "system"` only (35,680);
//   - task notifications: `origin.kind = "task-notification"` and
//     `promptSource = "system"` on every user record opening `<task-notification>`
//     (1,964); `commandMode = "task-notification"` on every such `queued_command`
//     attachment (1,586, against 926 `commandMode = "prompt"`, each a person's);
//   - local-command caveats and image-coordinate notes: `isMeta` in the
//     transcript (397 caveats);
//   - the image-coordinate note on the live stream-json door: `isSynthetic: true`
//     and no `isMeta` (the transcript stores the same uuid with `isMeta: true`).
//     The stream carries no person's marker at all: it does not echo the person's
//     prompt (the host publishes that itself), so its records reach step 2 or 3;
//   - compact summaries: `isCompactSummary` (with `isVisibleInTranscriptOnly`);
//   - subagent traffic: `isSidechain` in the transcript, `parent_tool_use_id` on
//     the stream; tool results: `toolUseResult` / `tool_use_result` or a
//     `tool_result` block.
// Unmarked records, whose text is the only evidence (a 400-transcript sample of
// unmarked main-thread user text: `<command-name>` 18, `<local-command-stdout>`
// 16, `<bash-input>` 13, `<bash-stdout>` 13, the interruption notice 13, plain 2):
//   - the interruption record, whose whole text is one of Claude's reserved
//     notices (832 and 195 corpus occurrences of the two below);
//   - slash-command and shell-mode plumbing (`<command-name>`, `<command-message>`,
//     `<local-command-stdout>`, `<bash-input>`, `<bash-stdout>`, …): a local
//     command the terminal ran and its output, not a message to the agent;
//   - a task notification on a live adapter path, which can arrive without the
//     persisted stamps (not yet measured on the stream-json door);
//   - context other harnesses and hosts open a user turn with (AGENTS.md / CLAUDE.md
//     instructions, `<environment_context>`, `<system-reminder>`, …) and
//     supercode's own frames (`<supercode-notice>`, a cross-session notice, an
//     edited-file attachment flattened to text).
// Frames are openers, never substrings: the tag is the part the harness controls,
// and a person quoting one mid-sentence is still talking.

/** `promptSource` values a person's input carries (Claude Code's, and the hosts'
 * that deliver a person's turn: Teams rooms, terminals, apps). */
export const PERSON_PROMPT_SOURCES = Object.freeze([
	"typed",
	"queued",
	"sdk",
	"user",
	"human",
	"terminal",
	"api",
	"room",
	"app",
]);

/** Metadata a host stamps on a turn it delivered for an authenticated person. */
const PERSON_ATTRIBUTION_KEYS = Object.freeze([
	"source_via",
	"source_principal_id",
	"source_name",
]);

/** Attachment subtypes that are an envelope the runtime built around a file
 * body. `attachmentType` is Claude Code's subtype, kept by the session loader. */
const CONTEXT_ATTACHMENT_TYPES = new Set(["file", "edited_text_file", "nested_memory"]);

/** Claude's reserved interruption notices, persisted as unmarked user records. */
export const CLAUDE_INTERRUPTION_TEXTS = Object.freeze([
	"[Request interrupted by user]",
	"[Request interrupted by user for tool use]",
]);

/** The openers of user-role records the harness or host writes with no marker. */
const HARNESS_FRAMES = Object.freeze([
	/^<(?:command-name|command-message|local-command-[a-z]+|bash-input|bash-stdout|bash-stderr)>/,
	/^<(?:system-reminder|environment_context|user_instructions|user_info|hook_prompt|supercode-notice)\b/,
	/^(?:# )?(?:AGENTS|CLAUDE)\.md instructions for .+\n\n<INSTRUCTIONS>/,
	/^<recommended_plugins>[\s\S]*<\/recommended_plugins>\s*(?:# )?(?:AGENTS|CLAUDE)\.md instructions for .+\n\n<INSTRUCTIONS>/,
	/^\[Cross-session [a-z ]*notice\]/i,
	/^\[edited file:/,
]);
const TASK_NOTIFICATION_OPENER = "<task-notification>";

const TURN_INTERRUPTED_NOTICE = "Turn interrupted.";
const NOTICE_FIELD_CHARACTERS = 200;

// The loader keeps flags as "true"; a host that kept the native boolean is read the same.
const flag = (metadata, key) =>
	metadata?.[key] === "true" || metadata?.[key] === true;
const object = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Whether a host delivered this turn for an authenticated person. */
export function isPersonAttributed(metadata) {
	return PERSON_ATTRIBUTION_KEYS.some((key) => metadata?.[key] != null);
}

/** Whether the record carries a person's marker (rule step 1). */
export function isPersonMarked(metadata) {
	if (!metadata) return false;
	return (
		isPersonAttributed(metadata) ||
		Object.keys(metadata).some((key) => key.startsWith("codex_typed_user")) ||
		PERSON_PROMPT_SOURCES.includes(metadata.promptSource) ||
		metadata.origin === "human" ||
		metadata.commandMode === "prompt"
	);
}

const taskNotificationMarked = (metadata) =>
	metadata?.origin === "task-notification" ||
	metadata?.commandMode === "task-notification";

/** Whether the record carries a harness marker (rule step 2). */
export function isHarnessMarked(metadata) {
	if (!metadata) return false;
	return (
		taskNotificationMarked(metadata) ||
		metadata.promptSource === "system" ||
		flag(metadata, "isMeta") ||
		flag(metadata, "isSynthetic") ||
		flag(metadata, "isCompactSummary") ||
		flag(metadata, "isSidechain") ||
		flag(metadata, "toolResult") ||
		CONTEXT_ATTACHMENT_TYPES.has(metadata.attachmentType)
	);
}

/** Whether `text` is, in full, one of Claude's reserved interruption notices. */
export function isClaudeInterruption(text) {
	return typeof text === "string" && CLAUDE_INTERRUPTION_TEXTS.includes(text.trim());
}

/** Whether `text` opens with a frame the harness or host writes its unmarked
 * user-role records with (rule step 3; a task notification included). */
export function isHarnessFrame(text) {
	if (typeof text !== "string") return false;
	const body = text.trimStart();
	return (
		body.startsWith(TASK_NOTIFICATION_OPENER) ||
		HARNESS_FRAMES.some((frame) => frame.test(body))
	);
}

function taskNotice(text) {
	const tag = (name) => {
		const value =
			new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim() ?? "";
		return [...value].length <= NOTICE_FIELD_CHARACTERS
			? value
			: `${[...value].slice(0, NOTICE_FIELD_CHARACTERS - 1).join("")}…`;
	};
	const summary = tag("summary"),
		status = tag("status");
	return `Background task${status ? ` ${status}` : ""}${summary ? `: ${summary}` : ""}`;
}

/**
 * The provenance of one user-role record: `metadata` is the string map the
 * session loader keeps (or `claudeRecordProvenance` reads from a native record);
 * `text` is the record's text. `source` is `"person"` for the person's own words
 * and `"harness"` for a record the harness wrote; `notice` is the short plain-text
 * line a reader shows in place of a harness record, where one is shown at all
 * (each renderer styles it; none shows the record's own text).
 * @param {Record<string, string> | null | undefined} metadata
 * @param {string} [text]
 * @returns {{ source: "person" | "harness", notice?: string }}
 */
export function userProvenance(metadata, text = "") {
	const body = typeof text === "string" ? text : "";
	if (isPersonMarked(metadata)) return { source: "person" };
	if (taskNotificationMarked(metadata))
		return { source: "harness", notice: taskNotice(body) };
	if (isHarnessMarked(metadata)) return { source: "harness" };
	if (body.trimStart().startsWith(TASK_NOTIFICATION_OPENER))
		return { source: "harness", notice: taskNotice(body) };
	if (isClaudeInterruption(body))
		return { source: "harness", notice: TURN_INTERRUPTED_NOTICE };
	if (isHarnessFrame(body)) return { source: "harness" };
	return { source: "person" };
}

/** Whether a user-role record is the harness's own, not the person's words. */
export function isHarnessAuthoredUser(metadata, text = "") {
	return userProvenance(metadata, text).source === "harness";
}

/**
 * The rule's metadata read from one whole native Claude Code `user` record, as
 * the stream-json door emits it or the transcript stores it. Reads the record,
 * never one content block of it: the stamps sit beside `message`.
 * @param {unknown} record
 * @returns {Record<string, string>}
 */
export function claudeRecordProvenance(record) {
	const metadata = {};
	if (!object(record)) return metadata;
	if (typeof record.promptSource === "string")
		metadata.promptSource = record.promptSource;
	for (const key of ["isMeta", "isSynthetic", "isCompactSummary", "isSidechain"])
		if (record[key] === true) metadata[key] = "true";
	if (typeof record.parent_tool_use_id === "string")
		metadata.isSidechain = "true";
	if (object(record.origin) && typeof record.origin.kind === "string")
		metadata.origin = record.origin.kind;
	const content = object(record.message) ? record.message.content : undefined;
	if (
		Object.hasOwn(record, "toolUseResult") ||
		Object.hasOwn(record, "tool_use_result") ||
		(Array.isArray(content) &&
			content.some((block) => object(block) && block.type === "tool_result"))
	)
		metadata.toolResult = "true";
	return metadata;
}
