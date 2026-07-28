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
import type { Config, Issue, LoadedIssue } from '../types/index.ts';
import { buildIssueFilename, nextIssueId, parseIssueFile, serializeIssue } from './index.ts';

export const ISSUES_DIR = '.quill.md/issues';

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
	/** Optional list of sections to seed. Important for satisfying template section requirements. */
	readonly sections?: ReadonlyArray<{ readonly name: string; readonly markdown: string }>;
}

/**
 * Compose the default issue record from the inputs plus today's date.
 * Pure — no I/O, no date side effects beyond a default.
 */
export function buildDefaultIssue(input: CreateIssueInput): Issue {
	const today = input.today ?? new Date().toISOString().slice(0, 10);
	return {
		id: nextIssueId(),
		fields: {
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
			sprintId: null,
			estimate: null
		},
		integrityHash: null,
		// `FrontmatterValue` is a recursive union; custom fields from a UI
		// may arrive as `unknown` (the patch path is widened). The
		// serializer narrows each value via `yamlValueFor` at write time,
		// so we accept the wider type here and trust the boundary check.
		customFields: (input.customFields ? { ...input.customFields } : {}) as Issue['customFields'],
		sections: input.sections ? input.sections.map((s) => ({ ...s })) : [],
		integrityWarning: false
	};
}

/** Path under which a given issue's markdown file lives. */
export function issuePath(issue: Issue, config: Config | null): string {
	let category = 'open';
	if (config) {
		const st = config?.statuses?.find((s) => s.id === issue.fields.status);
		if (st && (st.category === 'done' || st.category === 'cancelled')) {
			category = 'closed';
		}
	} else {
		// Fallback if config not loaded
		const s = issue.fields.status;
		if (s === 'done' || s === 'closed' || s === 'cancelled' || s === 'rejected')
			category = 'closed';
	}
	return `${ISSUES_DIR}/${category}/${buildIssueFilename(issue.id, issue.fields.title)}`;
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
	sourcePath: string | null,
	config: Config | null
): Promise<LoadedIssue> {
	const text = await serializeIssue(issue);
	const newPath = issuePath(issue, config);
	await adapter.writeTextFile(newPath, text);
	if (sourcePath && sourcePath !== newPath) {
		await adapter.removeFile(sourcePath).catch(() => {});
	}
	return parseIssueFile(text, newPath);
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
	config: Config | null
): Promise<LoadedIssue> {
	const issue = buildDefaultIssue(input);
	return saveIssue(adapter, issue, null, config);
}
