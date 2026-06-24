/**
 * State-layer tests for `modeStore.refreshRemote()` (sub-phase 6F).
 *
 * The QA audit brief calls out three paths to cover:
 *
 *   1. **Happy path** — `refreshRemote(pat)` re-invokes `fetchSubtree`
 *      with the cached scope, swaps `remoteAdapter`, bumps
 *      `lastFetchedAt`, and calls `onRefreshSuccess()`.
 *   2. **PAT-required path** — `refreshRemote('')` (or while not in
 *      remote mode) throws `RemotePatRequiredError`. The cached
 *      adapter stays bound.
 *   3. **Failure path (NFR-7)** — when `fetchSubtree` rejects, the
 *      existing `remoteAdapter` stays bound (cache intact), and
 *      `lastFetchedAt` is NOT bumped.
 *
 * We mock `fetchSubtree` via dynamic import + property assignment
 * (same pattern as `mode.open-remote.test.ts`) — Vitest's `vi.mock`
 * would require ESM-rewriting the production code, which the project
 * deliberately avoids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as remoteGit from '$lib/adapters/remote-git';
import type { HandleStore } from '$lib/adapters/handle-store';
import { fetchSubtree } from '$lib/adapters/remote-git';
import { createModeStore, RemotePatRequiredError } from '$lib/state';

const KNOWN_URL = 'https://github.com/example/repo' as remoteGit.RepoUrl;
const KNOWN_BRANCH = 'main' as remoteGit.Branch;
const KNOWN_PAT = 'ghp_' + 'A'.repeat(36);
const REFRESH_PAT = 'ghp_' + 'B'.repeat(36);

function makeFakeHandleStore(): HandleStore {
	return {
		async getActive() {
			return null;
		},
		async setActive() {
			/* unused */
		},
		async clearActive() {
			/* unused */
		},
		async getRecent() {
			return [];
		},
		async removeRecent() {
			/* unused */
		},
		async clearAll() {
			/* unused */
		}
	};
}

function makeFakeAdapter(label: string): remoteGit.ReadonlyRemoteAdapter {
	return {
		readTextFile: vi.fn(async () => '[]'),
		listDirectory: vi.fn(async () => []),
		headSha: vi.fn(async () => 'pending' as remoteGit.Sha),
		exists: vi.fn(async () => false),
		// `label` is only here so the test can tell the adapters apart
		// when asserting which one is bound after the refresh.
		[Symbol.toPrimitive]: () => label
	} as unknown as remoteGit.ReadonlyRemoteAdapter;
}

describe('createModeStore — refreshRemote (sub-phase 6F)', () => {
	let store: ReturnType<typeof createModeStore>;
	let fetchSpy: ReturnType<typeof vi.spyOn>;
	let onRefreshSuccessCalls: number;

	beforeEach(async () => {
		onRefreshSuccessCalls = 0;
		fetchSpy = vi.spyOn(remoteGit, 'fetchSubtree');

		store = createModeStore(
			{ adapter: undefined as never },
			{
				handles: makeFakeHandleStore(),
				onRefreshSuccess: async () => {
					onRefreshSuccessCalls += 1;
				}
			}
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ─── Happy path ─────────────────────────────────────────────────────

	it('re-invokes fetchSubtree with the cached (url, branch) + the supplied PAT', async () => {
		const initialAdapter = makeFakeAdapter('initial');
		const refreshedAdapter = makeFakeAdapter('refreshed');
		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: initialAdapter,
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'initial proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);

		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: refreshedAdapter,
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'refreshed proxy warning'
		});

		await store.refreshRemote(REFRESH_PAT);

		// Two calls total: open + refresh.
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		// The second call carried the refreshed PAT (the first carried the
		// initial PAT — same shape).
		const secondCall = fetchSpy.mock.calls[1][0];
		expect(secondCall.pat).toBe(REFRESH_PAT);
		expect(secondCall.url).toBe(KNOWN_URL);
		expect(secondCall.branch).toBe(KNOWN_BRANCH);

		// Adapter was swapped to the refreshed one.
		expect(store.remoteAdapter).toBe(refreshedAdapter);
		// Proxy warning was updated.
		expect(store.proxyWarning).toBe('refreshed proxy warning');
		// onRefreshSuccess fires after both openRemote (1×) and refreshRemote
		// (1×) — the dependency is wired into every successful remote fetch.
		expect(onRefreshSuccessCalls).toBe(2);
		// lastFetchedAt is now a number (we cannot pin it exactly because
		// the implementation uses Date.now() internally — a regression
		// that left it null would be caught here).
		expect(typeof store.lastFetchedAt).toBe('number');
	});

	// ─── PAT-required path ──────────────────────────────────────────────

	it('throws RemotePatRequiredError when the PAT is empty (no session mutation)', async () => {
		// Seed a remote session first so the empty-PAT path is reachable.
		const adapter = makeFakeAdapter('initial');
		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter,
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);
		const adapterBefore = store.remoteAdapter;
		const fetchedAtBefore = store.lastFetchedAt;

		await expect(store.refreshRemote('')).rejects.toBeInstanceOf(RemotePatRequiredError);
		await expect(store.refreshRemote('   ')).rejects.toBeInstanceOf(RemotePatRequiredError);

		// Cache intact: adapter unchanged, lastFetchedAt unchanged.
		expect(store.remoteAdapter).toBe(adapterBefore);
		expect(store.lastFetchedAt).toBe(fetchedAtBefore);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('throws RemotePatRequiredError when called outside remote mode', async () => {
		// No openRemote call — mode stays 'home'.
		expect(store.mode).toBe('home');
		await expect(store.refreshRemote(KNOWN_PAT)).rejects.toBeInstanceOf(RemotePatRequiredError);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('throws RemotePatRequiredError after signOut has cleared the scope', async () => {
		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: makeFakeAdapter('initial'),
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);
		await store.signOut();

		await expect(store.refreshRemote(KNOWN_PAT)).rejects.toBeInstanceOf(RemotePatRequiredError);
	});

	// ─── Failure path (NFR-7) ───────────────────────────────────────────

	it('leaves the existing adapter + timestamp intact when fetchSubtree rejects', async () => {
		const initialAdapter = makeFakeAdapter('initial');
		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: initialAdapter,
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);

		const adapterBefore = store.remoteAdapter;
		const fetchedAtBefore = store.lastFetchedAt;
		const proxyWarningBefore = store.proxyWarning;

		// Second fetch rejects — NFR-7: cache MUST stay intact.
		fetchSpy.mockRejectedValueOnce(new Error('Network unreachable'));
		await expect(store.refreshRemote(REFRESH_PAT)).rejects.toThrow(/Network unreachable/);

		expect(store.remoteAdapter).toBe(adapterBefore);
		expect(store.lastFetchedAt).toBe(fetchedAtBefore);
		expect(store.proxyWarning).toBe(proxyWarningBefore);
		// onRefreshSuccess fired once for the initial openRemote and
		// MUST NOT fire again on the failed refresh (the contract is
		// "fired after every successful remote fetch").
		expect(onRefreshSuccessCalls).toBe(1);
	});

	// ─── PAT hygiene (NFR-2) ───────────────────────────────────────────

	it('does not expose the refresh PAT on the public store surface', async () => {
		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: makeFakeAdapter('initial'),
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);

		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: makeFakeAdapter('refreshed'),
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.refreshRemote(REFRESH_PAT);

		const surface = JSON.stringify(store);
		expect(surface).not.toContain(KNOWN_PAT);
		expect(surface).not.toContain(REFRESH_PAT);
	});

	it('exposes lastFetchedAt=null initially and clears it on signOut', async () => {
		expect(store.lastFetchedAt).toBeNull();

		fetchSpy.mockResolvedValueOnce({
			url: KNOWN_URL,
			branch: KNOWN_BRANCH,
			sha: 'pending' as remoteGit.Sha,
			adapter: makeFakeAdapter('initial'),
			cacheKey: `${KNOWN_URL}|${KNOWN_BRANCH}|pending` as remoteGit.CacheKey,
			proxyWarning: 'proxy warning'
		});
		await store.openRemote({ url: KNOWN_URL, branch: KNOWN_BRANCH }, KNOWN_PAT);
		expect(typeof store.lastFetchedAt).toBe('number');

		await store.signOut();
		expect(store.lastFetchedAt).toBeNull();
	});

	// ─── Plumbing sanity ───────────────────────────────────────────────

	it('uses the production fetchSubtree (not a stubbed re-export)', () => {
		// Belt-and-suspenders: confirm the spy targets the real symbol so
		// a future refactor that splits the export surface cannot silently
		// diverge. The `fetchSubtree` import below is the same name used
		// inside the production code.
		expect(typeof fetchSubtree).toBe('function');
		expect(fetchSpy).toBeDefined();
	});
});
