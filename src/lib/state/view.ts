/**
 * View store — tracks the active view mode (`'list' | 'kanban' | 'gantt'`)
 * and persists it to `localStorage` so the user's choice survives a reload.
 *
 * Behaviour:
 *  - On construction we read `localStorage.nomad.md.view` and default to
 *    `'list'` if missing / unrecognised. Unrecognised values are silently
 *    coerced to `'list'` (defensive — we never want a stale key to block
 *    the UI).
 *  - `setView(v)` updates the in-memory state and writes through to
 *    `localStorage` synchronously. The debounced write mentioned in plan
 *    §C.6 is only needed for the auto-write `$effect`; since we expose
 *    `setView` as the single mutation verb, a synchronous write is
 *    semantically equivalent and cheaper.
 *  - Browser-only: every read/write gates on `assertBrowser()`. The test
 *    suite runs in Node and injects a fake `localStorage` on `globalThis`
 *    so the assertion passes.
 *
 * Dependencies: none. Pure factory; no module-level state.
 */

import { assertBrowser } from './_context.ts';

export type View = 'list' | 'kanban' | 'gantt';

/** Allowed view values in declaration order. */
const ALL_VIEWS: readonly View[] = ['list', 'kanban', 'gantt'];

const STORAGE_KEY = 'nomad.md.view';

function isView(v: unknown): v is View {
	return typeof v === 'string' && (ALL_VIEWS as readonly string[]).includes(v);
}

export interface ViewStore {
	readonly view: View;
	readonly setView: (v: View) => void;
}

/**
 * Build a {@link ViewStore}.
 *
 * @param storage  Inject the `localStorage`-shaped object. Defaults to the
 *                 global `localStorage` so production callers omit the
 *                 argument; tests pass a fake.
 */
export function createViewStore(storage?: Storage): ViewStore {
	assertBrowser();
	const ls: Storage = storage ?? globalThis.localStorage;

	let view: View = readInitial(ls);

	function setView(v: View): void {
		assertBrowser();
		view = v;
		ls.setItem(STORAGE_KEY, v);
	}

	return {
		get view() {
			return view;
		},
		setView
	};
}

function readInitial(ls: Storage): View {
	const raw = ls.getItem(STORAGE_KEY);
	if (isView(raw)) return raw;
	return 'list';
}
