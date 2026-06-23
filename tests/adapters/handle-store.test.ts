/**
 * Tests for handleStore — IndexedDB persistence of FileSystemDirectoryHandle.
 *
 * Strategy: import the REAL handleStore singleton from `$lib/adapters/handle-store`
 * and exercise it against real Chromium IndexedDB. No mocks.
 *
 * The implementation only reads `handle.name`, so we pass plain
 * `{ name }` objects cast to FileSystemDirectoryHandle. Plain objects are
 * structured-clonable, so IndexedDB stores and returns them intact.
 *
 * Vitest project: `client` (Playwright Chromium, real IndexedDB).
 * Excluded from the `server` project via vite.config.ts because
 * `isIndexedDBAvailable()` returns false in Node (no `window.indexedDB`).
 *
 * Each test starts from a clean DB via `handleStore.clearAll()` in
 * beforeEach. Vitest's browser mode isolates each test file in its own
 * context, so the first test in the file already sees an empty store —
 * the clearAll is still required because tests within the same file
 * share an IndexedDB instance.
 *
 * ERS coverage: FR-4 ("folder handle MUST be persisted across sessions"),
 * ERS §5.5 ("Folder Handle Lifecycle").
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { handleStore } from '$lib/adapters/handle-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fake FileSystemDirectoryHandle for tests. Only `name` is read by
 * the implementation, and plain objects round-trip through IndexedDB's
 * structured clone.
 */
function fakeHandle(name: string): FileSystemDirectoryHandle {
	return { name } as unknown as FileSystemDirectoryHandle;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleStore', () => {
	beforeEach(async () => {
		await handleStore.clearAll();
	});

	// ── 1. starts empty ───────────────────────────────────────────────────────
	describe('starts empty', () => {
		it('getActive returns null when no handle has been stored', async () => {
			expect(await handleStore.getActive()).toBeNull();
		});

		it('getRecent returns an empty array when nothing is stored', async () => {
			expect(await handleStore.getRecent()).toEqual([]);
		});
	});

	// ── 2. setActive stores the handle ────────────────────────────────────────
	describe('setActive()', () => {
		it('stores exactly one active record', async () => {
			await handleStore.setActive(fakeHandle('my-project'));

			const record = await handleStore.getActive();
			expect(record).not.toBeNull();
			expect(record!.id).toBe('active');
		});

		it('replacing the active handle overwrites the previous one (no duplicates)', async () => {
			await handleStore.setActive(fakeHandle('proj-a'));
			await handleStore.setActive(fakeHandle('proj-b'));

			expect((await handleStore.getActive())!.name).toBe('proj-b');
		});

		// ── 10. handle.name stored correctly ──────────────────────────────────
		it('persists the handle.name field verbatim', async () => {
			await handleStore.setActive(fakeHandle('folder-A'));

			const record = await handleStore.getActive();
			expect(record!.name).toBe('folder-A');
		});
	});

	// ── 3. switching active promotes previous to recent-1 ─────────────────────
	describe('switching active promotes previous to recent-1', () => {
		it('A → B leaves A as recent-1 and B as active', async () => {
			await handleStore.setActive(fakeHandle('folder-A'));
			await handleStore.setActive(fakeHandle('folder-B'));

			const active = await handleStore.getActive();
			expect(active!.name).toBe('folder-B');

			const recents = await handleStore.getRecent();
			expect(recents).toHaveLength(1);
			expect(recents[0].id).toBe('recent-1');
			expect(recents[0].name).toBe('folder-A');
		});

		// ── 4. subsequent switches rotate recent correctly ────────────────────
		it('A → B → C → D rotates recents so recent-1=C, recent-2=B, recent-3=A', async () => {
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));
			await handleStore.setActive(fakeHandle('C'));
			await handleStore.setActive(fakeHandle('D'));

			const recents = await handleStore.getRecent();
			expect(recents.map((r) => r.id)).toEqual(['recent-1', 'recent-2', 'recent-3']);
			expect(recents.map((r) => r.name)).toEqual(['C', 'B', 'A']);
		});

		it('re-activating a folder that is currently in recents does not create a duplicate', async () => {
			// A → B: active=B, recents=[recent-1=A]
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));

			// B → A: active=A, recents=[recent-1=B]. Old 'A' entry is deduplicated away
			// and 'B' is promoted to recent-1.
			await handleStore.setActive(fakeHandle('A'));

			const active = await handleStore.getActive();
			expect(active!.name).toBe('A');

			const recents = await handleStore.getRecent();
			expect(recents).toHaveLength(1);
			expect(recents[0].id).toBe('recent-1');
			expect(recents[0].name).toBe('B');
		});
	});

	// ── 5. caps recent at 5 ───────────────────────────────────────────────────
	describe('caps recent handles at 5', () => {
		it('after 7 distinct setActive calls there are exactly 5 recent entries', async () => {
			for (let i = 1; i <= 7; i++) {
				await handleStore.setActive(fakeHandle(`folder-${i}`));
			}

			const recents = await handleStore.getRecent();
			expect(recents).toHaveLength(5);
			expect(recents.map((r) => r.id).sort()).toEqual([
				'recent-1',
				'recent-2',
				'recent-3',
				'recent-4',
				'recent-5'
			]);
		});

		it('oldest folder is evicted when the cap is reached', async () => {
			for (let i = 1; i <= 7; i++) {
				await handleStore.setActive(fakeHandle(`folder-${i}`));
			}

			const recents = await handleStore.getRecent();
			const names = recents.map((r) => r.name);

			// folder-1 was the oldest and must be evicted.
			expect(names).not.toContain('folder-1');
			// The new active is folder-7.
			expect((await handleStore.getActive())!.name).toBe('folder-7');
			// The 5 most-recently-demoted handles, in position order.
			expect(names).toEqual(['folder-6', 'folder-5', 'folder-4', 'folder-3', 'folder-2']);
		});
	});

	// ── 6. clearActive keeps recent intact ────────────────────────────────────
	describe('clearActive()', () => {
		it('removes the active handle but leaves recent entries untouched', async () => {
			// A → B: active=B, recents=[recent-1=A]
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));

			await handleStore.clearActive();

			expect(await handleStore.getActive()).toBeNull();
			const recents = await handleStore.getRecent();
			expect(recents.some((r) => r.name === 'A')).toBe(true);
		});

		it('is a no-op when there is no active handle', async () => {
			await expect(handleStore.clearActive()).resolves.toBeUndefined();
		});
	});

	// ── 7. clearAll wipes everything ──────────────────────────────────────────
	describe('clearAll()', () => {
		it('removes both the active handle and all recent entries', async () => {
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));
			await handleStore.setActive(fakeHandle('C'));

			await handleStore.clearAll();

			expect(await handleStore.getActive()).toBeNull();
			expect(await handleStore.getRecent()).toEqual([]);
		});

		it('is safe to call repeatedly', async () => {
			await handleStore.clearAll();
			await expect(handleStore.clearAll()).resolves.toBeUndefined();
			expect(await handleStore.getActive()).toBeNull();
			expect(await handleStore.getRecent()).toEqual([]);
		});
	});

	// ── 8. removeRecent removes specific recent ───────────────────────────────
	describe('removeRecent(id)', () => {
		it('removes the entry with the given id', async () => {
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));
			await handleStore.setActive(fakeHandle('C'));
			// State: active=C, recents=[recent-1=B, recent-2=A]

			await handleStore.removeRecent('recent-2');

			const recents = await handleStore.getRecent();
			expect(recents.map((r) => r.id)).toEqual(['recent-1']);
			expect(recents.map((r) => r.name)).toEqual(['B']);
		});

		it('does not affect the active handle', async () => {
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));

			await handleStore.removeRecent('recent-1');

			expect((await handleStore.getActive())!.name).toBe('B');
		});

		it('silently ignores invalid id formats', async () => {
			await handleStore.setActive(fakeHandle('A'));
			await handleStore.setActive(fakeHandle('B'));

			// Each of these would be a malformed id; none should throw.
			await handleStore.removeRecent('recent-99' as 'recent-1');
			await handleStore.removeRecent('active' as 'recent-1');
			await handleStore.removeRecent('recent-0' as 'recent-1');
			await handleStore.removeRecent('garbage' as 'recent-1');

			// The valid recent entry is still there.
			const recents = await handleStore.getRecent();
			expect(recents.map((r) => r.id)).toEqual(['recent-1']);
			expect(recents[0].name).toBe('A');
		});
	});

	// ── 9. getRecent ordered by position (recent-1 first, recent-5 last) ──────
	// The implementation sorts by id (position), not by addedAt. Each record's
	// addedAt is preserved across rotations to reflect the original timestamp.
	describe('getRecent() ordering', () => {
		it('returns recents in position order (recent-1 before recent-2)', async () => {
			for (const name of ['first', 'second', 'third']) {
				await handleStore.setActive(fakeHandle(name));
			}
			// After 3 calls: active='third', recents=[recent-1='second', recent-2='first']

			const recents = await handleStore.getRecent();
			expect(recents.map((r) => r.id)).toEqual(['recent-1', 'recent-2']);
		});

		it('preserves the original addedAt timestamp across rotations', async () => {
			// Build up recents with measurable timing.
			const t0 = Date.now();
			await handleStore.setActive(fakeHandle('A'));
			// Sleep a tiny bit so addedAt values differ if the implementation
			// ever decides to re-stamp them.
			await new Promise((resolve) => setTimeout(resolve, 5));
			await handleStore.setActive(fakeHandle('B'));
			await new Promise((resolve) => setTimeout(resolve, 5));
			await handleStore.setActive(fakeHandle('C'));
			const tEnd = Date.now();

			const recents = await handleStore.getRecent();

			// recent-1='B' was demoted in step 3, addedAt stamped then.
			expect(recents[0].name).toBe('B');
			expect(recents[0].addedAt).toBeGreaterThanOrEqual(t0);
			expect(recents[0].addedAt).toBeLessThanOrEqual(tEnd);

			// recent-2='A' was demoted in step 2; its addedAt is preserved
			// (not re-stamped when later rotated to recent-2).
			expect(recents[1].name).toBe('A');
			expect(recents[1].addedAt).toBeGreaterThanOrEqual(t0);
			expect(recents[1].addedAt).toBeLessThanOrEqual(tEnd);
			expect(recents[1].addedAt).toBeLessThanOrEqual(recents[0].addedAt);
		});

		it('returns an empty array when no recent entries exist', async () => {
			await handleStore.setActive(fakeHandle('only-active'));
			// No switches yet → no recents.

			expect(await handleStore.getRecent()).toEqual([]);
		});
	});
});
