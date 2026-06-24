/**
 * FilterUrlSync.svelte — URL ↔ filter store bridge (sub-phase 6I).
 *
 * Verifies the 6I acceptance criteria from the brief:
 *   - Mount with `?q=foo&status=bar` in the URL calls `filter.set`
 *     with the parsed value.
 *   - Mount with no query string leaves the filter untouched (no
 *     `set` call).
 *   - A change to `filter.filter` calls `history.replaceState` with
 *     the new serialised query string after the 100 ms debounce.
 *   - A `popstate` event re-reads `window.location.search` and calls
 *     `filter.set` with the parsed value.
 *   - `history.pushState` is NEVER called (we must not pollute back /
 *     forward with a new entry per filter change).
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project.
 *
 * ## Why a `.svelte.ts` harness + `vi.mock`
 *
 * The `FilterUrlSync` component reads `filter.filter` inside a `$effect`,
 * so the stub needs to expose a real `$state` cell for the effect to
 * track. `$state` cannot live inside the `vi.mock` factory (plain JS,
 * not compiled by the Svelte plugin), so we put the reactive cell in
 * a `.svelte.ts` fixture and have the mock delegate to it. The fixture
 * is `tests/ui/FilterUrlSyncHarness.svelte.ts` — the `.svelte.ts`
 * extension ensures the Svelte Vite plugin compiles it and the rune
 * is real. The include glob (`*.{test,spec}.{js,ts}`) does NOT match
 * `.svelte.ts`, so the harness is not picked up as a test file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FilterUrlSync from '../../src/lib/components/FilterUrlSync.svelte';
import { filterHarness } from './FilterUrlSyncHarness.svelte.ts';

vi.mock('$lib/state', () => ({
	getStores: () => ({
		mode: {},
		config: {},
		templates: {},
		issues: {},
		editor: {},
		view: {},
		theme: {},
		filter: filterHarness
	}),
	setStores: () => {}
}));

async function tick(ms = 150): Promise<void> {
	// Two microtask flushes + a macrotask delay — enough to let a
	// `setTimeout(..., 100)` fire and the Svelte scheduler run the
	// `$effect` again. The 100 ms debounce in `FilterUrlSync.svelte`
	// is the lower bound; we wait 150 ms to leave headroom.
	await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('FilterUrlSync', () => {
	beforeEach(() => {
		filterHarness.reset();
		// Reset the URL to a clean slate (no query string) before each
		// test. Vitest's browser context is shared across tests in the
		// same file, so a prior test's URL would leak into the next.
		window.history.replaceState(null, '', window.location.pathname);
		vi.restoreAllMocks();
	});

	it('mount with ?q=foo&status=bar in the URL calls filter.set with the parsed value', async () => {
		window.history.replaceState(null, '', '?q=foo&status=bar');
		const replaceSpy = vi.spyOn(window.history, 'replaceState');

		render(FilterUrlSync);
		await tick();

		const setCalls = filterHarness.getCalls().filter((c) => c.kind === 'set' || c.kind === 'parse');
		expect(setCalls.length).toBeGreaterThan(0);
		expect(filterHarness.filter).toMatchObject({ q: 'foo', status: 'bar' });
		// The deep-equal guard should NOT trigger an immediate URL write
		// on mount — we already had this query in the URL, so the
		// serialised form is the same.
		expect(replaceSpy).not.toHaveBeenCalled();
	});

	it('mount with no query string leaves the filter untouched', async () => {
		const setCallsBefore = filterHarness.getCalls().length;

		render(FilterUrlSync);
		await tick();

		const setCallsAfter = filterHarness.getCalls().length;
		// No `set` / `parse` / `clear` was issued on mount — the empty
		// query branch is a no-op.
		expect(setCallsAfter).toBe(setCallsBefore);
		expect(filterHarness.filter).toEqual({});
	});

	it('a filter.filter change calls history.replaceState with the serialised query (after 100 ms debounce)', async () => {
		const replaceSpy = vi.spyOn(window.history, 'replaceState');
		const pushSpy = vi.spyOn(window.history, 'pushState');

		render(FilterUrlSync);
		await tick();

		// Drive a $effect re-run by mutating the reactive cell
		// directly. We bypass the public `set()` so the call log
		// only reflects what the component itself initiated.
		filterHarness.setRaw({ q: 'needle', status: 'open' });
		await tick();

		expect(replaceSpy).toHaveBeenCalled();
		const lastCall = replaceSpy.mock.calls.at(-1);
		expect(lastCall?.[2]).toBe('?q=needle&status=open');
		// And `pushState` must NEVER have been called.
		expect(pushSpy).not.toHaveBeenCalled();
	});

	it('a popstate event re-reads window.location.search and calls filter.set', async () => {
		render(FilterUrlSync);
		await tick();

		const callsBefore = filterHarness.getCalls().length;

		window.history.replaceState(null, '', '?q=popstate&type=bug');
		window.dispatchEvent(new PopStateEvent('popstate'));
		await tick();

		const callsAfter = filterHarness.getCalls().length;
		expect(callsAfter).toBeGreaterThan(callsBefore);
		expect(filterHarness.filter).toMatchObject({ q: 'popstate', type: 'bug' });
	});
});
