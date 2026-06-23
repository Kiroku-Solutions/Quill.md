/**
 * Theme store — tracks the active colour theme (`'light' | 'dark'`) and
 * persists it to `localStorage` so the user's choice survives a reload.
 *
 * Behaviour:
 *  - On construction we read `localStorage.nomad.md.theme` and default to
 *    `'light'` if missing / unrecognised. The plan allows for honouring
 *    `prefers-color-scheme` as a fallback; we deliberately keep the
 *    bootstrap deterministic (always `'light'`) so a reload of an empty
 *    install is consistent. A future enhancement can chain the OS
 *    preference after a `null` read.
 *  - `setTheme(t)` updates the in-memory state and writes through to
 *    `localStorage` synchronously. Same rationale as `viewStore`.
 *  - `toggle()` flips between `'light'` and `'dark'` and persists.
 *  - Browser-only: every read/write gates on `assertBrowser()`. The test
 *    suite runs in Node and injects a fake `localStorage` on `globalThis`
 *    so the assertion passes.
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
 * Build a {@link ThemeStore}.
 *
 * @param storage  Inject the `localStorage`-shaped object. Defaults to the
 *                 global `localStorage` so production callers omit the
 *                 argument; tests pass a fake.
 */
export function createThemeStore(storage?: Storage): ThemeStore {
	assertBrowser();
	const ls: Storage = storage ?? globalThis.localStorage;

	let theme: Theme = readInitial(ls);

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

function readInitial(ls: Storage): Theme {
	const raw = ls.getItem(STORAGE_KEY);
	if (isTheme(raw)) return raw;
	return 'light';
}
