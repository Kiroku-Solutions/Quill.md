/**
 * Theme store — tracks the active colour theme (`'light' | 'dark'`) and
 * persists it to `localStorage` so the user's choice survives a reload.
 *
 * Reactivity: `theme` is a Svelte 5 `$state` slot.
 *
 * Behaviour:
 *  - On construction we read `localStorage.nomad.md.theme` first, then
 *    fall back to the OS-level `prefers-color-scheme` media query, then
 *    to `'light'` as a last resort (ERS FR-14).
 *  - `setTheme(t)` updates the in-memory state and writes through to
 *    `localStorage` synchronously.
 *  - `toggle()` flips between `'light'` and `'dark'` and persists.
 *  - Browser-only: every read/write gates on `assertBrowser()`. The test
 *    suite runs in Node and injects a fake `localStorage` on `globalThis`
 *    so the assertion passes; the media-query check is no-op outside the
 *    browser.
 *
 * Dependencies: none. Pure factory; no module-level state.
 */

import { assertBrowser } from './_context.ts';

export type Theme = 'light' | 'dark';

/** Allowed theme values. */
const ALL_THEMES: readonly Theme[] = ['light', 'dark'];

const STORAGE_KEY = 'nomad.md.theme';

function isTheme(v: unknown): v is Theme {
	return typeof v === 'string' && (ALL_THEMES as readonly string[]).includes(v);
}

export interface ThemeStore {
	readonly theme: Theme;
	readonly setTheme: (t: Theme) => void;
	/** Flip between `'light'` and `'dark'` and persist. */
	readonly toggle: () => void;
}

/**
 * Read the OS-level `prefers-color-scheme` setting via the provided
 * `matchMedia`. Returns the resolved theme or `null` if `matchMedia` is
 * not available (SSR / Node test) so callers can fall through to a safe
 * default.
 */
function readOsPreference(matchMedia: typeof globalThis.matchMedia): Theme | null {
	if (typeof matchMedia !== 'function') return null;
	const mql = matchMedia('(prefers-color-scheme: dark)');
	return mql.matches ? 'dark' : 'light';
}

export interface ThemeStoreDeps {
	/** Inject the `localStorage`-shaped object. Defaults to the global `localStorage`. */
	readonly storage?: Storage;
	/** Inject `matchMedia`; defaults to `globalThis.matchMedia`. Tests pass `undefined`. */
	readonly matchMedia?: typeof globalThis.matchMedia;
}

/**
 * Build a {@link ThemeStore}.
 *
 * @param deps  Optional test seams; production callers omit this.
 */
export function createThemeStore(deps: ThemeStoreDeps = {}): ThemeStore {
	assertBrowser();
	const ls: Storage = deps.storage ?? globalThis.localStorage;

	let theme = $state<Theme>(readInitial(ls, deps.matchMedia ?? globalThis.matchMedia));

	function setTheme(t: Theme): void {
		assertBrowser();
		theme = t;
		ls.setItem(STORAGE_KEY, t);
	}

	function toggle(): void {
		setTheme(theme === 'light' ? 'dark' : 'light');
	}

	return {
		get theme() {
			return theme;
		},
		setTheme,
		toggle
	};
}

/**
 * Resolve the initial theme at construction time:
 *  1. `localStorage[STORAGE_KEY]` if it's a known theme.
 *  2. `prefers-color-scheme` if `matchMedia` is available.
 *  3. `'light'` as the safe default.
 */
function readInitial(ls: Storage, matchMedia: typeof globalThis.matchMedia | undefined): Theme {
	const raw = ls.getItem(STORAGE_KEY);
	if (isTheme(raw)) return raw;
	if (matchMedia) {
		return readOsPreference(matchMedia) ?? 'light';
	}
	return 'light';
}
