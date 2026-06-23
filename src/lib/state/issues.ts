/**
 * Issues store — wraps `loadIssues` with reactive state and supersede-safe
 * async coordination. This is the heaviest store in the project: every
 * CRUD action on an issue flows through here.
 *
 * Behaviour:
 *  - `load()` reads every `*.md` file under `.nomad.md/issues/` via the
 *    active adapter and replaces `issues` atomically. The loader is
 *    already lenient on per-file failure — malformed files end up in
 *    `issues` with `integrityWarning: true`. The store surfaces them via
 *    the `integrityWarnings` getter.
 *  - `byId` is a `Map<id, LoadedIssue>` rebuilt on every access from
 *    `issues` (small dataset, v0 is fine). Same pattern as `byType` in
 *    templates.ts.
 *  - `byStatus` groups issues by `issue.status` (a `Status.id` from the
 *    config store). Issues with a status that the current config does
 *    not recognise are still included under their own status key — the
 *    validator surfaces the "unknown status" error separately.
 *  - `update(id, patch)` mutates the in-memory issue and marks it dirty.
 *    It does NOT touch disk. The plan calls this "in-memory only".
 *  - `save(id)` validates, serializes, writes, and re-parses to refresh
 *    the cached `LoadedIssue`. Per-id serialisation via `pendingSaves`
 *    joins a second `save(id)` onto the in-flight promise instead of
 *    issuing a parallel write.
 *  - `remove(id)` moves the file to `.nomad.md/.trash/` via the trash
 *    helper. It does not permanently delete the file (FR-4 soft-delete).
 *
 * Dependencies:
 *  - `config` and `templates` stores are read for validation defaults
 *    and the template lookup. The store assumes both have been loaded
 *    before `save()` / `validate()` are called; otherwise validation
 *    errors will surface (validator throws on undefined templates).
 */
import type { Config, Issue, LoadedIssue, Template } from '../types/index.ts';
import {
	buildIssueFilename,
	loadIssues,
	nextIssueId,
	parseIssueFile,
	serializeIssue,
	validateIssue,
	type ValidationContext,
	type ValidationError
} from '../services/index.ts';
import type { DirectoryAdapter } from '../adapters/directory-adapter.ts';
import { moveToTrash } from '../adapters/trash.ts';
import type { ConfigStore } from './config.ts';
import type { StateContext } from './_context.ts';
import type { TemplatesStore } from './templates.ts';

/**
 * Deep-clone an `Issue` for use as a snapshot. Uses the structured-clone
 * algorithm where available, falling back to JSON round-trip for older
 * environments. Only safe for `Issue`'s JSON-compatible shape.
 */
function cloneIssue(issue: Issue): Issue {
	if (typeof structuredClone === 'function') {
		return structuredClone(issue) as Issue;
	}
	return JSON.parse(JSON.stringify(issue)) as Issue;
}

/** Status of the issues store. Mirrors the small state machine used elsewhere. */
export type IssuesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Discriminated id type so callers can't pass an arbitrary number by accident. */
export type IssueId = number;

export interface CreateIssueInput {
	readonly title: string;
	readonly issueType: string;
	readonly author: string;
}

export interface IssuePatch {
	// Partial<Issue> — any subset of the Issue fields. Apply via Object.assign-style merge.
	readonly [key: string]: unknown;
}

export interface IssuesStore {
	readonly issues: readonly LoadedIssue[];
	readonly dirty: ReadonlySet<IssueId>;
	readonly pendingSaves: ReadonlyMap<IssueId, Promise<void>>;
	readonly errors: ReadonlyMap<IssueId, readonly ValidationError[]>;
	/** Map from `Issue.id` → `LoadedIssue`, rebuilt every access from `issues`. */
	readonly byId: ReadonlyMap<IssueId, LoadedIssue>;
	/** Map from `Status.id` → `LoadedIssue[]`. Keys come from `config.statuses`. */
	readonly byStatus: ReadonlyMap<string, readonly LoadedIssue[]>;
	readonly integrityWarnings: readonly LoadedIssue[];
	readonly status: IssuesStatus;
	readonly error: Error | null;

	/** Load (or reload) the issues. Supersedes any in-flight load. */
	readonly load: () => Promise<void>;
	/** Create a new issue. Writes the initial file to disk and returns the new id. */
	readonly create: (input: CreateIssueInput) => Promise<IssueId>;
	/** Patch an issue in memory. Marks it dirty. Does not touch disk. */
	readonly update: (id: IssueId, patch: IssuePatch) => void;
	/** Validate, serialize, and write the issue to disk. Serialised per-id. */
	readonly save: (id: IssueId) => Promise<void>;
	/** Clear the dirty flag for an issue without writing. */
	readonly discard: (id: IssueId) => void;
	/** Soft-delete: move the issue's file to `.nomad.md/.trash/`. */
	readonly remove: (id: IssueId) => Promise<void>;
	/** Validate the issue and return the error list (empty if valid). */
	readonly validate: (id: IssueId) => readonly ValidationError[];
}

export interface IssuesStoreDeps {
	readonly config: ConfigStore;
	readonly templates: TemplatesStore;
}

/**
 * Build an {@link IssuesStore}.
 *
 * @param ctx         The shared state context. `ctx.adapter` is the
 *                    filesystem to read/write through.
 * @param deps        The other stores this one reads from (`config` for
 *                    defaults and `templates` for validation).
 */
export function createIssuesStore(
	adapterProvider: () => DirectoryAdapter | null,
	deps: IssuesStoreDeps,
	ctx?: StateContext
): IssuesStore {
	let issues: LoadedIssue[] = [];
	let status: IssuesStatus = 'idle';
	let error: Error | null = null;
	const dirty: Set<IssueId> = new Set();
	const pendingSaves: Map<IssueId, Promise<void>> = new Map();
	const errors: Map<IssueId, readonly ValidationError[]> = new Map();
	// Per-issue snapshot of the "last saved" state, captured on the first
	// `update()` after a load or successful save. Used by `discard()` to
	// restore the in-memory issue to what is actually on disk. Snapshots are
	// cleared on `save()` (the new on-disk state becomes the snapshot),
	// on `load()` (fresh read from disk), and on `remove()` (gone).
	const snapshots: Map<IssueId, Issue> = new Map();

	// Per-load AbortController — superseded on every new load().
	let loadController: AbortController | null = null;

	function abortInFlightLoad(): void {
		if (loadController) {
			loadController.abort();
			loadController = null;
		}
	}

	async function load(): Promise<void> {
		abortInFlightLoad();
		loadController = new AbortController();
		const sig = loadController.signal;

		status = 'loading';
		error = null;

		const adapter = adapterProvider();
		if (!adapter) {
			// No adapter bound yet (still on 'home', or mode is mid-transition).
			// Stay 'idle' so the UI does not flash an error.
			status = 'idle';
			return;
		}

		const checkAbort = (): void => {
			if (sig.aborted) {
				throw new DOMException('aborted', 'AbortError');
			}
		};

		try {
			checkAbort();
			const loaded = await loadIssues(adapter);
			checkAbort();
			issues = loaded;
			// Clear transient state that no longer makes sense after a fresh
			// load — issues whose ids no longer exist should not show up in
			// dirty/pendingSaves/errors/snapshots.
			for (const id of [...dirty]) if (!findLoaded(id)) dirty.delete(id);
			for (const id of [...pendingSaves.keys()]) if (!findLoaded(id)) pendingSaves.delete(id);
			for (const id of [...errors.keys()]) if (!findLoaded(id)) errors.delete(id);
			for (const id of [...snapshots.keys()]) if (!findLoaded(id)) snapshots.delete(id);
			status = 'ready';
			error = null;
		} catch (cause) {
			// Aborted by a supersede — leave state as-is so the next load wins.
			if (cause instanceof DOMException && cause.name === 'AbortError') {
				return;
			}
			if (cause instanceof Error && cause.name === 'AbortError') {
				return;
			}
			// Non-abort error: surface `status='error'` but KEEP the previous
			// issue set. A transient adapter failure should not wipe the
			// entire list — the UI can show stale data + an error banner.
			// (Matches the `config.ts` precedent for `config`.)
			const err = cause instanceof Error ? cause : new Error(String(cause));
			status = 'error';
			error = err;
		}
	}

	function findLoaded(id: IssueId): LoadedIssue | undefined {
		for (const li of issues) if (li.issue.id === id) return li;
		return undefined;
	}

	function todayIso(): string {
		return new Date().toISOString().slice(0, 10);
	}

	/**
	 * Build the default `Issue` for a newly created record. Pulls defaults
	 * from the config store (default status) and the templates store (status
	 * set). The caller is expected to have loaded both stores already.
	 */
	function buildDefaultIssue(input: CreateIssueInput): Issue {
		const cfg: Config | null = deps.config.config;
		const defaultStatus = cfg?.default_status ?? 'open';
		const today = todayIso();
		return {
			id: nextIssueId(issues.map((li) => li.issue)),
			title: input.title,
			author: input.author,
			creationDate: today,
			updatedDate: today,
			issueType: input.issueType,
			status: defaultStatus,
			assignee: null,
			labels: [],
			relations: [],
			startDate: null,
			endDate: null,
			duration: null,
			integrityHash: null,
			customFields: {},
			sections: [],
			integrityWarning: false
		};
	}

	async function create(input: CreateIssueInput): Promise<IssueId> {
		const adapter = adapterProvider();
		if (!adapter) throw new Error('Cannot create issue: no adapter bound');
		const issue: Issue = buildDefaultIssue(input);
		const filename = buildIssueFilename(issue.id, issue.title);
		const sourcePath = `.nomad.md/issues/${filename}`;
		const text = await serializeIssue(issue);
		await adapter.writeTextFile(sourcePath, text);
		const loaded = await parseIssueFile(text, sourcePath);
		issues.push(loaded);
		return issue.id;
	}

	/**
	 * Apply a patch to the in-memory issue. The patch is shallow-merged via
	 * `Object.assign` for most fields; `customFields` (the only place where
	 * deep-merge actually matters) is deep-merged so callers can do
	 * `update(id, { customFields: { severity: 'high' } })` without losing
	 * other keys.
	 */
	function applyPatch(issue: Issue, patch: IssuePatch): void {
		// Pull customFields out of the top-level merge so we can deep-merge
		// it in place — a wholesale assignment via Object.assign would
		// replace the map reference and break any held reference (the
		// editor draft in Phase 8 holds a pointer to the same object).
		const { customFields: customFieldsPatch, ...rest } = patch;
		Object.assign(issue, rest);
		if (
			customFieldsPatch &&
			typeof customFieldsPatch === 'object' &&
			!Array.isArray(customFieldsPatch)
		) {
			const cfPatch = customFieldsPatch as Record<string, unknown>;
			for (const [k, v] of Object.entries(cfPatch)) {
				issue.customFields[k] = v as never;
			}
		}
	}

	function update(id: IssueId, patch: IssuePatch): void {
		const loaded = findLoaded(id);
		if (!loaded) return;
		// Capture the pre-patch snapshot the first time this id becomes
		// dirty in the current session. Subsequent updates reuse the same
		// snapshot — `discard()` always rolls back to the last saved state,
		// not the previous keystroke.
		if (!snapshots.has(id)) {
			snapshots.set(id, cloneIssue(loaded.issue));
		}
		applyPatch(loaded.issue, patch);
		loaded.issue.updatedDate = todayIso();
		dirty.add(id);
		// The integrity hash will be recomputed by serializeIssue() during
		// save(); we deliberately don't refresh it in memory here because
		// the canonical form is async (SHA-256) and would race with rapid
		// edits. save() is the single source of truth for the on-disk hash.
	}

	function buildValidationContext(): ValidationContext {
		const cfg = deps.config.config;
		if (!cfg) {
			throw new Error('Cannot validate: config store is not loaded');
		}
		const tpls: readonly Template[] = deps.templates.templates;
		const allIssues: readonly Issue[] = issues.map((li) => li.issue);
		return { templates: tpls, config: cfg, allIssues };
	}

	function doSave(id: IssueId): Promise<void> {
		return (async () => {
			const loaded = findLoaded(id);
			if (!loaded) {
				throw new Error(`Cannot save: issue ${id} not found`);
			}
			const validationCtx = buildValidationContext();
			const result = validateIssue(loaded.issue, validationCtx);
			if (!result.ok) {
				errors.set(id, result.errors);
				throw new Error(
					`Validation failed for issue ${id}: ${result.errors.map((e) => e.field).join(', ')}`
				);
			}
			// Clear any stale validation errors from a previous round.
			errors.delete(id);
			const adapter = adapterProvider();
			if (!adapter) throw new Error(`Cannot save: no adapter bound`);
			const text = await serializeIssue(loaded.issue);
			await adapter.writeTextFile(loaded.sourcePath, text);
			const refreshed = await parseIssueFile(text, loaded.sourcePath);
			// Splice the refreshed record into the issues array so the cache
			// reflects what was actually written.
			const idx = issues.findIndex((li) => li.issue.id === id);
			if (idx >= 0) issues[idx] = refreshed;
			dirty.delete(id);
			// The on-disk state is now the snapshot — clear any stale one.
			snapshots.delete(id);
		})();
	}

	function save(id: IssueId): Promise<void> {
		const existing = pendingSaves.get(id);
		if (existing) return existing;
		const p = doSave(id).finally(() => {
			pendingSaves.delete(id);
		});
		pendingSaves.set(id, p);
		return p;
	}

	function discard(id: IssueId): void {
		// Restore the in-memory issue to the last saved state if we have a
		// snapshot; otherwise just clear the dirty flag. Per plan §B.6.3,
		// `discard()` means "revert dirty state to last saved".
		const loaded = findLoaded(id);
		const snap = snapshots.get(id);
		if (loaded && snap) {
			Object.assign(loaded.issue, snap);
			// The cloned snapshot already includes nested arrays/objects, so
			// the top-level Object.assign is enough to fully restore.
		}
		snapshots.delete(id);
		dirty.delete(id);
	}

	async function remove(id: IssueId): Promise<void> {
		const loaded = findLoaded(id);
		if (!loaded) return;
		const adapter = adapterProvider();
		if (!adapter) throw new Error('Cannot remove: no adapter bound');
		await moveToTrash(adapter, loaded.sourcePath);
		issues = issues.filter((li) => li.issue.id !== id);
		dirty.delete(id);
		pendingSaves.delete(id);
		errors.delete(id);
		snapshots.delete(id);
	}

	function validate(id: IssueId): readonly ValidationError[] {
		const loaded = findLoaded(id);
		if (!loaded) return [];
		const cfg = deps.config.config;
		if (!cfg) return [];
		const result = validateIssue(loaded.issue, buildValidationContext());
		return result.errors;
	}

	// Honour an externally-provided signal as well (e.g. test-driven abort).
	const ctxSignal = ctx?.signal;
	if (ctxSignal) {
		ctxSignal.addEventListener('abort', () => abortInFlightLoad(), { once: true });
	}

	return {
		get issues() {
			return issues;
		},
		get dirty() {
			return dirty;
		},
		get pendingSaves() {
			return pendingSaves;
		},
		get errors() {
			return errors;
		},
		get byId() {
			const map = new Map<IssueId, LoadedIssue>();
			for (const li of issues) map.set(li.issue.id, li);
			return map;
		},
		get byStatus() {
			const map = new Map<string, LoadedIssue[]>();
			// Seed keys from the configured status set so the UI can render
			// empty columns without a missing-key check.
			const cfg = deps.config.config;
			if (cfg) {
				for (const s of cfg.statuses) map.set(s.id, []);
			}
			for (const li of issues) {
				const bucket = map.get(li.issue.status);
				if (bucket) bucket.push(li);
				else map.set(li.issue.status, [li]);
			}
			// Freeze each bucket so a consumer that `.push()`s to a returned
			// array does not silently corrupt store state. The cast at the
			// return is a TypeScript-level contract; the freeze is the
			// runtime backstop.
			for (const [key, bucket] of map) {
				Object.freeze(bucket);
				map.set(key, bucket);
			}
			return map as ReadonlyMap<string, readonly LoadedIssue[]>;
		},
		get integrityWarnings() {
			return issues.filter((li) => li.issue.integrityWarning);
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		load,
		create,
		update,
		save,
		discard,
		remove,
		validate
	};
}
