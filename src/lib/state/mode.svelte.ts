/**
 * Mode store — the top-level state machine that decides which "surface"
 * of the app is active.
 *
 * Reactivity: `mode`, `activeHandle`, `localAdapter`, `remoteAdapter`,
 * `proxyWarning`, `lastFetchedAt` are Svelte 5 `$state` slots;
 * `recentHandles` is `$state.raw` (the array is replaced wholesale on
 * every refresh — a deep proxy would interfere with the HandleRecord
 * shape). The PAT lives ONLY in the `_patScope` closure variable — it
 * is deliberately **not** a rune, so it is invisible to the reactivity
 * graph (NFR-2 security contract).
 *
 * Three modes:
 *  - `home`   : no folder open. The home screen invites the user to open
 *               a local folder or paste a remote URL.
 *  - `local`  : a local folder handle is active. All stores read/write
 *               through the FSA-backed adapter rooted at the folder.
 *  - `remote` : a remote Git repository has been cloned (read-only).
 *               Stores read through the LightningFS-backed adapter.
 *
 * Security contract (NFR-2):
 *  - A Personal Access Token (PAT) is consumed **only** inside the
 *    `openRemote(creds, pat)` closure, used by `fetchSubtree`, and then
 *    dropped on return. There is no `pat: string` property anywhere on
 *    `ModeStore`. The only public surface for credential state is
 *    `hasRemoteCredentials: boolean`.
 *  - The `proxyWarning` accessor (FR-12) is safe to expose: it contains
 *    only the proxy host, never the PAT or the Authorization header.
 *
 * Persisted folder handles (ERS §5.5) live in IndexedDB. The store
 * reads/writes them via `handleStore` (Step 4) on `bootstrap()` and
 * `openLocalFolder()` / `switchFolder()` / `signOut()`.
 */

import { handleStore } from '../adapters/index.ts';
import { fetchSubtree } from '../adapters/remote-git.ts';
import type { HandleRecord } from '../adapters/handle-store.ts';
import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';
import type { RepoUrl, Branch } from '../adapters/remote-git.ts';
import { isFsaAvailable } from '../adapters/feature-detect.ts';
import { StateError } from './errors.ts';
import type { StateContext } from './_context.ts';

/** Top-level application mode. */
export type Mode = 'home' | 'local' | 'remote';

/**
 * Parameters for opening a remote repository.
 *
 * `pat` is consumed by `openRemote(creds, pat)` and is never stored on the
 * store object.
 */
export interface RemoteCredentials {
	readonly url: RepoUrl;
	readonly branch: Branch;
}

/**
 * The reactive surface of the mode store. The `_internal` field carries the
 * dependencies (e.g. the local-fs adapter factory, the IndexedDB shim) and
 * is injected by tests; production callers omit it.
 */
export interface ModeStore {
	readonly mode: Mode;
	readonly activeHandle: FileSystemDirectoryHandle | null;
	readonly recentHandles: readonly HandleRecord[];
	readonly hasRemoteCredentials: boolean;
	/**
	 * CORS proxy warning text returned by the most recent remote fetch
	 * (either `openRemote` or `refreshRemote`). `null` when no remote
	 * is active, or after `signOut()`.
	 *
	 * Safe to expose on the public surface: it contains only the proxy
	 * host (e.g. `cors.isomorphic-git.org`), never the PAT or the
	 * Authorization header (NFR-2). The UI is expected to surface this
	 * as a non-blocking banner (FR-12).
	 */
	readonly proxyWarning: string | null;
	/**
	 * Wall-clock timestamp (`Date.now()`) of the last successful
	 * `openRemote` / `refreshRemote` call. `null` when no remote is
	 * active, or after `signOut()`. Surfaced by the `RemoteToolbar` as
	 * the "Last fetched" indicator. Updated atomically with
	 * `remoteAdapter` so the toolbar's `formatRelative` read stays
	 * consistent with the adapter it is reading through.
	 */
	readonly lastFetchedAt: number | null;
	/** Writable adapter bound when a local folder handle is active. */
	readonly localAdapter: WritableDirectoryAdapter | null;
	/** Read-only adapter bound when a remote repository is open. */
	readonly remoteAdapter: ReadOnlyDirectoryAdapter | null;

	readonly bootstrap: () => Promise<void>;
	readonly openLocalFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
	readonly switchFolder: () => Promise<FileSystemDirectoryHandle | null>;
	readonly openRemote: (creds: RemoteCredentials, pat: string) => Promise<void>;
	/**
	 * Re-fetch the remote subtree without dropping the cached handle.
	 *
	 * **Contract (sub-phase 6F, the smallest v0 change):**
	 *  - Requires `mode === 'remote'`; otherwise throws
	 *    {@link RemotePatRequired} (the toolbar redirects the user to
	 *    `/` so they can re-open the remote and re-supply a PAT).
	 *  - The PAT is **not** persisted (NFR-2). `refreshRemote(pat)`
	 *    always takes a fresh PAT from the caller — the
	 *    `RemoteToolbar` collects it from a tiny modal that mirrors
	 *    the home page's open-remote form.
	 *  - On success: swaps `remoteAdapter` for the freshly fetched
	 *    subtree, updates `lastFetchedAt = Date.now()`, and reloads
	 *    the issues / config / templates stores through
	 *    {@link onRefreshSuccess} (the layout wires this in 6C).
	 *  - On failure (network, auth, partial clone error): re-throws and
	 *    leaves the existing `remoteAdapter` bound so the user keeps
	 *    their cached subtree (NFR-7: "A failed remote fetch MUST NOT
	 *    corrupt the cached state").
	 */
	readonly refreshRemote: (pat: string) => Promise<void>;
	readonly signOut: () => Promise<void>;
}

/**
 * Injectable adapters — production code uses the real FSA-backed
 * `LocalFsAdapter`; tests pass a `MemoryFsAdapter` so they run in pure Node.
 *
 * Kept minimal: only the surface the mode store actually uses.
 */
export interface ModeStoreDeps {
	/** Factory that turns a directory handle into a {@link WritableDirectoryAdapter}. */
	readonly createLocalAdapter?: (handle: FileSystemDirectoryHandle) => WritableDirectoryAdapter;
	/** IndexedDB-backed handle persistence. Defaults to the singleton from `handle-store.ts`. */
	readonly handles?: typeof handleStore;
	/**
	 * Optional callback invoked after every successful remote fetch
	 * (both `openRemote` and `refreshRemote`). The layout wires this to
	 * a `reload issues / config / templates` orchestration; the mode
	 * store itself stays out of the business of driving other stores.
	 *
	 * Defaults to a no-op so the contract is opt-in and tests can
	 * omit it.
	 */
	readonly onRefreshSuccess?: () => Promise<void>;
}

/**
 * Error thrown when the user tries to refresh the remote subtree
 * without supplying a PAT (or while not in remote mode). The
 * `RemoteToolbar` catches this and shows the re-prompt flow; the
 * page-level catch redirects the user to `/` so they can re-open the
 * remote from the home screen.
 *
 * Distinct from `StateError` because the credential-flow contract is
 * a mode-store concern, not a generic state-layer error.
 */
export class RemotePatRequiredError extends Error {
	readonly name = 'RemotePatRequiredError';
	constructor(message = 'A PAT is required to refresh the remote subtree') {
		super(message);
	}
}

/**
 * Build a {@link ModeStore} rooted at the given {@link StateContext}.
 *
 * @param ctx       the adapter + signal bundle (the local adapter reads from
 *                  `ctx.adapter` once it is bound to a folder).
 * @param deps      optional test seams; production callers omit this.
 */
export function createModeStore(ctx: StateContext, deps: ModeStoreDeps = {}): ModeStore {
	const handles = deps.handles ?? handleStore;
	const createLocal = deps.createLocalAdapter;
	const onRefreshSuccess = deps.onRefreshSuccess ?? (async () => undefined);

	// ─── Reactive state (Svelte 5 runes) ────────────────────────────────
	let mode = $state<Mode>('home');
	let activeHandle = $state<FileSystemDirectoryHandle | null>(null);
	let recentHandles = $state.raw<HandleRecord[]>([]);
	let localAdapter = $state<WritableDirectoryAdapter | null>(null);
	let remoteAdapter = $state<ReadOnlyDirectoryAdapter | null>(null);
	// CORS proxy warning text. Populated by openRemote from
	// fetchSubtree's `proxyWarning` field; cleared on signOut. Safe
	// to expose on the public surface — see the `proxyWarning` getter.
	let proxyWarning = $state<string | null>(null);
	// Timestamp (Date.now()) of the last successful remote fetch. Used by
	// the RemoteToolbar's "Last fetched: N min ago" indicator. Atomically
	// bumped with `remoteAdapter` so the toolbar's `formatRelative` read
	// stays consistent with the adapter it is reading through.
	let lastFetchedAt = $state<number | null>(null);
	// PAT lives ONLY in this closure. Never read after openRemote returns.
	// Deliberately NOT a rune — keeping it out of the reactivity graph is
	// a security boundary (NFR-2): no consumer can subscribe to a PAT slot
	// because there is no PAT slot in the public surface.
	let _patScope: { url: RepoUrl; branch: Branch } | null = null;

	// ─── Internal helpers ──────────────────────────────────────────────

	function hasRemoteCredentials(): boolean {
		return _patScope !== null;
	}

	async function readRecent(): Promise<void> {
		recentHandles = await handles.getRecent();
	}

	async function persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
		await handles.setActive(handle);
		await readRecent();
	}

	async function tryQueryPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
		// `queryPermission` is browser-only. The cast keeps the store testable
		// on Node by routing through a `handle as unknown as ...` boundary.
		const h = handle as unknown as {
			queryPermission?: (opts: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>;
		};
		if (typeof h.queryPermission !== 'function') {
			// Non-FSA handle (e.g. the test stub). Treat as already granted.
			return 'granted';
		}
		return h.queryPermission({ mode: 'readwrite' });
	}

	async function tryRequestPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
		const h = handle as unknown as {
			requestPermission?: (opts: { mode: 'readwrite' | 'read' }) => Promise<PermissionState>;
		};
		if (typeof h.requestPermission !== 'function') return 'granted';
		return h.requestPermission({ mode: 'readwrite' });
	}

	// ─── Public actions ────────────────────────────────────────────────

	async function bootstrap(): Promise<void> {
		const record = await handles.getActive();
		if (!record) {
			mode = 'home';
			await readRecent();
			return;
		}
		const permission = await tryQueryPermission(record.handle);
		if (permission !== 'granted') {
			// Persist as recent but do NOT make it active.
			mode = 'home';
			await readRecent();
			return;
		}
		activeHandle = record.handle;
		if (createLocal) {
			localAdapter = createLocal(record.handle);
		}
		mode = 'local';
		await readRecent();
	}

	async function openLocalFolder(handle: FileSystemDirectoryHandle): Promise<void> {
		const permission = await tryQueryPermission(handle);
		const effective = permission === 'granted' ? 'granted' : await tryRequestPermission(handle);
		if (effective !== 'granted') {
			// User denied; stay on home and surface the recent list.
			mode = 'home';
			await readRecent();
			return;
		}
		activeHandle = handle;
		if (createLocal) localAdapter = createLocal(handle);
		// Drop any remote session — switching folder is a sign-out from remote.
		_patScope = null;
		remoteAdapter = null;
		await persistHandle(handle);
		mode = 'local';
	}

	async function switchFolder(): Promise<FileSystemDirectoryHandle | null> {
		// Open the directory picker via the FSA API and bind the new handle.
		// Step 6 (UC-6) wires this to the toolbar's "Switch folder" button.
		// In environments without FSA (Firefox / Safari) we throw so the UI
		// can fall back to the home screen.
		if (!isFsaAvailable()) {
			throw new Error('Directory picker is unavailable in this environment');
		}
		const handle = await (
			window as unknown as {
				showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
			}
		).showDirectoryPicker();
		await openLocalFolder(handle);
		return handle;
	}

	/**
	 * Consume a raw PAT and return the (non-secret) credentials pair plus
	 * a read-only remote adapter and the proxy-warning text.
	 *
	 * PAT lifetime contract (NFR-2):
	 *  - The `pat` parameter exists ONLY in this function's argument list.
	 *  - It is forwarded to `isomorphic-git` via `fetchSubtree`'s `onAuth`
	 *    callback and then dropped on return.
	 *  - Nothing outside this function ever observes the PAT value. The
	 *    returned `scope` is the non-secret `(url, branch)` pair, which
	 *    the rest of the app uses as the "I have remote credentials"
	 *    signal without ever seeing the secret.
	 *  - The returned `adapter` is a read-only surface; there is no path
	 *    by which a PAT could be carried through it.
	 */
	async function consumePatAndFetch(
		creds: RemoteCredentials,
		pat: string
	): Promise<{
		adapter: ReadOnlyDirectoryAdapter;
		scope: { url: RepoUrl; branch: Branch };
		proxyWarning: string;
	}> {
		const fetchResult = await fetchSubtree({
			url: creds.url,
			branch: creds.branch,
			pat,
			depth: 1
		});
		return {
			adapter: fetchResult.adapter,
			scope: { url: creds.url, branch: creds.branch },
			proxyWarning: fetchResult.proxyWarning
		};
	}

	async function openRemote(creds: RemoteCredentials, pat: string): Promise<void> {
		const { adapter, scope, proxyWarning: warning } = await consumePatAndFetch(creds, pat);
		_patScope = scope;
		remoteAdapter = adapter;
		// Capture the CORS proxy warning text for the UI (FR-12). Safe
		// to expose — see the `proxyWarning` getter docstring.
		proxyWarning = warning;
		// Stamp the fetch timestamp so the toolbar can show "Last fetched".
		lastFetchedAt = Date.now();
		// Remote Mode is read-only; clear any local session markers.
		activeHandle = null;
		localAdapter = null;
		mode = 'remote';
		await onRefreshSuccess();
	}

	async function refreshRemote(pat: string): Promise<void> {
		// The cached scope (url, branch) is the only credential we keep;
		// the PAT must be supplied fresh by the caller (NFR-2).
		if (!_patScope) {
			throw new RemotePatRequiredError(
				'refreshRemote requires an active remote session (mode === "remote")'
			);
		}
		if (mode !== 'remote') {
			throw new RemotePatRequiredError(
				'refreshRemote requires an active remote session (mode === "remote")'
			);
		}
		// Defensive: a malformed PAT argument (empty / whitespace) is the
		// same UX as no session — surface the re-prompt path. The bare
		// openRemote form rejects empty values too; we mirror that here so
		// the toolbar does not need a separate validation step.
		if (typeof pat !== 'string' || pat.trim() === '') {
			throw new RemotePatRequiredError('refreshRemote requires a non-empty PAT');
		}
		const scope = _patScope;
		// Snapshot the existing adapter so we can roll back on failure
		// (NFR-7: "A failed remote fetch MUST NOT corrupt the cached state").
		// We only swap `remoteAdapter` after the new fetch resolves; on
		// rejection the existing adapter remains bound and the user keeps
		// their cached subtree.
		const previousAdapter = remoteAdapter;
		let nextAdapter: ReadOnlyDirectoryAdapter;
		let nextWarning: string;
		try {
			const result = await consumePatAndFetch(scope, pat);
			nextAdapter = result.adapter;
			nextWarning = result.proxyWarning;
		} catch (cause) {
			// Re-throw with the existing adapter left in place. Do NOT
			// clear `lastFetchedAt` — it still describes the cache the
			// user is reading through.
			throw cause instanceof Error ? cause : new StateError('internal', String(cause), { cause });
		}
		// Commit: swap adapter, bump timestamp, refresh proxy warning.
		remoteAdapter = nextAdapter;
		proxyWarning = nextWarning;
		lastFetchedAt = Date.now();
		await onRefreshSuccess();
		// `previousAdapter` is captured to make the rollback contract
		// explicit; it is not used after the swap because the old
		// adapter's LightningFS handle is GC-eligible (no live references).
		void previousAdapter;
	}

	async function signOut(): Promise<void> {
		_patScope = null;
		remoteAdapter = null;
		activeHandle = null;
		localAdapter = null;
		proxyWarning = null;
		lastFetchedAt = null;
		await handles.clearActive();
		await readRecent();
		mode = 'home';
	}

	return {
		get mode() {
			return mode;
		},
		get activeHandle() {
			return activeHandle;
		},
		get recentHandles() {
			return recentHandles;
		},
		get hasRemoteCredentials() {
			return hasRemoteCredentials();
		},
		get proxyWarning() {
			return proxyWarning;
		},
		get lastFetchedAt() {
			return lastFetchedAt;
		},
		get localAdapter() {
			return localAdapter;
		},
		get remoteAdapter() {
			return remoteAdapter;
		},
		bootstrap,
		openLocalFolder,
		switchFolder,
		openRemote,
		refreshRemote,
		signOut
	};
}
