/**
 * Centralised access to the state store graph from Svelte components.
 *
 * Components consume stores through `getStores()` rather than importing
 * the factories directly. The setup in `+layout.svelte` calls
 * `setStores({...})` once per app mount so every page / nested layout
 * reaches the same store instances — module-level singletons are
 * deliberately avoided (per `step-5-state-of-the-art.md` §1.3).
 *
 * Stores that depend on a filesystem are wired with a per-mount adapter
 * provider that the mode store mutates as the user opens folders.
 *
 * ## Reactivity note
 *
 * The stores expose plain getters in `.ts` files (per the documented
 * "deliberate deviation" in `docs/senior-fullstack-review-step-5.md`).
 * Components wrap reads with `$state` cells via {@link reactive} to
 * pick up cross-store updates without a full `.svelte.ts` refactor.
 */
import { getContext, setContext } from 'svelte';
import type { ConfigStore } from './config.svelte.ts';
import type { EditorStore } from './editor.svelte.ts';
import type { FilterStore } from './filter.svelte.ts';
import type { IssuesStore } from './issues.svelte.ts';
import type { ModeStore } from './mode.svelte.ts';
import type { TemplatesStore } from './templates.svelte.ts';
import type { ThemeStore } from './theme.svelte.ts';
import type { ViewStore } from './view.svelte.ts';

export interface StoreGraph {
	readonly mode: ModeStore;
	readonly config: ConfigStore;
	readonly templates: TemplatesStore;
	readonly issues: IssuesStore;
	readonly editor: EditorStore;
	readonly filter: FilterStore;
	readonly view: ViewStore;
	readonly theme: ThemeStore;
}

const STORES_KEY = Symbol('nomad-md.stores');

/**
 * Bind a {@link StoreGraph} on the current Svelte context. Called once
 * by `+layout.svelte` at mount. Stores must be instantiated per mount —
 * the no-module-singleton rule is enforced at the type level.
 */
export function setStores(stores: StoreGraph): StoreGraph {
	setContext(STORES_KEY, stores);
	return stores;
}

/**
 * Read the bound {@link StoreGraph}. Components that need any store call
 * this at the top of their `<script>` block. Throws if the layout did
 * not bind a graph (e.g. during SSR, though `ssr = false` prevents that).
 */
export function getStores(): StoreGraph {
	const stores = getContext<StoreGraph | undefined>(STORES_KEY);
	if (!stores) {
		throw new Error(
			'getStores() called outside of a layout that bound the store graph. ' +
				'Did you forget to call setStores() in +layout.svelte?'
		);
	}
	return stores;
}
