/**
 * Config store — wraps `loadConfig` with reactive state and supersede-safe
 * async coordination.
 *
 * Reactivity: `config`, `status`, `error` are Svelte 5 `$state` slots.
 * Consumers reading `store.config` / `store.status` / `store.error`
 * get fine-grained reactivity. The store factory itself does not
 * contain `$effect` (effects belong in components).
 *
 * Behaviour:
 *  - `load()` reads `.nomad.md/config.json` via the active adapter and
 *    populates `config`. The service throws on missing / malformed files;
 *    we surface the error in `state='error'` and `error`.
 *  - `refresh()` is a re-export of `load()` — kept as a separate verb so
 *    the UI can wire a refresh button without aliasing it to "load".
 *  - A missing config file (the user is opening a fresh repo with no
 *    `.nomad.md/`) results in `config: null` and `state: 'ready'`. The
 *    FR-11 wizard handles the empty-repo case.
 *
 * Dependencies:
 *  - `mode` is read so the store can auto-refetch on mode change. This is
 *    wired by the caller (typically `+layout.svelte`) via a `$effect`
 *    outside the store; the store itself is a pure factory.
 */

import type { Config } from '../types/index.ts';
import { loadConfig } from '../services/index.ts';
import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';
import type { StateContext } from './_context.ts';

/** Status of the config store. Mirrors the small state machine. */
export type ConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ConfigStore {
	readonly config: Config | null;
	readonly status: ConfigStatus;
	readonly error: Error | null;
	/** Load (or reload) the config. Supersedes any in-flight load. */
	readonly load: () => Promise<void>;
	/** Synonym for `load()`. */
	readonly refresh: () => Promise<void>;
}

/**
 * Build a {@link ConfigStore}.
 *
 * @param adapterProvider  returns the adapter to read from. In production this
 *                         resolves to the local or remote adapter from the
 *                         mode store; tests pass a fixed `MemoryFsAdapter`.
 */
export function createConfigStore(
	adapterProvider: () => WritableDirectoryAdapter | ReadOnlyDirectoryAdapter | null,
	ctx?: StateContext
): ConfigStore {
	let config = $state<Config | null>(null);
	let status = $state<ConfigStatus>('idle');
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
			const loaded = await loadConfig(adapter);
			checkAbort();
			config = loaded;
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
			// Missing file: treat as empty repo (FR-11). The loader wraps
			// the original AdapterNotFoundError in a generic Error with a
			// canonical message ("Could not read .nomad.md/config.json"),
			// so we match by message rather than instanceof. The cause
			// chain is preserved for diagnostics.
			const msg = cause instanceof Error ? cause.message : String(cause);
			if (msg.startsWith('Could not read .nomad.md/config.json')) {
				config = null;
				status = 'ready';
				error = null;
				return;
			}
			const err = cause instanceof Error ? cause : new Error(String(cause));
			config = null;
			status = 'error';
			error = err;
		}
	}

	async function refresh(): Promise<void> {
		await load();
	}

	// Honour an externally-provided signal as well (e.g. test-driven abort).
	if (ctx?.signal) {
		ctx.signal.addEventListener('abort', () => abortInFlight(), { once: true });
	}

	return {
		get config() {
			return config;
		},
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		load,
		refresh
	};
}
