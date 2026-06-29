/**
 * Tests for the view store.
 *
 * Coverage targets:
 *  1. defaults to `'list'` when `localStorage` is empty.
 *  2. `setView` persists to `localStorage`; a fresh store reads the same
 *     value back (so a "reload" cycle preserves the user's choice).
 *  3. (bonus) unrecognised stored values are coerced to `'list'`.
 *  4. (bonus) `setView` updates the live `view` getter.
 *
 * The store gates on `assertBrowser()`, so each test installs a fake
 * `window` on `globalThis` for the duration of the run. The fake storage
 * is passed in explicitly so we can inspect what was written.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createViewStore } from '$lib/state';

/** Minimal in-memory `Storage` for tests. */
function makeStorage(initial: Record<string, string> = {}): Storage {
	const map = new Map<string, string>(Object.entries(initial));
	return {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		getItem(key: string) {
			return map.has(key) ? (map.get(key) as string) : null;
		},
		key(index: number) {
			return [...map.keys()][index] ?? null;
		},
		removeItem(key: string) {
			map.delete(key);
		},
		setItem(key: string, value: string) {
			map.set(key, value);
		}
	};
}

let originalWindow: unknown;
beforeEach(() => {
	originalWindow = (globalThis as { window?: unknown }).window;
	(globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => {
	(globalThis as { window?: unknown }).window = originalWindow;
});

describe('createViewStore — defaults', () => {
	it("defaults to 'list' when localStorage is empty", () => {
		const store = createViewStore(makeStorage());
		expect(store.view).toBe('list');
	});

	it("defaults to 'list' when the stored value is unrecognised", () => {
		const store = createViewStore(makeStorage({ 'nomad.md.view': 'mosaic' }));
		expect(store.view).toBe('list');
	});

	it('reads an existing valid value from localStorage', () => {
		const store = createViewStore(makeStorage({ 'nomad.md.view': 'kanban' }));
		expect(store.view).toBe('kanban');
	});
});

describe('createViewStore — setView persistence', () => {
	it('persists to localStorage; a fresh store reads the same value', () => {
		const ls = makeStorage();
		const a = createViewStore(ls);
		a.setView('gantt');
		expect(ls.getItem('nomad.md.view')).toBe('gantt');

		// Simulate a "reload" by building a new store against the same
		// storage backend.
		const b = createViewStore(ls);
		expect(b.view).toBe('gantt');
	});

	it('updates the live view getter', () => {
		const store = createViewStore(makeStorage());
		store.setView('kanban');
		expect(store.view).toBe('kanban');
		store.setView('list');
		expect(store.view).toBe('list');
	});

	it('does not write through the "coerce unknown" path on read', () => {
		// A stale 'mosaic' value should not be overwritten on construction.
		const ls = makeStorage({ 'nomad.md.view': 'mosaic' });
		const store = createViewStore(ls);
		expect(store.view).toBe('list');
		expect(ls.getItem('nomad.md.view')).toBe('mosaic');
		// The first setView replaces it with a valid value.
		store.setView('kanban');
		expect(ls.getItem('nomad.md.view')).toBe('kanban');
	});
});
