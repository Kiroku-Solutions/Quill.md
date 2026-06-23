/**
 * Templates store — wraps `loadTemplates` with reactive state and
 * supersede-safe async coordination.
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
import type { DirectoryAdapter } from '../adapters/directory-adapter.ts';
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
	adapterProvider: () => DirectoryAdapter | null,
	ctx?: StateContext
): TemplatesStore {
	let templates: Template[] = [];
	let status: TemplatesStatus = 'idle';
	let error: Error | null = null;

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

	// Honour an externally-provided signal as well (e.g. test-driven abort).
	if (ctx?.signal) {
		ctx.signal.addEventListener('abort', () => abortInFlight(), { once: true });
	}

	return {
		get templates() {
			return templates;
		},
		get byType() {
			const map = new Map<string, Template>();
			for (const t of templates) {
				map.set(t.id, t);
			}
			return map;
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
