/**
 * Tests for the filter store.
 *
 * Coverage targets:
 *  1. set/clear — `set` shallow-merges a partial; `clear` resets to `{}`.
 *  2. serialize → URLSearchParams round-trip is loss-less for non-empty
 *     entries.
 *  3. parse with unknown keys drops them silently (no throw).
 *  4. property-style round-trip: `parse(serialize(state)) === state` for a
 *     handful of representative states (empty, single field, all fields,
 *     weird characters).
 *
 * The store gates on `assertBrowser()`, so each test installs a fake
 * `window` on `globalThis` for the duration of the run.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFilterStore, type FilterState } from '$lib/state';

let originalWindow: unknown;
beforeEach(() => {
	originalWindow = (globalThis as { window?: unknown }).window;
	(globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => {
	(globalThis as { window?: unknown }).window = originalWindow;
});

describe('createFilterStore — set/clear', () => {
	it('set shallow-merges a partial into the current filter', () => {
		const store = createFilterStore();
		store.set({ status: 'open' });
		expect(store.filter).toEqual({ status: 'open' });
		store.set({ assignee: 'jane' });
		expect(store.filter).toEqual({ status: 'open', assignee: 'jane' });
		// Overwriting an existing key replaces it.
		store.set({ status: 'closed' });
		expect(store.filter).toEqual({ status: 'closed', assignee: 'jane' });
	});

	it('set with undefined removes a key', () => {
		const store = createFilterStore();
		store.set({ status: 'open', assignee: 'jane' });
		store.set({ status: undefined });
		expect(store.filter).toEqual({ assignee: 'jane' });
		expect('status' in store.filter).toBe(false);
	});

	it('set with empty / whitespace string is treated as absent', () => {
		const store = createFilterStore();
		store.set({ status: '   ', q: '' });
		expect(store.filter).toEqual({});
	});

	it('clear() resets to an empty object', () => {
		const store = createFilterStore();
		store.set({ status: 'open', assignee: 'jane' });
		store.clear();
		expect(store.filter).toEqual({});
	});

	it('date ranges (FR-7 creation_date / updated_date) round-trip via set/serialize/parse', () => {
		const store = createFilterStore();
		store.set({ creationDate: { from: '2026-01-01', to: '2026-12-31' } });
		expect(store.filter.creationDate).toEqual({ from: '2026-01-01', to: '2026-12-31' });
		const round = createFilterStore();
		round.parse(store.serialize());
		expect(round.filter).toEqual(store.filter);
	});

	it('rejects malformed date strings in set() and in URL parse()', () => {
		const store = createFilterStore();
		store.set({ creationDate: { from: 'not-a-date', to: '2026-13-40' } });
		expect(store.filter.creationDate).toBeUndefined();

		const url = new URLSearchParams('created_from=2026-99-99&updated_to=abc');
		const s2 = createFilterStore();
		s2.parse(url);
		expect(s2.filter.creationDate).toBeUndefined();
		expect(s2.filter.updatedDate).toBeUndefined();
	});

	it('preserves an existing date bound when only one side is patched', () => {
		const store = createFilterStore();
		store.set({ creationDate: { from: '2026-01-01', to: '2026-12-31' } });
		// Patch only `to`: `from` must be preserved.
		store.set({ creationDate: { from: '2026-01-01', to: '2026-06-30' } });
		expect(store.filter.creationDate?.from).toBe('2026-01-01');
		expect(store.filter.creationDate?.to).toBe('2026-06-30');
	});
});

describe('createFilterStore — serialize round-trip', () => {
	it('serialize builds URLSearchParams with only the non-empty keys', () => {
		const store = createFilterStore();
		store.set({ status: 'open', assignee: 'jane' });
		const params = store.serialize();
		expect(params.get('status')).toBe('open');
		expect(params.get('assignee')).toBe('jane');
		// Unset keys are absent (not present with empty value).
		expect(params.has('label')).toBe(false);
		expect(params.has('type')).toBe(false);
		expect(params.has('q')).toBe(false);
	});

	it('serialize → parse is loss-less for a fully-populated filter', () => {
		const store = createFilterStore();
		store.set({
			status: 'open',
			assignee: 'jane',
			label: 'bug',
			type: 'task',
			q: 'search term'
		});
		const params = store.serialize();
		const round = createFilterStore();
		round.parse(params);
		expect(round.filter).toEqual(store.filter);
	});

	it.each<[string, FilterState]>([
		['empty', {}],
		['single status', { status: 'open' }],
		['only search', { q: 'hello world' }],
		['all fields', { status: 'closed', assignee: 'jane', label: 'bug', type: 'task', q: 'q' }],
		['value with special chars', { q: 'has & and = signs' }]
	])('round-trip property test — %s', (_label, state) => {
		const store = createFilterStore();
		store.set(state);
		const params = store.serialize();
		const round = createFilterStore();
		round.parse(params);
		expect(round.filter).toEqual(state);
	});
});

describe('createFilterStore — parse', () => {
	it('drops unknown keys silently (no throw)', () => {
		const store = createFilterStore();
		const params = new URLSearchParams('status=open&foo=bar&baz=qux');
		expect(() => store.parse(params)).not.toThrow();
		expect(store.filter).toEqual({ status: 'open' });
		expect('foo' in store.filter).toBe(false);
		expect('baz' in store.filter).toBe(false);
	});

	it('parses a known subset of keys from the params', () => {
		const store = createFilterStore();
		store.parse(new URLSearchParams('status=open&q=foo'));
		expect(store.filter).toEqual({ status: 'open', q: 'foo' });
	});

	it('empty params produces an empty filter', () => {
		const store = createFilterStore();
		store.set({ status: 'open' });
		store.parse(new URLSearchParams());
		expect(store.filter).toEqual({});
	});

	it('strips whitespace-only values to absent', () => {
		const store = createFilterStore();
		store.parse(new URLSearchParams('status=%20%20%20&assignee=jane'));
		expect(store.filter).toEqual({ assignee: 'jane' });
	});
});
