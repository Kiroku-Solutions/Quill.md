/**
 * Tests for the theme store.
 *
 * Coverage targets:
 *  1. defaults to `'light'` when `localStorage` is empty.
 *  2. `toggle` switches and persists to `localStorage`.
 *  3. (bonus) `setTheme` writes through; a fresh store reads back.
 *  4. (bonus) unrecognised stored values are coerced to `'light'`.
 *
 * The store gates on `assertBrowser()`, so each test installs a fake
 * `window` on `globalThis` for the duration of the run.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createThemeStore } from '$lib/state';

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

describe('createThemeStore — defaults', () => {
	it("defaults to 'light' when localStorage is empty", () => {
		const store = createThemeStore({ storage: makeStorage() });
		expect(store.theme).toBe('light');
	});

	it("defaults to 'light' when the stored value is unrecognised", () => {
		const store = createThemeStore({ storage: makeStorage({ 'nomad.md.theme': 'high-contrast' }) });
		expect(store.theme).toBe('light');
	});

	it('reads an existing valid value from localStorage', () => {
		const store = createThemeStore({ storage: makeStorage({ 'nomad.md.theme': 'dark' }) });
		expect(store.theme).toBe('dark');
	});
});

describe('createThemeStore — toggle', () => {
	it('toggles light → dark and persists', () => {
		const ls = makeStorage();
		const store = createThemeStore({ storage: ls });
		store.toggle();
		expect(store.theme).toBe('dark');
		expect(ls.getItem('nomad.md.theme')).toBe('dark');
	});

	it('toggles dark → light and persists', () => {
		const ls = makeStorage({ 'nomad.md.theme': 'dark' });
		const store = createThemeStore({ storage: ls });
		store.toggle();
		expect(store.theme).toBe('light');
		expect(ls.getItem('nomad.md.theme')).toBe('light');
	});

	it('a fresh store reads the same value back (reload survival)', () => {
		const ls = makeStorage();
		const a = createThemeStore({ storage: ls });
		a.toggle(); // light → dark
		const b = createThemeStore({ storage: ls });
		expect(b.theme).toBe('dark');
	});
});

describe('createThemeStore — setTheme', () => {
	it('writes the given value to localStorage', () => {
		const ls = makeStorage();
		const store = createThemeStore({ storage: ls });
		store.setTheme('dark');
		expect(store.theme).toBe('dark');
		expect(ls.getItem('nomad.md.theme')).toBe('dark');
	});
});

describe('createThemeStore — prefers-color-scheme fallback (FR-14)', () => {
	function makeMatchMedia(prefersDark: boolean): typeof globalThis.matchMedia {
		return ((query: string) => ({
			matches: prefersDark && query === '(prefers-color-scheme: dark)',
			media: query,
			onchange: null,
			addListener: () => undefined,
			removeListener: () => undefined,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			dispatchEvent: () => false
		})) as unknown as typeof globalThis.matchMedia;
	}

	it("defaults to 'dark' when the OS prefers dark and storage is empty", () => {
		const ls = makeStorage();
		const store = createThemeStore({ storage: ls, matchMedia: makeMatchMedia(true) });
		expect(store.theme).toBe('dark');
	});

	it("defaults to 'light' when the OS prefers light and storage is empty", () => {
		const ls = makeStorage();
		const store = createThemeStore({ storage: ls, matchMedia: makeMatchMedia(false) });
		expect(store.theme).toBe('light');
	});

	it('the stored value beats the OS preference (FR-14 explicit user choice)', () => {
		const ls = makeStorage({ 'nomad.md.theme': 'light' });
		const store = createThemeStore({ storage: ls, matchMedia: makeMatchMedia(true) });
		expect(store.theme).toBe('light');
	});
});

describe('createThemeStore — system preference (sub-phase 6H)', () => {
	// A MediaQueryList stub that mirrors the `change` event semantics.
	// The listener registered via `installListener` is held in a
	// closure and is fired by the `dispatch()` helper so tests can
	// simulate an OS-level theme change without invoking `addEventListener`
	// (the production code uses `installListener` directly, not the
	// MQL's `addEventListener`).
	function makeMatchMediaWithListener(initialDark: boolean): {
		matchMedia: typeof globalThis.matchMedia;
		dispatch: (toDark: boolean) => void;
	} {
		let currentDark = initialDark;
		let installed: ((e: { matches: boolean }) => void) | null = null;
		const matchMedia = ((query: string) => ({
			matches: query === '(prefers-color-scheme: dark)' && currentDark,
			media: query,
			onchange: null,
			addListener: () => undefined,
			removeListener: () => undefined,
			addEventListener: (_event: string, cb: (e: { matches: boolean }) => void) => {
				installed = cb;
			},
			removeEventListener: () => undefined,
			dispatchEvent: () => false
		})) as unknown as typeof globalThis.matchMedia;
		const dispatch = (toDark: boolean): void => {
			currentDark = toDark;
			installed?.({ matches: toDark });
		};
		return { matchMedia, dispatch };
	}

	it("defaults preference to 'light' (system → light when OS prefers light)", () => {
		const ls = makeStorage();
		const { matchMedia } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		expect(store.preference).toBe('light');
		expect(store.theme).toBe('light');
	});

	it("defaults preference to 'dark' (system → dark when OS prefers dark)", () => {
		const ls = makeStorage();
		const { matchMedia } = makeMatchMediaWithListener(true);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		expect(store.preference).toBe('dark');
		expect(store.theme).toBe('dark');
	});

	it("restores a stored 'system' preference and resolves it through the OS", () => {
		const ls = makeStorage({ 'nomad.md.theme': 'system' });
		const { matchMedia } = makeMatchMediaWithListener(true);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		expect(store.preference).toBe('system');
		expect(store.theme).toBe('dark');
	});

	it("setTheme('system') persists and updates preference + effective theme", () => {
		const ls = makeStorage();
		const { matchMedia } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		store.setTheme('system');
		expect(store.preference).toBe('system');
		expect(store.theme).toBe('light');
		expect(ls.getItem('nomad.md.theme')).toBe('system');
	});

	it("setTheme('dark') overrides a 'system' preference and persists", () => {
		const ls = makeStorage({ 'nomad.md.theme': 'system' });
		const { matchMedia } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		store.setTheme('dark');
		expect(store.preference).toBe('dark');
		expect(store.theme).toBe('dark');
		expect(ls.getItem('nomad.md.theme')).toBe('dark');
	});

	it("toggle() from 'system' lands on an explicit dark preference when effective is light", () => {
		const ls = makeStorage({ 'nomad.md.theme': 'system' });
		const { matchMedia } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: () => () => undefined
		});
		store.toggle();
		expect(store.preference).toBe('dark');
		expect(store.theme).toBe('dark');
		expect(ls.getItem('nomad.md.theme')).toBe('dark');
	});

	it("OS preference change updates effective theme live while preference is 'system'", () => {
		const ls = makeStorage();
		const { matchMedia, dispatch } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			// Default `installListener` subscribes via the MQL's
			// `addEventListener`, which the stub captures for `dispatch`.
			installListener: (cb) => {
				const mql = matchMedia('(prefers-color-scheme: dark)');
				mql.addEventListener('change', cb);
				return () => mql.removeEventListener('change', cb);
			}
		});
		store.setTheme('system');
		expect(store.theme).toBe('light');
		// Simulate the user switching the OS to dark mode at runtime.
		dispatch(true);
		expect(store.theme).toBe('dark');
		// Switching back to light works too.
		dispatch(false);
		expect(store.theme).toBe('light');
	});

	it("OS preference change is a no-op when preference is an explicit 'dark'", () => {
		const ls = makeStorage({ 'nomad.md.theme': 'dark' });
		const { matchMedia, dispatch } = makeMatchMediaWithListener(false);
		const store = createThemeStore({
			storage: ls,
			matchMedia,
			installListener: (cb) => {
				const mql = matchMedia('(prefers-color-scheme: dark)');
				mql.addEventListener('change', cb);
				return () => mql.removeEventListener('change', cb);
			}
		});
		expect(store.theme).toBe('dark');
		// Firing the change event while preference is explicit 'dark'
		// must NOT flip the theme.
		dispatch(true);
		expect(store.theme).toBe('dark');
	});
});
