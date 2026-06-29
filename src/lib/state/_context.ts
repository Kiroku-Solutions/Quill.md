/**
 * Shared foundation for every store under `src/lib/state/**`.
 *
 * Every store factory takes a {@link StateContext}. The context is the only
 * thing that ties a store to the outside world (the {@link DirectoryAdapter})
 * and to the runtime (the optional {@link AbortSignal}).
 *
 * ## Why a context object instead of module-level state?
 *
 * Module-level state makes a Svelte 5 store impossible to test per-case (HMR
 * bleed, singleton contamination, no way to run two scenarios side by side).
 * A factory pattern with explicit context is the canonical Svelte 5 idiom
 * and matches the rest of the project's architecture (adapters + services are
 * pure, testable, dependency-injected).
 *
 * ## AbortSignal contract
 *
 * The optional `signal` is the abort handle for any async operation started
 * by a store. Stores are expected to:
 *
 * 1. Create a fresh `AbortController` per action that may be superseded
 *    (e.g. `load()` after a folder switch).
 * 2. Pass the controller's `signal` to services that accept one (where
 *    available — the existing service signatures do not, but the seam is in
 *    place for Step 6 to wire them).
 * 3. Abort the previous controller when a new action supersedes it.
 *
 * The `assertBrowser` helper below is deliberately generic — it is useful
 * across multiple stores.
 */

import type { DirectoryAdapter } from '../adapters/directory-adapter.ts';
import { StateError } from './errors.ts';

/**
 * The bundle of dependencies a state-layer factory needs.
 *
 * `adapter` is required: every store eventually reads or writes through it.
 * `signal` is optional and only meaningful in tests that want to verify
 * abort behaviour; production callers typically omit it.
 */
export interface StateContext {
	readonly adapter: DirectoryAdapter;
	/** Abort handle the store should respect on supersede. Optional. */
	readonly signal?: AbortSignal;
}

/**
 * Build a {@link StateContext}. Pure factory — no module-level state.
 */
export function createStateContext(adapter: DirectoryAdapter, signal?: AbortSignal): StateContext {
	if (signal !== undefined) return { adapter, signal };
	return { adapter };
}

/**
 * Throw {@link StateError} with kind `'not-in-browser'` if invoked in a
 * non-browser context.
 *
 * Use inside `$effect` bodies that touch `window`, `localStorage`, or
 * IndexedDB. The static adapter means we never actually SSR, but defensive
 * coding prevents surprise breakage in `@vitest/browser-playwright` jsdom
 * injection or any future preview-mode setup.
 */
export function assertBrowser(): void {
	if (typeof window === 'undefined') {
		throw new StateError('not-in-browser', 'Browser-only API called outside the browser');
	}
}
