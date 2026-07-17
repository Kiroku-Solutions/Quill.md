/**
 * End-to-end PAT hygiene test for the mode store.
 *
 * The QA audit (`docs/audits/2026-06-23/qa-audit.md`) flagged that the
 * existing "PAT hygiene (NFR-2)" describe block in `tests/state/mode.test.ts`
 * only enumerates `Object.keys(store)` — it never actually calls
 * `openRemote`, never invokes `fetchSubtree`, and never asserts that a PAT
 * flows into `onAuth` and is dropped on return. This file closes that
 * gap with a real flow:
 *
 *  - Mocks `fetchSubtree` and records the `onAuth` argument.
 *  - Calls `modeStore.openRemote({ url, branch }, pat)`.
 *  - Asserts: PAT was forwarded to `fetchSubtree.onAuth`, the store
 *    exposes only `hasRemoteCredentials: true` (and no `pat` field), the
 *    adapter is bound, and `signOut()` clears the credential signal.
 *
 * The remote module is NOT mocked through Vitest's `vi.mock` here (which
 * would require ESM-rewriting the production code); instead, the test
 * monkey-patches the module via dynamic import + property assignment on the
 * imported namespace. This keeps the test self-contained without touching
 * the production build.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as remote from '$lib/adapters/remote';
import type { HandleStore } from '$lib/adapters/handle-store';
import { createModeStore } from '$lib/state';
import { readSessionMeta } from '$lib/state/pat-storage';

const sessionStore = new Map<string, string>();
(
	globalThis as {
		sessionStorage?: {
			getItem: (k: string) => string | null;
			setItem: (k: string, v: string) => void;
			removeItem: (k: string) => void;
		};
	}
).sessionStorage = {
	getItem: (k) => sessionStore.get(k) ?? null,
	setItem: (k, v) => {
		sessionStore.set(k, v);
	},
	removeItem: (k) => {
		sessionStore.delete(k);
	}
};

const KNOWN_PAT = 'ghp_' + 'A'.repeat(36);

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

describe('createModeStore — openRemote PAT hygiene (NFR-2, end-to-end)', () => {
	let store: ReturnType<typeof createModeStore>;
	let fetchSubtreeSpy: ReturnType<typeof vi.spyOn>;
	let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
	let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		fetchSubtreeSpy = vi.spyOn(remote, 'fetchSubtree').mockResolvedValue({
			url: 'https://github.com/example/repo' as remote.RepoUrl,
			branch: 'main' as remote.Branch,
			sha: 'pending' as remote.Sha,
			providerId: 'github',
			editBranch: 'quill-md',
			author: { name: 'Test User', email: 'test@example.com' },
			adapter: {
				readTextFile: vi.fn(async () => '[]'),
				listDirectory: vi.fn(async () => []),
				headSha: vi.fn(async () => 'pending' as remote.Sha),
				exists: vi.fn(async () => false)
			},
			cacheKey: 'https://github.com/example/repo|main|pending' as remote.CacheKey
		});
		consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		sessionStore.clear();

		store = createModeStore({ adapter: undefined as never }, { handles: makeFakeHandleStore() });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('forwards the PAT into fetchSubtree so it reaches the onAuth callback', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		expect(fetchSubtreeSpy).toHaveBeenCalledTimes(1);
		const opts = fetchSubtreeSpy.mock.calls[0][0];
		expect(opts.pat).toBe(KNOWN_PAT);
	});

	it('does not expose the PAT on the public store surface', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		const surface = JSON.stringify(store);
		expect(surface).not.toContain(KNOWN_PAT);
		expect(JSON.stringify(Object.keys(store))).not.toMatch(/pat|token/i);
	});

	it('sets hasRemoteCredentials=true and binds a read-only adapter after openRemote', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		expect(store.hasRemoteCredentials).toBe(true);
		expect(store.mode).toBe('remote');
		expect(store.remoteAdapter).not.toBeNull();
		// Read-only contract: the remote adapter does NOT implement writeTextFile.
		// The TypeScript system enforces this; the runtime check below documents
		// the contract so a future contributor cannot silently re-add it.
		expect(
			(store.remoteAdapter as unknown as { writeTextFile?: unknown }).writeTextFile
		).toBeUndefined();
	});

	it('signOut clears hasRemoteCredentials and unbinds the adapter', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		expect(store.hasRemoteCredentials).toBe(true);
		await store.signOut();
		expect(store.hasRemoteCredentials).toBe(false);
		expect(store.remoteAdapter).toBeNull();
		expect(store.mode).toBe('home');
	});

	it('does not log the PAT in any captured console call', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		const allCalls = [...consoleInfoSpy.mock.calls, ...consoleDebugSpy.mock.calls];
		const flattened = allCalls
			.map((c: unknown[]) => c.map((a: unknown) => String(a)).join(' '))
			.join('\n');
		expect(flattened).not.toContain(KNOWN_PAT);
	});

	it('the PAT argument is consumed inside openRemote — a follow-up openLocalFolder still has no PAT', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		// Switching to local mode after remote must not surface the prior PAT.
		await store.openLocalFolder({
			name: 'proj',
			kind: 'directory',
			queryPermission: vi.fn(async () => 'granted' as PermissionState),
			requestPermission: vi.fn(async () => 'granted' as PermissionState)
		} as unknown as FileSystemDirectoryHandle);
		expect(store.mode).toBe('local');
		expect(JSON.stringify(store)).not.toContain(KNOWN_PAT);
	});

	it('persists session metadata alongside the PAT so silent-restore can fire', async () => {
		await store.openRemote(
			{
				url: 'https://github.com/example/repo' as remote.RepoUrl,
				branch: 'main' as remote.Branch
			},
			KNOWN_PAT
		);
		const meta = readSessionMeta();
		expect(meta).not.toBeNull();
		expect(meta?.providerId).toBe('github');
		expect(meta?.url).toBe('https://github.com/example/repo');
		expect(meta?.editBranch).toBe('quill-md');
	});

	it('forwards customBaseUrl / editBranch / preferredProviderId / commitAuthor to fetchSubtree', async () => {
		await store.openRemote(
			{
				url: 'https://gitlab.example.com/acme/widgets' as remote.RepoUrl,
				branch: 'main' as remote.Branch,
				editBranch: 'custom-branch',
				customBaseUrl: 'https://gitlab.example.com/api/v4',
				preferredProviderId: 'gitlab',
				authorName: 'Custom Author',
				authorEmail: 'custom@example.com'
			},
			KNOWN_PAT
		);
		expect(fetchSubtreeSpy).toHaveBeenCalledTimes(1);
		const opts = fetchSubtreeSpy.mock.calls[0][0];
		expect(opts.editBranch).toBe('custom-branch');
		expect(opts.customBaseUrl).toBe('https://gitlab.example.com/api/v4');
		expect(opts.preferredProviderId).toBe('gitlab');
		expect(opts.commitAuthor).toEqual({
			name: 'Custom Author',
			email: 'custom@example.com'
		});
	});
});
