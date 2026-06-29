/**
 * Issues store — wraps `loadIssues` with reactive state and supersede-safe
 * async coordination. This is the heaviest store in the project: every
 * CRUD action on an issue flows through here.
 *
 * Reactivity:
 *  - `issues` is a Svelte 5 `$state.raw` slot (the array is replaced
 *    wholesale on `load()` and `remove()` — the rune avoids
 *    deep-proxying each `LoadedIssue` snapshot, which would break the
 *    snapshot-based discard logic).
 *  - `status` / `error` are plain `$state` scalars.
 *  - `dirty` / `pendingSaves` / `errors` are plain `Set` / `Map`
 *    instances whose *identity* must stay stable across reads (so
 *    consumers can hold a reference and watch it grow). We bump a
 *    private `$state` counter on every mutation; `byId` / `byStatus` /
 *    `integrityWarnings` `$derived.by` bodies read the counter, so
 *    reactivity propagates.
 *  - `byId` / `byStatus` are `$derived.by` — non-trivial multi-statement
 *    derivations that build a fresh `Map` on each run. The rune
 *    memoises between reads.
 *  - `integrityWarnings` is a `$derived` (filter expression is small
 *    but still cheaper to memoise than to walk on every render).
 *  - No `$effect` lives inside the store; effects belong in components.
 *
 * Behaviour:
 *  - `load()` reads every `*.md` file under `.nomad.md/issues/` via the
 *    active adapter and replaces `issues` atomically. The loader is
 *    already lenient on per-file failure — malformed files end up in
 *    `issues` with `integrityWarning: true`. The store surfaces them via
 *    the `integrityWarnings` getter.
 *  - `byId` is a `Map<id, LoadedIssue>` rebuilt on every access from
 *    `issues` (small dataset, v0 is fine). Same pattern as `byType` in
 *    templates.svelte.ts.
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
	createIssue,
	loadIssues,
	moveIssueToTrash,
	saveIssue,
	validateIssue,
	type ValidationContext,
	type ValidationError
} from '../services/index.ts';
import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';
import type { ConfigStore } from './config.svelte.ts';
import type { StateContext } from './_context.ts';
import type { TemplatesStore } from './templates.svelte.ts';

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

// ─── Branded IssueId ───────────────────────────────────────────────────────

declare const ISSUE_ID_BRAND: unique symbol;

/**
 * Discriminated id type. A plain `number` cannot be assigned here without
 * going through {@link brandIssueId}; the runtime registry additionally
 * rejects values that were cast through `unknown` and never branded.
 *
 * Positive integers only. `0` and negative values are rejected at brand
 * time (the validator at `services/validator.ts:135` would reject them
 * anyway, but failing fast at construction is cheaper than failing at
 * the next save).
 */
export type IssueId = number & { readonly [ISSUE_ID_BRAND]: true };

/**
 * Runtime registry of every {@link IssueId} ever produced. Capped with FIFO
 * eviction (insertion order) so a long-lived session cannot grow it without
 * bound — the `architecture-audit.md` finding on `IssueId = number` called
 * this out as the missing brand.
 *
 * Deliberately a plain `Set<number>` rather than a `SvelteSet`: the
 * registry is a brand-validation data structure, not reactive store state.
 * It must not enter the Svelte reactivity graph (consumers must not
 * subscribe to brand membership). The `svelte/prefer-svelte-reactivity`
 * lint rule does not apply here for the same reason.
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const ISSUE_ID_REGISTRY: Set<number> = new Set();

/**
 * Upper bound. A single workspace can hold thousands of issues; 1000
 * covers the high end of a power-user session and keeps the per-session
 * memory cost bounded.
 */
const ISSUE_ID_REGISTRY_LIMIT = 1000;

function registerIssueId(value: number): void {
	if (ISSUE_ID_REGISTRY.has(value)) return;
	if (ISSUE_ID_REGISTRY.size >= ISSUE_ID_REGISTRY_LIMIT) {
		const oldest = ISSUE_ID_REGISTRY.values().next().value;
		if (oldest !== undefined) ISSUE_ID_REGISTRY.delete(oldest);
	}
	ISSUE_ID_REGISTRY.add(value);
}

/**
 * Brand a positive integer as an {@link IssueId}. Throws on a non-positive
 * or non-integer input so a malformed id never reaches the validator.
 */
export function brandIssueId(value: number): IssueId {
	if (!Number.isInteger(value) || value < 1) {
		throw new RangeError(`Invalid IssueId: ${value}`);
	}
	registerIssueId(value);
	return value as IssueId;
}

/** Type guard: returns `true` for values that were registered via {@link brandIssueId}. */
export function isIssueId(value: unknown): value is IssueId {
	return typeof value === 'number' && ISSUE_ID_REGISTRY.has(value);
}

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
	/**
	 * Set of `IssueId` values with in-memory dirty state.
	 *
	 * Keys are plain `number` so call sites can pass a raw id (e.g. a value
	 * read from a row's `data-id` attribute or from a `Map<number, …>`
	 * upstream). The `IssueId` brand is still applied at value construction
	 * time via {@link brandIssueId}; this map only carries the runtime
	 * numbers.
	 */
	readonly dirty: ReadonlySet<number>;
	/** Per-id in-flight save promise. Keys are plain `number` (see {@link dirty}). */
	readonly pendingSaves: ReadonlyMap<number, Promise<void>>;
	/** Per-id last validation error list. Keys are plain `number` (see {@link dirty}). */
	readonly errors: ReadonlyMap<number, readonly ValidationError[]>;
	/**
	 * Map from `Issue.id` → `LoadedIssue`, rebuilt every access from `issues`.
	 * Keys are plain `number` (see {@link dirty} for the rationale).
	 */
	readonly byId: ReadonlyMap<number, LoadedIssue>;
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
	readonly update: (id: number, patch: IssuePatch) => void;
	/** Validate, serialize, and write the issue to disk. Serialised per-id. */
	readonly save: (id: number) => Promise<void>;
	/** Clear the dirty flag for an issue without writing. */
	readonly discard: (id: number) => void;
	/** Soft-delete: move the issue's file to `.nomad.md/.trash/`. */
	readonly remove: (id: number) => Promise<void>;
	/** Validate the issue and return the error list (empty if valid). */
	readonly validate: (id: number) => readonly ValidationError[];
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
	adapterProvider: () => WritableDirectoryAdapter | ReadOnlyDirectoryAdapter | null,
	deps: IssuesStoreDeps,
	ctx?: StateContext
): IssuesStore {
	let issues = $state.raw<LoadedIssue[]>([]);
	let status = $state<IssuesStatus>('idle');
	let error = $state<Error | null>(null);

	// Mutable bookkeeping collections whose identity must stay stable
	// (consumers can hold a reference and watch it grow). Identity is
	// a plain Set/Map; the `*Rev` counters are `$state` slots that
	// `$derived.by` consumers read, so reactivity propagates when we
	// add/remove entries.
	// The `svelte/prefer-svelte-reactivity` rule wants `SvelteSet` /
	// `SvelteMap` here, but converting would fire a separate reactive
	// update on every inner add/delete, defeating the batched
	// `load()` / `remove()` / `update()` path. The counter pattern is
	// the documented reactivity channel.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const dirty: Set<number> = new Set();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingSaves: Map<number, Promise<void>> = new Map();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const errors: Map<number, readonly ValidationError[]> = new Map();
	/**
	 * Narrow the union `WritableDirectoryAdapter | ReadOnlyDirectoryAdapter`
	 * to `WritableDirectoryAdapter` for the write service paths. The state
	 * store's `adapterProvider()` returns the union (Local Mode hands back
	 * a writable adapter, Remote Mode hands back a read-only one); the
	 * `create/save/remove` verbs are only meaningful in Local Mode, so the
	 * type guard fails fast with an actionable error if a write is
	 * attempted in Remote Mode.
	 *
	 * Why a runtime check rather than a TypeScript-level type narrowing:
	 * the `adapterProvider` is a closure (the mode store decides the
	 * concrete type at call time, not at factory time), so the static
	 * type at the call site is always the union.
	 */
	function requireWritable(
		adapter: ReadOnlyDirectoryAdapter | WritableDirectoryAdapter
	): WritableDirectoryAdapter {
		if (typeof (adapter as Partial<WritableDirectoryAdapter>).writeTextFile !== 'function') {
			throw new Error(
				'Cannot mutate: the active adapter is read-only. ' +
					'Open a local folder (Local Edit Mode) to create / save / remove issues.'
			);
		}
		return adapter as WritableDirectoryAdapter;
	}

	let dirtyRev = $state(0);
	let pendingSavesRev = $state(0);
	let errorsRev = $state(0);
	const bumpDirty = (): void => {
		dirtyRev++;
	};
	const bumpPendingSaves = (): void => {
		pendingSavesRev++;
	};
	const bumpErrors = (): void => {
		errorsRev++;
	};

	// Per-issue snapshot of the "last saved" state, captured on the first
	// `update()` after a load or successful save. Used by `discard()` to
	// restore the in-memory issue to what is actually on disk. Snapshots are
	// cleared on `save()` (the new on-disk state becomes the snapshot),
	// on `load()` (fresh read from disk), and on `remove()` (gone).
	// Plain `Map`; never exposed, never reactive. SvelteMap would
	// over-fire on every `set()` and `delete()` (see the rev-counter
	// rationale on `dirty` above).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const snapshots: Map<number, Issue> = new Map();

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
			bumpDirty();
			bumpPendingSaves();
			bumpErrors();
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
			// (Matches the `config.svelte.ts` precedent for `config`.)
			const err = cause instanceof Error ? cause : new Error(String(cause));
			status = 'error';
			error = err;
		}
	}

	function findLoaded(id: number): LoadedIssue | undefined {
		for (const li of issues) if (li.issue.id === id) return li;
		return undefined;
	}

	function todayIso(): string {
		// Local computation — the `Date` instance is never stored, only
		// its ISO string is returned. No reactive channel involved.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		return new Date().toISOString().slice(0, 10);
	}

	/**
	 * Resolve the default status for a newly created issue, preferring the
	 * config store's `default_status` and falling back to `'open'`. Pulled
	 * out so {@link create} doesn't need to know about the config store's
	 * shape directly — the service-layer default-issue builder stays pure.
	 */
	function defaultStatus(): string {
		const cfg: Config | null = deps.config.config;
		return cfg?.default_status ?? 'open';
	}

	async function create(input: CreateIssueInput): Promise<IssueId> {
		const adapter = adapterProvider();
		if (!adapter) throw new Error('Cannot create issue: no adapter bound');
		const loaded = await createIssue(
			requireWritable(adapter),
			{
				title: input.title,
				issueType: input.issueType,
				author: input.author,
				status: defaultStatus()
			},
			issues.map((li) => li.issue)
		);
		issues.push(loaded);
		// Brand on the way out: the service layer's `createIssue` returns a
		// raw `number` from `nextIssueId`. The store is the only place that
		// brands ids, so consumers never see a raw number that bypassed
		// the brand.
		return brandIssueId(loaded.issue.id);
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

	function update(id: number, patch: IssuePatch): void {
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
		bumpDirty();
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

	function doSave(id: number): Promise<void> {
		return (async () => {
			const loaded = findLoaded(id);
			if (!loaded) {
				throw new Error(`Cannot save: issue ${id} not found`);
			}
			const validationCtx = buildValidationContext();
			const result = validateIssue(loaded.issue, validationCtx);
			if (!result.ok) {
				errors.set(id, result.errors);
				bumpErrors();
				throw new Error(
					`Validation failed for issue ${id}: ${result.errors.map((e) => e.field).join(', ')}`
				);
			}
			// Clear any stale validation errors from a previous round.
			if (errors.delete(id)) bumpErrors();
			const adapter = adapterProvider();
			if (!adapter) throw new Error(`Cannot save: no adapter bound`);
			// Delegate serialize + write + reparse to the service layer.
			// This restores the unidirectional state → service → adapter
			// dependency the plan promised (closing the audit-flagged leak).
			const refreshed = await saveIssue(requireWritable(adapter), loaded.issue, loaded.sourcePath);
			// Splice the refreshed record into the issues array so the cache
			// reflects what was actually written.
			const idx = issues.findIndex((li) => li.issue.id === id);
			if (idx >= 0) issues[idx] = refreshed;
			if (dirty.delete(id)) bumpDirty();
			// The on-disk state is now the snapshot — clear any stale one.
			snapshots.delete(id);
		})();
	}

	function save(id: number): Promise<void> {
		const existing = pendingSaves.get(id);
		if (existing) return existing;
		const p = doSave(id).finally(() => {
			pendingSaves.delete(id);
			bumpPendingSaves();
		});
		pendingSaves.set(id, p);
		bumpPendingSaves();
		return p;
	}

	function discard(id: number): void {
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
		if (dirty.delete(id)) bumpDirty();
	}

	async function remove(id: number): Promise<void> {
		const loaded = findLoaded(id);
		if (!loaded) return;
		const adapter = adapterProvider();
		if (!adapter) throw new Error('Cannot remove: no adapter bound');
		// Route through the service layer so the ERS §6.5 trash filename
		// (`<timestamp>-<id>-<slug>.md`) is honoured without the state
		// layer reaching into the adapter helpers directly.
		await moveIssueToTrash(requireWritable(adapter), loaded.issue, loaded.sourcePath);
		issues = issues.filter((li) => li.issue.id !== id);
		if (dirty.delete(id)) bumpDirty();
		if (pendingSaves.delete(id)) bumpPendingSaves();
		if (errors.delete(id)) bumpErrors();
		snapshots.delete(id);
	}

	function validate(id: number): readonly ValidationError[] {
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

	// ── Derived views (non-trivial) ────────────────────────────────────
	// Each `build*` function reads the relevant `*Rev` counter so that
	// in-place mutations of mutable collections (Set/Map members, plus
	// in-place object patches via `update`) propagate to consumers.
	// Exposed as plain getters: re-evaluates on every read, which is the
	// behaviour the test contract depends on (and which `$derived.by`
	// does not provide in a pure-Node test context without a Svelte
	// component to drive the reactive cycle).
	function buildById(): ReadonlyMap<number, LoadedIssue> {
		void dirtyRev;
		// Local accumulator for the id → LoadedIssue rebuild. The map
		// is the function's return value, not stored state. SvelteMap
		// would unnecessarily wrap it in a proxy for a value that is
		// never mutated after construction.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<number, LoadedIssue>();
		// `li.issue.id` is `IssueId` (branded) but its runtime value is a
		// plain number; we use the number directly as the map key so the
		// public `byId` is `ReadonlyMap<number, LoadedIssue>` and call
		// sites can look up by raw id.
		for (const li of issues) map.set(li.issue.id as number, li);
		return map;
	}

	function buildByStatus(): ReadonlyMap<string, readonly LoadedIssue[]> {
		void errorsRev;
		void dirtyRev;
		// Local accumulator for the status → issues[] rebuild. Same
		// rationale as `buildById` above: this is a derived value, not
		// stored state, so a plain `Map` is correct.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
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
	}

	function buildIntegrityWarnings(): readonly LoadedIssue[] {
		void dirtyRev;
		return issues.filter((li) => li.issue.integrityWarning);
	}

	return {
		get issues() {
			return issues;
		},
		get dirty() {
			void dirtyRev;
			return dirty;
		},
		get pendingSaves() {
			void pendingSavesRev;
			return pendingSaves;
		},
		get errors() {
			void errorsRev;
			return errors;
		},
		get byId() {
			return buildById();
		},
		get byStatus() {
			return buildByStatus();
		},
		get integrityWarnings() {
			return buildIntegrityWarnings();
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
