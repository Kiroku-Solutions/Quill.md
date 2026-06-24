/**
 * Test fixture for `tests/ui/filter-url-sync.svelte.test.ts`.
 *
 * Exposes a `$state` filter cell that the `FilterUrlSync` component's
 * `$effect` can actually track (the standard `vi.mock` factory cannot
 * call `$state` — it's plain JS evaluated outside any Svelte compile
 * pass). The harness also records `set` / `parse` / `serialize`
 * invocations so the test can assert against them without poking at
 * the stub's internals from the assertion side.
 *
 * The file extension is `.svelte.ts` on purpose: the project's
 * `vite.config.ts` forces runes mode project-wide except for files
 * under `node_modules`, so this helper compiles through the Svelte
 * plugin and the `$state` rune is real.
 */
export interface FilterCall {
	readonly kind: 'set' | 'parse' | 'serialize' | 'clear';
	readonly at: number;
}

const calls: FilterCall[] = [];

let filterState: Record<string, unknown> = $state({});

function record(kind: FilterCall['kind']): void {
	calls.push({ kind, at: Date.now() });
}

export const filterHarness = {
	get filter(): Record<string, unknown> {
		return filterState;
	},
	set(patch: Record<string, unknown>): void {
		record('set');
		filterState = { ...filterState, ...patch };
	},
	clear(): void {
		record('clear');
		filterState = {};
	},
	serialize(): URLSearchParams {
		record('serialize');
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new URLSearchParams();
		for (const [k, v] of Object.entries(filterState)) {
			if (v !== undefined && v !== null && v !== '') out.set(k, String(v));
		}
		return out;
	},
	parse(params: URLSearchParams): void {
		record('parse');
		const next: Record<string, unknown> = {};
		for (const [k, v] of params.entries()) next[k] = v;
		filterState = next;
	},
	getCalls(): readonly FilterCall[] {
		return calls;
	},
	reset(): void {
		calls.length = 0;
		filterState = {};
	},
	// Manual mutation surface — the test calls this to drive a $effect
	// re-run that bypasses `set()` (so we can test the deep-equal guard
	// without going through the public API).
	setRaw(next: Record<string, unknown>): void {
		filterState = next;
	}
};
