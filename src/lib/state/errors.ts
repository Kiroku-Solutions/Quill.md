/**
 * Typed errors for the state layer.
 *
 * Every state-layer code path throws or rejects with one of these (or with an
 * adapter/service error that bubbles up unchanged). The `kind` discriminator
 * is the public surface — UI code should switch on it instead of `instanceof`,
 * which lets us reorganise the class hierarchy later without touching callers.
 */

/** Discriminated kinds. Add new kinds here as new error paths appear. */
export type StateErrorKind =
	/** A browser-only API was called outside the browser. */
	| 'not-in-browser'
	/** A store action was called before its `load()` settled. */
	| 'not-ready'
	/** A supersede aborted an in-flight load. */
	| 'aborted'
	/** Catch-all for unexpected state-layer failures. */
	| 'internal';

/**
 * Base class for state-layer errors.
 *
 * Carries a `kind` discriminator for UI branching. UI should:
 * ```ts
 * try {
 *   await store.save(id);
 * } catch (e) {
 *   if (e instanceof StateError && e.kind === 'aborted') { ... }
 * }
 * ```
 */
export class StateError extends Error {
	readonly kind: StateErrorKind;

	constructor(kind: StateErrorKind, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'StateError';
		this.kind = kind;
	}
}
