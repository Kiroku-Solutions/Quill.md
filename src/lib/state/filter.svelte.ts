/**
 * Filter store — mirrors the active URL query string (`?status=open&...&q=…`)
 * into a plain POJO that views can read synchronously.
 *
 * Reactivity: `filter` is a Svelte 5 `$state` slot. Consumers reading
 * `store.filter` get fine-grained reactivity. The whole `FilterState`
 * is replaced on every `set` / `clear` / `parse` call (no in-place
 * mutation), so the `$state` proxy sees a fresh object and re-runs
 * downstream `$derived` consumers correctly.
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
 * Filter predicates (ERS FR-7):
 *  - `status` / `assignee` / `label` / `type` — single-value selectors.
 *  - `q` — free-text search across `title` + section bodies.
 *  - `created_from` / `created_to` — inclusive date bounds on
 *    `creation_date`.
 *  - `updated_from` / `updated_to` — inclusive date bounds on
 *    `updated_date`.
 *
 * Dependencies: none. Browser-only because the layout's URL effects touch
 * `history`; the store itself is pure and works in any environment.
 */

import { untrack } from 'svelte';
import { assertBrowser } from './_context.ts';

/** Inclusive date range (ISO `YYYY-MM-DD` strings, per ERS §6.1.3). */
export interface DateRange {
	readonly from?: string;
	readonly to?: string;
}

/**
 * The active filter shape, mirroring the canonical query string.
 *
 * Date-range fields are encoded as `<field>_from` and `<field>_to` in the
 * URL; the in-memory shape keeps them grouped under `DateRange` objects
 * so consumers don't have to scatter four parallel keys.
 */
export interface FilterState {
	status?: string;
	assignee?: string;
	label?: string;
	type?: string;
	q?: string;
	creationDate?: DateRange;
	updatedDate?: DateRange;
}

/** Flat keys that live at the top level of the URL query. */
const SCALAR_KEYS = ['status', 'assignee', 'label', 'type', 'q'] as const;
/** Date-range field names; encoded as `<field>_from` / `<field>_to`. */
const DATE_FIELDS = ['created', 'updated'] as const;
const ALL_KEYS = [...SCALAR_KEYS, ...DATE_FIELDS.flatMap((f) => [`${f}_from`, `${f}_to`])] as const;
type KnownKey = (typeof ALL_KEYS)[number];

function isKnownKey(k: string): k is KnownKey {
	return (ALL_KEYS as readonly string[]).includes(k);
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
	let filter = $state<FilterState>({});

	/**
	 * Treat any falsy / whitespace-only string as "absent". This keeps
	 * `serialize → parse` loss-less even if a caller did
	 * `set({ status: '' })` (which we strip) — round-trip back to `{}`.
	 *
	 * Date strings additionally must match `YYYY-MM-DD`. Anything else
	 * is dropped so a typo'd query parameter does not propagate.
	 */
	function normalize(value: string | null | undefined, isDate = false): string | undefined {
		if (value === null || value === undefined) return undefined;
		const trimmed = value.trim();
		if (trimmed.length === 0) return undefined;
		if (isDate) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
			// Reject calendar-impossible dates such as 2026-13-40 or
			// 2026-02-30. `Date` accepts those as overflow (April 9 in
			// the example), so we have to round-trip via `toISOString`
			// and compare against the input.
			// The `Date` is local validation state only — it is never
			// stored, never exposed, never enters the reactive graph.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const d = new Date(`${trimmed}T00:00:00.000Z`);
			if (Number.isNaN(d.getTime())) return undefined;
			if (d.toISOString().slice(0, 10) !== trimmed) return undefined;
		}
		return trimmed;
	}

	function set(patch: Partial<FilterState>): void {
		assertBrowser();
		const next: FilterState = { ...untrack(() => filter) };
		// Iterate only the keys actually present in `patch` so that omitted
		// keys are preserved — this matches the documented "shallow-merge"
		// contract (the existing key is left alone unless the caller names
		// it explicitly, including explicitly as `undefined` to delete).
		// Local set built for `O(1)` membership lookup during the loop;
		// never escapes `set()`, never enters the reactive graph.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const SCALAR_KEY_SET = new Set<string>(SCALAR_KEYS);
		for (const [k, v] of Object.entries(patch)) {
			if (SCALAR_KEY_SET.has(k)) {
				const cleaned = normalize(v as string | undefined);
				if (cleaned === undefined) delete next[k as keyof FilterState];
				else (next as Record<string, string>)[k] = cleaned;
			}
		}
		for (const field of DATE_FIELDS) {
			const targetKey = field === 'created' ? 'creationDate' : 'updatedDate';
			if (!(targetKey in patch)) continue;
			const existing = next[targetKey] ?? {};
			const rangePatch = patch[targetKey];
			const from = rangePatch?.from;
			const to = rangePatch?.to;
			const nextFrom = from === undefined ? existing.from : normalize(from, true);
			const nextTo = to === undefined ? existing.to : normalize(to, true);
			if (nextFrom === undefined && nextTo === undefined) {
				delete next[targetKey];
			} else {
				next[targetKey] = {
					...(nextFrom !== undefined ? { from: nextFrom } : {}),
					...(nextTo !== undefined ? { to: nextTo } : {})
				};
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
		// Local accumulator for the URL-serialise pass; returned to the
		// caller, never stored in the reactive graph. The reactive channel
		// is the `filter` $state slot; the URLSearchParams is a pure
		// derived value computed on each `serialize()` call.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new URLSearchParams();
		for (const key of SCALAR_KEYS) {
			const value = filter[key];
			if (value !== undefined) out.set(key, value);
		}
		for (const field of DATE_FIELDS) {
			const targetKey = field === 'created' ? 'creationDate' : 'updatedDate';
			const range = filter[targetKey];
			if (!range) continue;
			if (range.from !== undefined) out.set(`${field}_from`, range.from);
			if (range.to !== undefined) out.set(`${field}_to`, range.to);
		}
		return out;
	}

	function parse(params: URLSearchParams): void {
		assertBrowser();
		const next: FilterState = {};
		for (const key of SCALAR_KEYS) {
			const value = normalize(params.get(key));
			if (value !== undefined) next[key] = value;
		}
		for (const field of DATE_FIELDS) {
			const from = normalize(params.get(`${field}_from`), true);
			const to = normalize(params.get(`${field}_to`), true);
			if (from !== undefined || to !== undefined) {
				next[field === 'created' ? 'creationDate' : 'updatedDate'] = {
					...(from !== undefined ? { from } : {}),
					...(to !== undefined ? { to } : {})
				};
			}
		}
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
