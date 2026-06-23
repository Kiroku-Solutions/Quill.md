/**
 * Filter store — mirrors the active URL query string (`?status=open&...&q=…`)
 * into a plain POJO that views can read synchronously.
 *
 * Behaviour:
 *  - `filter` holds the current selection. Empty / unset values are stored as
 *    `undefined` (never `''`) so `set/clear/serialize` are idempotent.
 *  - `set(patch)` shallow-merges a partial into the current filter. Any key
 *    explicitly set to `undefined` is removed.
 *  - `clear()` resets the filter to `{}` and leaves the caller responsible
 *    for the URL replaceState (Step 6's `+layout.svelte` does the wiring).
 *  - `serialize()` and `parse()` are the loss-less bridge to
 *    `URLSearchParams`. The contract — `parse(serialize(state)) === state`
 *    — is the property test target.
 *  - Unknown keys passed to `parse()` are dropped silently. We do not want
 *    a typo / stale bookmark key to break navigation.
 *
 * URL sync is intentionally **not** wired here. The plan (Step 5 §C.5) is for
 * `+layout.svelte` to call `serialize()` into `history.replaceState` and
 * `parse()` from a `popstate` listener. Keeping the store pure makes it
 * trivially testable in Node (no `window` / `history` / `$effect`).
 *
 * Dependencies: none. Browser-only because the layout's URL effects touch
 * `history`; the store itself is pure and works in any environment.
 */

import { assertBrowser } from './_context.ts';

/** The active filter shape, mirroring the canonical query string. */
export interface FilterState {
	status?: string;
	assignee?: string;
	label?: string;
	type?: string;
	q?: string;
}

/** Keys that are part of the canonical filter. Anything else is dropped on parse. */
const KNOWN_KEYS = ['status', 'assignee', 'label', 'type', 'q'] as const;
type KnownKey = (typeof KNOWN_KEYS)[number];

function isKnownKey(k: string): k is KnownKey {
	return (KNOWN_KEYS as readonly string[]).includes(k);
}

export interface FilterStore {
	readonly filter: FilterState;
	/** Shallow-merge a partial into the current filter. `undefined` deletes a key. */
	readonly set: (patch: Partial<FilterState>) => void;
	/** Reset to `{}`. */
	readonly clear: () => void;
	/** Build a `URLSearchParams` from the non-empty entries. */
	readonly serialize: () => URLSearchParams;
	/** Replace the filter from a `URLSearchParams` (unknown keys are dropped). */
	readonly parse: (params: URLSearchParams) => void;
}

/**
 * Build a {@link FilterStore}.
 *
 * Browser-only when the caller wires the URL effect; the factory itself is
 * pure. We `assertBrowser()` lazily inside `set/clear/parse/serialize`
 * because the layout effect that calls them only runs in the browser —
 * matches the documented "Step 6 wires the effect in `+layout.svelte`"
 * contract from plan §C.5.
 */
export function createFilterStore(): FilterStore {
	let filter: FilterState = {};

	/**
	 * Treat any falsy / whitespace-only string as "absent". This keeps
	 * `serialize → parse` loss-less even if a caller did
	 * `set({ status: '' })` (which we strip) — round-trip back to `{}`.
	 */
	function normalize(value: string | null | undefined): string | undefined {
		if (value === null || value === undefined) return undefined;
		const trimmed = value.trim();
		return trimmed.length === 0 ? undefined : trimmed;
	}

	function set(patch: Partial<FilterState>): void {
		assertBrowser();
		const next: FilterState = { ...filter };
		for (const [k, v] of Object.entries(patch) as [keyof FilterState, string | undefined][]) {
			if (v === undefined) {
				delete next[k];
				continue;
			}
			const cleaned = normalize(v);
			if (cleaned === undefined) {
				delete next[k];
			} else {
				next[k] = cleaned;
			}
		}
		filter = next;
	}

	function clear(): void {
		assertBrowser();
		filter = {};
	}

	function serialize(): URLSearchParams {
		assertBrowser();
		const out = new URLSearchParams();
		for (const key of KNOWN_KEYS) {
			const value = filter[key];
			if (value !== undefined) out.set(key, value);
		}
		return out;
	}

	function parse(params: URLSearchParams): void {
		assertBrowser();
		const next: FilterState = {};
		for (const key of KNOWN_KEYS) {
			const value = normalize(params.get(key));
			if (value !== undefined) {
				// Assignment is safe because we narrowed `key` to KnownKey above.
				(next as Record<string, string>)[key] = value;
			}
		}
		// Drop unknown keys silently — the layout may pass `?foo=bar` from a
		// stale bookmark and we don't want that to throw.
		filter = next;
		// Silence the unused-import warning when isKnownKey gets tree-shaken
		// in a future refactor that drops the helper. (The helper is
		// intentionally exported-feel-private — kept for future use if we
		// want to surface "unknown keys were dropped" diagnostics.)
		void isKnownKey;
	}

	return {
		get filter() {
			return filter;
		},
		set,
		clear,
		serialize,
		parse
	};
}
