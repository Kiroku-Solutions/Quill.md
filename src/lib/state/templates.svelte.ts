/**
 * Templates store — wraps `loadTemplates` with reactive state and
 * supersede-safe async coordination.
 *
 * Reactivity: `templates` is a Svelte 5 `$state.raw` slot (the array
 * is replaced wholesale on every successful `load()` so we never need
 * to deep-proxy the contained `Template` snapshots). `byType` is a
 * `$derived.by` that builds a `Map` from `templates` — non-trivial
 * derivation, the rune memoises the result. `status` / `error` are
 * plain `$state` scalars.
 *
 * Behaviour:
 *  - `load()` reads every `*.json` file under `.nomad.md/templates/` via
 *    the active adapter and replaces `templates` atomically. The list is
 *    already sorted by `t.id` by the service.
 *  - `byType` is a `Map<id, Template>` derived from `templates` so the
 *    editor can do O(1) type lookup without re-walking the list.
 *  - A missing templates directory (fresh repo, FR-11 wizard path) is
 *    treated as `templates: []` and `status: 'ready'`. Other errors
 *    surface in `status: 'error'` and `error`.
 *  - `reload()` is a re-export of `load()` — kept as a separate verb so
 *    the UI can wire a "reload templates" button after the wizard writes
 *    new ones.
 *
 * Dependencies:
 *  - `mode` is read so the store can auto-refetch on mode change. This is
 *    wired by the caller (typically `+layout.svelte`) via a `$effect`
 *    outside the store; the store itself is a pure factory.
 */

import type { Template } from '../types/index.ts';
import { loadTemplates } from '../services/index.ts';
import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';
import type { StateContext } from './_context.ts';

/** Status of the templates store. Mirrors the small state machine. */
export type TemplatesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TemplatesStore {
	readonly templates: readonly Template[];
	/** Map from `Template.id` → `Template`, rebuilt every access from `templates`. */
	readonly byType: ReadonlyMap<string, Template>;
	readonly status: TemplatesStatus;
	readonly error: Error | null;
	/** Load (or reload) the templates. Supersedes any in-flight load. */
	readonly load: () => Promise<void>;
	/** Synonym for `load()`. Wired by the UI's "reload templates" button. */
	readonly reload: () => Promise<void>;
}

/**
 * Build a {@link TemplatesStore}.
 *
 * @param adapterProvider  returns the adapter to read from. In production this
 *                         resolves to the local or remote adapter from the
 *                         mode store; tests pass a fixed `MemoryFsAdapter`.
 */
export function createTemplatesStore(
	adapterProvider: () => WritableDirectoryAdapter | ReadOnlyDirectoryAdapter | null,
	ctx?: StateContext
): TemplatesStore {
	let templates = $state<Template[]>([]);
	let status = $state<TemplatesStatus>('idle');
	let error = $state<Error | null>(null);

	// Per-load AbortController — superseded on every new load().
	let controller: AbortController | null = null;

	function abortInFlight(): void {
		if (controller) {
			controller.abort();
			controller = null;
		}
	}

	async function load(): Promise<void> {
		abortInFlight();
		controller = new AbortController();
		const sig = controller.signal;

		status = 'loading';
		error = null;

		const adapter = adapterProvider();
		if (!adapter) {
			// No adapter bound yet (still on 'home', or mode is mid-transition).
			// Stay 'idle' so the UI does not flash an error.
			status = 'idle';
			return;
		}

		// Honour supersede: if the signal aborts before the read completes,
		// bail without updating state.
		const checkAbort = (): void => {
			if (sig.aborted) {
				throw new DOMException('aborted', 'AbortError');
			}
		};

		try {
			checkAbort();
			const loaded = await loadTemplates(adapter);
			checkAbort();
			templates = loaded;
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
			// Missing templates directory: treat as empty (FR-11 wizard path).
			// `loadTemplates` wraps the underlying `listDirectory` rejection
			// with a canonical "Could not list .nomad.md/templates:" prefix;
			// the FSA-backed LocalFsAdapter throws ENOENT, the remote adapter
			// throws a similar 404. Both end up wrapped in this message. We
			// match by message rather than instanceof so the store does not
			// depend on adapter error types. The original cause is preserved
			// on the Error instance for diagnostics.
			const msg = cause instanceof Error ? cause.message : String(cause);
			if (msg.startsWith('Could not list .nomad.md/templates:')) {
				templates = [];
				status = 'ready';
				error = null;
				return;
			}
			const err = cause instanceof Error ? cause : new Error(String(cause));
			templates = [];
			status = 'error';
			error = err;
		}
	}

	async function reload(): Promise<void> {
		await load();
	}

	// Non-trivial derivation: build the id → Template lookup map.
	// Rebuilt on every access from `templates` (small dataset, v0 is fine).
	// Same pattern as the original implementation: a plain getter that
	// reads `templates` on every access. We deliberately do NOT use
	// `$derived.by` here — the rune memoises between reads, but in the
	// test environment (no Svelte component, no active `$effect`) the
	// re-assignment-to-derived propagation does not fire on a synchronous
	// read. A plain getter is correct for the test contract and gives
	// consumers the same observable value: the current `templates` state.
	// In a Svelte component context the getter still re-runs on every
	// render because the `templates` $state slot is tracked.
	function buildByType(): ReadonlyMap<string, Template> {
		// Local accumulator for a synchronous read; the returned `Map` is
		// the function's output, not stored state, so a plain `Map` is
		// correct (no Svelte reactivity needed — reactivity flows through
		// the `templates` $state slot, not the lookup map).
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, Template>();
		for (const t of templates) {
			map.set(t.id, t);
		}
		return map;
	}

	// Honour an externally-provided signal as well (e.g. test-driven abort).
	if (ctx?.signal) {
		ctx.signal.addEventListener('abort', () => abortInFlight(), { once: true });
	}

	return {
		get templates() {
			return templates;
		},
		get byType() {
			return buildByType();
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		load,
		reload
	};
}
