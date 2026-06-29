/**
 * Issue persistence — single source of truth for "serialize + write + reparse"
 * across all issue write paths. Lives in the service layer so the state layer
 * never calls `adapter.writeTextFile` directly.
 *
 * Closing the layer leak:
 *  - `state/issues.ts` previously inlined `serializeIssue` + `adapter.writeTextFile`
 *    + `parseIssueFile` in two places (`create()` and `save()`). The plan grep
 *    at `step-5-state-layer-plan.md` §A.3 only matched the bare function names,
 *    not `adapter.writeTextFile`, so the leak slipped through verification.
 *  - `docs/audits/2026-06-23/architecture-audit.md` flagged it as a Tier-S+
 *    overstatement.
 *
 * The contract:
 *  - `saveIssue` is atomic at the adapter level (temp + rename); on failure
 *    the adapter rolls back the temp file (see `local-fs.ts:206-229`).
 *  - The returned `LoadedIssue` is the post-write ground truth (re-parsed
 *    from the exact bytes written to disk). Callers MUST splice it into
 *    their cached array so the in-memory and on-disk views agree.
 *  - The integrity hash is recomputed inside `serializeIssue`; the parsed
 *    result will have `integrityWarning: false` by construction.
 */
import type { WritableDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { Issue, LoadedIssue } from '../types/index.ts';
import { buildIssueFilename, nextIssueId, parseIssueFile, serializeIssue } from './index.ts';

export const ISSUES_DIR = '.nomad.md/issues';

/** Inputs to construct a brand-new issue with sensible defaults. */
export interface CreateIssueInput {
	readonly title: string;
	readonly issueType: string;
	readonly author: string;
	/** ISO date for `creation_date` and `updated_date` (default: today UTC). */
	readonly today?: string;
	/** Status to seed; defaults to `'open'` if the caller doesn't supply one. */
	readonly status?: string;
	/** Optional set of `Issue.customFields` to seed. Keys not in the template are kept verbatim. */
	readonly customFields?: Readonly<Record<string, unknown>>;
}

/**
 * Compose the default issue record from the inputs plus today's date.
 * Pure — no I/O, no date side effects beyond a default.
 */
export function buildDefaultIssue(
	input: CreateIssueInput,
	existing: ReadonlyArray<{ id: number }>
): Issue {
	const today = input.today ?? new Date().toISOString().slice(0, 10);
	return {
		id: nextIssueId(existing),
		title: input.title,
		author: input.author,
		creationDate: today,
		updatedDate: today,
		issueType: input.issueType,
		status: input.status ?? 'open',
		assignee: null,
		labels: [],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		integrityHash: null,
		// `FrontmatterValue` is a recursive union; custom fields from a UI
		// may arrive as `unknown` (the patch path is widened). The
		// serializer narrows each value via `yamlValueFor` at write time,
		// so we accept the wider type here and trust the boundary check.
		customFields: (input.customFields ? { ...input.customFields } : {}) as Issue['customFields'],
		sections: [],
		integrityWarning: false
	};
}

/** Path under which a given issue's markdown file lives. */
export function issuePath(id: number, title: string): string {
	return `${ISSUES_DIR}/${buildIssueFilename(id, title)}`;
}

/**
 * Serialize an issue, write it to disk through the adapter, then reparse the
 * exact bytes written to return the post-write `LoadedIssue`. The caller is
 * responsible for splicing the returned record into its in-memory cache.
 *
 * Throws if the adapter write or reparse fails. On write failure the
 * adapter's atomic-write contract guarantees no partial file is left behind.
 */
export async function saveIssue(
	adapter: WritableDirectoryAdapter,
	issue: Issue,
	sourcePath: string
): Promise<LoadedIssue> {
	const text = await serializeIssue(issue);
	await adapter.writeTextFile(sourcePath, text);
	return parseIssueFile(text, sourcePath);
}

/**
 * Build the default issue for the given input, write it to disk, and return
 * the parsed `LoadedIssue`. Caller is responsible for adding the result to
 * its in-memory issue list.
 *
 * The `existingIssues` argument is the current list of issues; the new id is
 * chosen as `nextIssueId(existingIssues)` so deletion holes are not reused
 * (ERS §6.1.1).
 */
export async function createIssue(
	adapter: WritableDirectoryAdapter,
	input: CreateIssueInput,
	existingIssues: ReadonlyArray<{ id: number }>
): Promise<LoadedIssue> {
	const issue = buildDefaultIssue(input, existingIssues);
	return saveIssue(adapter, issue, issuePath(issue.id, issue.title));
}
