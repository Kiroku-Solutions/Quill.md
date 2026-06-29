/**
 * Mode store — the top-level state machine that decides which "surface"
 * of the app is active.
 *
 * Reactivity: `mode`, `activeHandle`, `localAdapter`, `remoteAdapter`,
 * `proxyWarning` are Svelte 5 `$state` slots; `recentHandles` is
 * `$state.raw` (the array is replaced wholesale on every refresh — a
 * deep proxy would interfere with the HandleRecord shape). The PAT
 * lives ONLY in the `_patScope` closure variable — it is deliberately
 * **not** a rune, so it is invisible to the reactivity graph
 * (NFR-2 security contract).
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
	 * CORS proxy warning text returned by the most recent `openRemote`
	 * call. `null` when no remote is active, or after `signOut()`.
	 *
	 * Safe to expose on the public surface: it contains only the proxy
	 * host (e.g. `cors.isomorphic-git.org`), never the PAT or the
	 * Authorization header (NFR-2). The UI is expected to surface this
	 * as a non-blocking banner (FR-12).
	 */
	readonly proxyWarning: string | null;
	/** Writable adapter bound when a local folder handle is active. */
	readonly localAdapter: WritableDirectoryAdapter | null;
	/** Read-only adapter bound when a remote repository is open. */
	readonly remoteAdapter: ReadOnlyDirectoryAdapter | null;

	readonly bootstrap: () => Promise<void>;
	readonly openLocalFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
	readonly switchFolder: () => Promise<FileSystemDirectoryHandle | null>;
	readonly openRemote: (creds: RemoteCredentials, pat: string) => Promise<void>;
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

	// ─── Reactive state (Svelte 5 runes) ────────────────────────────────
	let mode = $state<Mode>('home');
	let activeHandle = $state<FileSystemDirectoryHandle | null>(null);
	let recentHandles = $state.raw<HandleRecord[]>([]);
	let localAdapter = $state<WritableDirectoryAdapter | null>(null);
	let remoteAdapter = $state<ReadOnlyDirectoryAdapter | null>(null);
	// CORS proxy warning text. Populated by openRemote from
	// fetchSubtree's `proxyWarning` field; cleared on signOut. Safe to
	// expose on the public surface — see the `proxyWarning` getter.
	let proxyWarning = $state<string | null>(null);
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
		// Remote Mode is read-only; clear any local session markers.
		activeHandle = null;
		localAdapter = null;
		mode = 'remote';
	}

	async function signOut(): Promise<void> {
		_patScope = null;
		remoteAdapter = null;
		activeHandle = null;
		localAdapter = null;
		proxyWarning = null;
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
		signOut
	};
}
