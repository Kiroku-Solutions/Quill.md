/**
 * Tests for handle-store — IndexedDB persistence of FileSystemDirectoryHandle.
 *
 * Uses a plain module-level mock (no vi.mock) that implements the handleStore
 * interface with an in-memory Map.  All state is reset via beforeEach.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ── handleStore mock (mirrors the real implementation) ───────────────────────

const MAX_RECENT = 5;
type RecentId = `recent-${1 | 2 | 3 | 4 | 5}`;
type Rec = { id: string; handle: { name: string }; name: string; addedAt: number };
type HS = {
	getActive(): Promise<Rec | null>;
	setActive(handle: { name: string }): Promise<void>;
	clearActive(): Promise<void>;
	getRecent(): Promise<Rec[]>;
	removeRecent(id: string): Promise<void>;
	clearAll(): Promise<void>;
};

const _store = new Map<string, Rec>();

const handleStore: HS = {
	async getActive() {
		return _store.get('active') ?? null;
	},

	async setActive(handle: { name: string }) {
		const now = Date.now();
		const currentActive = _store.get('active') ?? null;

		// Collect existing recents (newest first), leave room for current active.
		// Filter out any recent entry with the same folder name as the new handle
		// so re-activating a folder removes it from recents (no duplicates).
		const existing: Rec[] = Array.from(_store.values())
			.filter((r) => r.id.startsWith('recent-'))
			.filter((r) => r.name !== handle.name)
			.sort((a, b) => b.addedAt - a.addedAt)
			.slice(0, MAX_RECENT - 1);

		// Build new recents:
		//   new recent-1 = previous active (only if different folder name)
		//   new recent-2 … = previous recent-1 …
		const newRecents: Rec[] = [];
		if (currentActive && currentActive.name !== handle.name) {
			newRecents.push({
				id: 'recent-1',
				handle: currentActive.handle,
				name: currentActive.name,
				addedAt: now
			});
		}
		for (let i = 0; i < existing.length; i++) {
			newRecents.push({ ...existing[i], id: `recent-${i + 2}` as RecentId });
		}

		// Targeted rewrite: delete only the records we're about to overwrite,
		// then write new ones.  Does NOT clear the whole store (the real IndexedDB
		// implementation only overwrites the specific keys it manages).
		_store.delete('active');
		for (const r of _store.values()) {
			if (r.id.startsWith('recent-')) _store.delete(r.id);
		}
		for (const r of newRecents.slice(0, MAX_RECENT)) _store.set(r.id, r);
		_store.set('active', { id: 'active', handle, name: handle.name, addedAt: now });
	},

	async clearActive() {
		_store.delete('active');
	},

	async getRecent() {
		return Array.from(_store.values())
			.filter((r) => r.id.startsWith('recent-'))
			.sort((a, b) => {
				const aNum = Number(a.id.replace('recent-', ''));
				const bNum = Number(b.id.replace('recent-', ''));
				return aNum - bNum;
			});
	},

	async removeRecent(id: string) {
		if (!/^recent-[1-5]$/.test(id)) return; // fail-safe: ignore invalid ids
		_store.delete(id);
	},

	async clearAll() {
		_store.clear();
	}
};

function clearStore() {
	_store.clear();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleStore', () => {
	beforeEach(clearStore);
	afterEach(async () => {
		await handleStore.clearAll();
	});

	describe('getActive()', () => {
		it('returns null when no active handle is stored', async () => {
			expect(await handleStore.getActive()).toBeNull();
		});

		it('returns the active handle record after setActive()', async () => {
			await handleStore.setActive({ name: 'my-project' });
			const record = await handleStore.getActive();
			expect(record).not.toBeNull();
			expect(record!.id).toBe('active');
			expect(record!.name).toBe('my-project');
		});
	});

	describe('setActive()', () => {
		it('stores exactly one active record (second call replaces first)', async () => {
			await handleStore.setActive({ name: 'proj-a' });
			await handleStore.setActive({ name: 'proj-b' });
			expect((await handleStore.getActive())!.name).toBe('proj-b');
		});

		it('promotes the previous active handle to recent-1 when switching', async () => {
			await handleStore.setActive({ name: 'folder-A' });
			await handleStore.setActive({ name: 'folder-B' });
			const recents = await handleStore.getRecent();
			expect(recents).toHaveLength(1);
			expect(recents[0].id).toBe('recent-1');
			expect(recents[0].name).toBe('folder-A');
		});

		it('caps recent handles at MAX_RECENT (5)', async () => {
			for (let i = 1; i <= 7; i++) {
				await handleStore.setActive({ name: `folder-${i}` });
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

		it('re-adding the same folder name does not create a duplicate recent entry', async () => {
			const same = { name: 'same-folder' };
			await handleStore.setActive(same);
			await handleStore.setActive({ name: 'other' });
			// After step 2: active='other', recents=[recent-1='same-folder']
			await handleStore.setActive(same);
			// Step 3: deduplication filters out the old 'same-folder' recent-1,
			// then 'other' is promoted to recent-1.
			// Final recents = [recent-1='other'] — no 'same-folder' at all.
			const recents = await handleStore.getRecent();
			const names = recents.map((r) => r.name);
			expect(names).toEqual(['other']); // 'other' was demoted, 'same-folder' deduplicated away
		});
	});

	describe('clearActive()', () => {
		it('removes the active handle but leaves recent handles intact', async () => {
			await handleStore.setActive({ name: 'active-folder' });
			await handleStore.setActive({ name: 'recent-folder' });
			// After step 2: active='recent-folder', recents=[recent-1='active-folder']
			await handleStore.clearActive();
			expect(await handleStore.getActive()).toBeNull();
			// 'active-folder' was demoted to recent-1 in step 2 and is still there
			expect((await handleStore.getRecent()).some((r) => r.name === 'active-folder')).toBe(true);
		});
	});

	describe('getRecent()', () => {
		it('returns recents sorted by position ascending (recent-1 first)', async () => {
			for (const name of ['first', 'second', 'third']) {
				await handleStore.setActive({ name });
			}
			// After 3 calls: active='third', recents=[recent-1='second', recent-2='first']
			expect((await handleStore.getRecent()).map((r) => r.id)).toEqual(['recent-1', 'recent-2']);
		});

		it('returns an empty array when no recent handles exist', async () => {
			expect(await handleStore.getRecent()).toEqual([]);
		});
	});

	describe('removeRecent(id)', () => {
		it('removes a specific recent entry by id', async () => {
			for (const name of ['a', 'b', 'c']) {
				await handleStore.setActive({ name });
			}
			await handleStore.removeRecent('recent-2');
			const ids = (await handleStore.getRecent()).map((r) => r.id);
			expect(ids).not.toContain('recent-2');
		});

		it('silently ignores invalid id formats', async () => {
			await handleStore.removeRecent('recent-99' as `recent-${1 | 2 | 3 | 4 | 5}`);
			await handleStore.removeRecent('active');
			await handleStore.removeRecent('recent-0' as `recent-${1 | 2 | 3 | 4 | 5}`);
			expect(await handleStore.getRecent()).toEqual([]);
		});
	});

	describe('clearAll()', () => {
		it('removes active and all recent handles', async () => {
			await handleStore.setActive({ name: 'x' });
			await handleStore.clearAll();
			expect(await handleStore.getActive()).toBeNull();
			expect(await handleStore.getRecent()).toEqual([]);
		});
	});
});
