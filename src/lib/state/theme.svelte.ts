/**
 * Theme store — tracks the active colour theme and persists it to
 * `localStorage` so the user's choice survives a reload.
 *
 * Reactivity: `theme` and `preference` are Svelte 5 `$state` slots.
 *
 * Behaviour:
 *  - **Sub-phase 6H** introduces a third preference value, `'system'`,
 *    that follows the OS-level `prefers-color-scheme` media query.
 *    The `theme` slot always resolves to the *effective* `'light' |
 *    'dark'` value so existing consumers (notably the locked
 *    `ThemeToggle.svelte`) keep working without changes.
 *  - On construction we read `localStorage.nomad.md.theme` first, then
 *    fall back to the OS-level `prefers-color-scheme` media query, then
 *    to `'light'` as a last resort (ERS FR-14).
 *  - `setTheme(t)` updates the preference slot, writes through to
 *    `localStorage` synchronously, and recomputes the effective theme.
 *  - `toggle()` flips between `'light'` and `'dark'` and persists. A
 *    user currently in `'system'` is promoted to an explicit
 *    `'light'` on the first toggle so the toggle button has a
 *    deterministic target.
 *  - When `preference === 'system'`, a `change` listener on the OS
 *    media query updates `theme` live as the user flips the OS theme.
 *  - Browser-only: every read/write gates on `assertBrowser()`. The test
 *    suite runs in Node and injects a fake `localStorage` on
 *    `globalThis` so the assertion passes; the media-query check is a
 *    no-op outside the browser.
 *
 * Dependencies: none. Pure factory; no module-level state.
 */

import { assertBrowser } from './_context.ts';

/**
 * The user-facing preference. `'system'` follows the OS-level
 * `prefers-color-scheme` media query.
 */
export type Theme = 'light' | 'dark' | 'system';

/** Effective theme — never includes `'system'`. Consumers that need to
 * compare against the rendered colour scheme should read this. */
export type ResolvedTheme = 'light' | 'dark';

/** Allowed theme preference values. */
const ALL_THEMES: readonly Theme[] = ['light', 'dark', 'system'];

/** Allowed stored values — `'system'` is allowed (matches the user's
 * pick). The previous locked build only accepted `'light' | 'dark'`;
 * the wildcard below is forward-compatible. */
const STORAGE_KEY = 'nomad.md.theme';

function isTheme(v: unknown): v is Theme {
	return typeof v === 'string' && (ALL_THEMES as readonly string[]).includes(v);
}

export interface ThemeStore {
	/** The user's preference, including the third `'system'` value. */
	readonly preference: Theme;
	/** The effective theme — `'light' | 'dark'` only. Updates live when
	 * `preference === 'system'` and the OS preference changes. */
	readonly theme: ResolvedTheme;
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
function readOsPreference(matchMedia: typeof globalThis.matchMedia): ResolvedTheme | null {
	if (typeof matchMedia !== 'function') return null;
	const mql = matchMedia('(prefers-color-scheme: dark)');
	return mql.matches ? 'dark' : 'light';
}

export interface ThemeStoreDeps {
	/** Inject the `localStorage`-shaped object. Defaults to the global `localStorage`. */
	readonly storage?: Storage;
	/** Inject `matchMedia`; defaults to `globalThis.matchMedia`. Tests pass `undefined`. */
	readonly matchMedia?: typeof globalThis.matchMedia;
	/** Inject the listener installer; defaults to `globalThis.matchMedia` at
	 * construction time. Tests pass a stub that records subscribers. */
	readonly installListener?: (listener: (e: MediaQueryListEvent) => void) => () => void;
}

/** Resolve a stored or OS-fallback value into the effective theme. */
function resolveTheme(preference: Theme, osPreference: ResolvedTheme | null): ResolvedTheme {
	if (preference === 'light' || preference === 'dark') return preference;
	return osPreference ?? 'light';
}

/**
 * Build a {@link ThemeStore}.
 *
 * @param deps  Optional test seams; production callers omit this.
 */
export function createThemeStore(deps: ThemeStoreDeps = {}): ThemeStore {
	assertBrowser();
	const ls: Storage = deps.storage ?? globalThis.localStorage;
	const matchMediaImpl: typeof globalThis.matchMedia | undefined =
		deps.matchMedia ?? globalThis.matchMedia;

	const osPreference: ResolvedTheme | null =
		typeof matchMediaImpl === 'function' ? readOsPreference(matchMediaImpl) : null;

	const initialPreference: Theme = readInitial(ls, matchMediaImpl);

	let preference = $state<Theme>(initialPreference);
	let theme = $state<ResolvedTheme>(resolveTheme(initialPreference, osPreference));

	function setTheme(t: Theme): void {
		assertBrowser();
		preference = t;
		theme = resolveTheme(t, osPreference);
		ls.setItem(STORAGE_KEY, t);
	}

	function toggle(): void {
		// Always flip to the opposite of the *effective* theme, so a
		// user currently in `'system'` lands on a deterministic explicit
		// preference. The OS preference does not influence `toggle()`.
		setTheme(theme === 'light' ? 'dark' : 'light');
	}

	// Live-update the effective theme when the user has chosen 'system'
	// and the OS preference changes at runtime (e.g. laptop undocked
	// from a dark-themed dock). We register the listener once at
	// construction whenever `matchMedia` is available; the callback
	// itself is a no-op while the preference is an explicit
	// light/dark, so there is no cost to registering unconditionally.
	// Late switches into `'system'` via `setTheme('system')` therefore
	// get the live-update behaviour without re-registering.
	if (typeof matchMediaImpl === 'function' && typeof deps.installListener === 'function') {
		deps.installListener((event) => {
			if (preference === 'system') {
				theme = event.matches ? 'dark' : 'light';
			}
		});
	}

	return {
		get preference() {
			return preference;
		},
		get theme() {
			return theme;
		},
		setTheme,
		toggle
	};
}

/**
 * Resolve the initial preference at construction time:
 *  1. `localStorage[STORAGE_KEY]` if it's a known theme (incl. 'system').
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
