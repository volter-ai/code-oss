// Generated from sdk/interchange/user-provenance.mjs by scripts/user-provenance-copies.mjs (the pre-commit hook
// runs it): edit that rule, not this file.
export type UserSource = "person" | "harness";
export interface UserProvenance {
	source: UserSource;
	/** The short line shown in place of a harness record, where one is shown. */
	notice?: string;
}
export const CLAUDE_INTERRUPTION_TEXTS: readonly string[];
export function isClaudeInterruption(text: unknown): boolean;
export function userProvenance(
	metadata: Readonly<Record<string, string>> | null | undefined,
	text?: string,
): UserProvenance;
export function isHarnessAuthoredUser(
	metadata: Readonly<Record<string, string>> | null | undefined,
	text?: string,
): boolean;
export function claudeRecordProvenance(record: unknown): Record<string, string>;
