/**
 * Tests for the `RemoteWritableAdapter` (Remote Edit Mode cut-over).
 *
 * The adapter fronts a read-only snapshot and translates FSA-style
 * mutation verbs into queued writes against the singleton
 * `CommitQueueStore`. These tests run in pure Node (the `server`
 * Vitest project) — they mock the commit queue with a small
 * recorder so we can assert on what gets enqueued without booting
 * the full provider stack.
 */
import { describe, expect, it, vi } from 'vitest';
import { AdapterNotFoundError } from '$lib/adapters';
import { RemoteWritableAdapter } from '$lib/adapters/remote-writable';
import type { ShaLookup } from '$lib/adapters/remote-writable';
import type { CommitQueueStore, QueuedWrite } from '$lib/state/commit-queue.svelte';
import type { Sha } from '$lib/adapters/remote';

interface FakeShaLookupOpts {
	readonly files?: ReadonlyMap<string, string>;
	readonly shas?: ReadonlyMap<string, string>;
}

function makeShaLookup(opts: FakeShaLookupOpts = {}): ShaLookup & { calls: number } {
	const calls = { n: 0 };
	return {
		get calls() {
			return calls.n;
		},
		readTextFile: vi.fn(async (path: string) => {
			calls.n++;
			const content = opts.files?.get(path);
			if (content === undefined) {
				throw new AdapterNotFoundError(path);
			}
			return content;
		}),
		listDirectory: vi.fn(async () => []),
		headSha: vi.fn(async () => 'deadbeef' as Sha),
		exists: vi.fn(async (rel: string) => opts.files?.has(rel) ?? false),
		blobShaFor: vi.fn(async (rel: string) => opts.shas?.get(rel) ?? null)
	} as unknown as ShaLookup & { calls: number };
}

interface FakeQueueOpts {
	readonly onFlush?: (msg: string) => Promise<void> | void;
}

function makeFakeQueue(opts: FakeQueueOpts = {}): CommitQueueStore & {
	pending: QueuedWrite[];
	flushed: { msg: string; writes: QueuedWrite[] }[];
} {
	const pending: QueuedWrite[] = [];
	const flushed: { msg: string; writes: QueuedWrite[] }[] = [];
	const queue = {
		depth: 0,
		lastFlushAt: null as number | null,
		lastError: null as Error | null,
		flushing: false,
		active: true,
		pending,
		flushed,
		start: vi.fn(),
		setSession: vi.fn(),
		stop: vi.fn(),
		clear: vi.fn(),
		pendingSnapshot: () => pending.slice(),
		enqueue: vi.fn((write: QueuedWrite) => {
			pending.push(write);
			queue.depth = pending.length;
		}),
		flushNow: vi.fn(async (msg: string) => {
			const snapshot = pending.slice();
			pending.length = 0;
			queue.depth = 0;
			flushed.push({ msg, writes: snapshot });
			await opts.onFlush?.(msg);
		})
	};
	return queue as unknown as CommitQueueStore & {
		pending: QueuedWrite[];
		flushed: { msg: string; writes: QueuedWrite[] }[];
	};
}

describe('RemoteWritableAdapter — write surface', () => {
	it('enqueues an upsert with the snapshot blob SHA as expectedSha', async () => {
		const sha = 'abc123' as Sha;
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'old content']]),
			shas: new Map([['.quill.md/issues/0001-foo.md', sha]])
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'new content');

		expect(queue.pending).toHaveLength(1);
		const w = queue.pending[0]!;
		expect(w.path).toBe('.quill.md/issues/0001-foo.md');
		expect(w.content).toBe('new content');
		expect(w.expectedSha).toBe(sha);
		expect(w.description).toBe('chore(quill.md): update .quill.md/issues/0001-foo.md');
		expect(w.delete).toBeUndefined();
	});

	it('enqueues an upsert with null expectedSha for brand-new files', async () => {
		const readOnly = makeShaLookup({
			files: new Map(),
			shas: new Map()
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.writeTextFile('.quill.md/issues/0007-new.md', 'fresh');

		expect(queue.pending[0]?.expectedSha).toBeNull();
	});

	it('enqueues a delete with the snapshot blob SHA as previousSha', async () => {
		const sha = 'def456' as Sha;
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'content']]),
			shas: new Map([['.quill.md/issues/0001-foo.md', sha]])
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.removeFile('.quill.md/issues/0001-foo.md');

		expect(queue.pending).toHaveLength(1);
		const w = queue.pending[0]!;
		expect(w.path).toBe('.quill.md/issues/0001-foo.md');
		expect(w.delete).toBe(true);
		expect(w.previousSha).toBe(sha);
		expect(w.description).toBe('chore(quill.md): delete .quill.md/issues/0001-foo.md');
	});

	it('moveFile enqueues an upsert + delete and flushes immediately as one commit', async () => {
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'old content']]),
			shas: new Map([['.quill.md/issues/0001-foo.md', 'sha-1']])
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.moveFile(
			'.quill.md/issues/0001-foo.md',
			'.quill.md/.trash/1700000000-0001-foo.md'
		);

		// Two writes queued in the same debounce window, then a flush.
		expect(queue.pending).toHaveLength(0);
		expect(queue.flushed).toHaveLength(1);
		const flush = queue.flushed[0]!;
		expect(flush.msg).toBe(
			'chore(quill.md): move .quill.md/issues/0001-foo.md → .quill.md/.trash/1700000000-0001-foo.md'
		);
		expect(flush.writes).toHaveLength(2);
		expect(flush.writes[0]?.path).toBe('.quill.md/.trash/1700000000-0001-foo.md');
		expect(flush.writes[0]?.delete).toBeUndefined();
		expect(flush.writes[1]?.path).toBe('.quill.md/issues/0001-foo.md');
		expect(flush.writes[1]?.delete).toBe(true);
	});
});

describe('RemoteWritableAdapter — read overlay', () => {
	it('serves queued upserts from the overlay before the queue flushes', async () => {
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'old']]),
			shas: new Map()
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'in-flight edit');
		const text = await adapter.readTextFile('.quill.md/issues/0001-foo.md');
		expect(text).toBe('in-flight edit');
	});

	it('throws AdapterNotFoundError when an upsert is queued then a delete is queued', async () => {
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'old']]),
			shas: new Map()
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'in-flight');
		await adapter.removeFile('.quill.md/issues/0001-foo.md');

		await expect(adapter.readTextFile('.quill.md/issues/0001-foo.md')).rejects.toBeInstanceOf(
			AdapterNotFoundError
		);
	});

	it('moveFile reads through the overlay so an unsaved edit is preserved on the move', async () => {
		const readOnly = makeShaLookup({
			files: new Map([['.quill.md/issues/0001-foo.md', 'old on remote']]),
			shas: new Map()
		});
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		// Local edit, then move to trash. The moved file should carry
		// the local edit, not the stale remote content.
		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'local edit');
		await adapter.moveFile(
			'.quill.md/issues/0001-foo.md',
			'.quill.md/.trash/1700000000-0001-foo.md'
		);

		expect(queue.flushed[0]?.writes[0]?.content).toBe('local edit');
	});

	it('coalesces consecutive writes to the same path (replaces, not appends)', async () => {
		const readOnly = makeShaLookup({ files: new Map(), shas: new Map() });
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });

		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'v1');
		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'v2');
		await adapter.writeTextFile('.quill.md/issues/0001-foo.md', 'v3');

		// CommitQueueStore's coalesce logic is exercised separately
		// (commit-queue.svelte.ts); this test verifies the adapter
		// hands off correctly. The fake queue does NOT coalesce, but
		// the adapter's overlay reflects only the latest content.
		expect(queue.pending).toHaveLength(3);
		const text = await adapter.readTextFile('.quill.md/issues/0001-foo.md');
		expect(text).toBe('v3');
	});
});

describe('RemoteWritableAdapter — construction', () => {
	it('holds a public `readOnly` reference for test introspection', () => {
		const readOnly = makeShaLookup();
		const queue = makeFakeQueue();
		const adapter = new RemoteWritableAdapter({ readOnly, queue });
		expect(adapter.readOnly).toBe(readOnly);
	});
});

describe('RemoteWritableAdapter — ReadonlyRemoteAdapter compatibility', () => {
	it('is drop-in compatible with the WritableDirectoryAdapter contract', async () => {
		// Sanity check: a `RemoteWritableAdapter` instance satisfies
		// every method a `WritableDirectoryAdapter` consumer expects.
		const readOnly = makeShaLookup({ files: new Map(), shas: new Map() });
		const queue = makeFakeQueue();
		const adapter: import('$lib/adapters').WritableDirectoryAdapter = new RemoteWritableAdapter({
			readOnly,
			queue
		});
		expect(typeof adapter.readTextFile).toBe('function');
		expect(typeof adapter.listDirectory).toBe('function');
		expect(typeof adapter.writeTextFile).toBe('function');
		expect(typeof adapter.removeFile).toBe('function');
		expect(typeof adapter.moveFile).toBe('function');
	});
});
