/**
 * State-layer tests for the `CommitQueueStore` lifecycle inside
 * `ModeStore` (Remote Edit Mode cut-over).
 *
 * The queue is started by `openRemote`, re-armed with the new
 * parent SHA by `refreshRemote`, and stopped by `signOut`. These
 * tests stub `fetchSubtree` to keep the network out of the loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as remote from '$lib/adapters/remote';
import { createModeStore } from '$lib/state';
import { createStateContext } from '$lib/state';
import { handleStore as realHandleStore } from '$lib/adapters/handle-store';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import type { Branch, RepoUrl } from '$lib/adapters/remote';

const URL = 'https://github.com/acme/widgets' as RepoUrl;
const BRANCH = 'main' as Branch;
const PAT = 'ghp_test1234567890abcdefghij';

function makeFakeAdapter(label: string) {
	return {
		readTextFile: vi.fn(async () => '[]'),
		listDirectory: vi.fn(async () => []),
		headSha: vi.fn(async () => 'pending' as remote.Sha),
		exists: vi.fn(async () => false),
		blobShaFor: vi.fn(async () => null),
		[Symbol.toPrimitive]: () => label
	} as unknown as remote.ReadonlyRemoteAdapter;
}

const PARSED = {
	providerId: 'github',
	owner: 'acme',
	repo: 'widgets',
	baseUrl: 'https://api.github.com',
	canonicalUrl: URL
};

function makeFetchResult(label: string, sha: string): remote.FetchResult {
	return {
		url: URL,
		branch: BRANCH,
		sha: sha as remote.Sha,
		adapter: makeFakeAdapter(label),
		cacheKey: `${URL}|${BRANCH}|${sha}` as remote.CacheKey,
		providerId: 'github',
		editBranch: 'quill-md',
		author: { name: 'Test User', email: 'test@example.com' },
		parsed: PARSED
	};
}

beforeEach(() => {
	vi.spyOn(realHandleStore, 'getActive').mockResolvedValue(null);
	vi.spyOn(realHandleStore, 'getRecent').mockResolvedValue([]);
	vi.spyOn(realHandleStore, 'setActive').mockResolvedValue();
	vi.spyOn(realHandleStore, 'clearActive').mockResolvedValue();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ModeStore — commit queue lifecycle', () => {
	it('openRemote starts the queue with the active session metadata', async () => {
		vi.spyOn(remote, 'fetchSubtree').mockResolvedValue(makeFetchResult('initial', 'sha-aaaa'));

		const ctx = createStateContext(new MemoryFsAdapter());
		const mode = createModeStore(ctx);
		expect(mode.commitQueue.active).toBe(false);

		await mode.openRemote({ url: URL, branch: BRANCH }, PAT);

		expect(mode.commitQueue.active).toBe(true);
		expect(mode.parentSha).toBe('sha-aaaa');
		expect(mode.editBranch).toBe('quill-md');
		expect(mode.providerId).toBe('github');
	});

	it('refreshRemote re-arms the queue with the new parent SHA without dropping pending writes', async () => {
		const fetchSpy = vi.spyOn(remote, 'fetchSubtree');
		fetchSpy.mockResolvedValueOnce(makeFetchResult('initial', 'sha-aaaa'));
		fetchSpy.mockResolvedValueOnce(makeFetchResult('refreshed', 'sha-bbbb'));

		const ctx = createStateContext(new MemoryFsAdapter());
		const mode = createModeStore(ctx);
		await mode.openRemote({ url: URL, branch: BRANCH }, PAT);
		expect(mode.parentSha).toBe('sha-aaaa');

		// Queue a Kanban drag while the queue is active.
		mode.commitQueue.enqueue({
			path: '.quill.md/issues/0001.md',
			content: 'in-flight',
			description: 'chore(quill.md): update .quill.md/issues/0001.md'
		});
		expect(mode.commitQueue.depth).toBe(1);

		await mode.refreshRemote(PAT);

		// The pending write survived the refresh (per `setSession` semantics).
		expect(mode.commitQueue.depth).toBe(1);
		// The parent SHA advanced.
		expect(mode.parentSha).toBe('sha-bbbb');
		// The remote adapter was rebuilt and fronts the refreshed snapshot.
		const writable = mode.remoteAdapter as unknown as { readOnly: remote.ReadonlyRemoteAdapter };
		expect(writable.readOnly).toBeDefined();
	});

	it('signOut stops the queue and drops the parent SHA', async () => {
		vi.spyOn(remote, 'fetchSubtree').mockResolvedValue(makeFetchResult('initial', 'sha-aaaa'));

		const ctx = createStateContext(new MemoryFsAdapter());
		const mode = createModeStore(ctx);
		await mode.openRemote({ url: URL, branch: BRANCH }, PAT);
		expect(mode.commitQueue.active).toBe(true);

		await mode.signOut();

		expect(mode.commitQueue.active).toBe(false);
		expect(mode.parentSha).toBeNull();
		expect(mode.commitQueue.depth).toBe(0);
		expect(mode.remoteAdapter).toBeNull();
	});

	it('refreshRemote on a missing session throws RemotePatRequiredError without starting the queue', async () => {
		const ctx = createStateContext(new MemoryFsAdapter());
		const mode = createModeStore(ctx);
		expect(mode.commitQueue.active).toBe(false);

		await expect(mode.refreshRemote(PAT)).rejects.toThrow(/active remote session/);
		expect(mode.commitQueue.active).toBe(false);
	});
});
