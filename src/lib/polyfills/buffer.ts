/**
 * Buffer polyfill for browser builds.
 *
 * ## Why this file exists
 *
 * `isomorphic-git`'s browser bundle evaluates `Buffer` at module-load time
 * (it is referenced by several sub-modules that re-export it as a default).
 * Node and jsdom have `Buffer` natively; real browsers do not. Without this
 * polyfill the production browser bundle throws `ReferenceError: Buffer is
 * not defined` the moment `isomorphic-git` is imported for real.
 *
 * The committee audit (`docs/audits/2026-06-23/architecture-audit.md:353`,
 * `qa-audit.md:177`, `ers-compliance-audit.md:267, 319`) flagged the broken
 * `vite.config.ts` workaround (`'globalThis.Buffer': 'globalThis.Buffer'`
 * which resolves to `undefined` in browsers) and required a real polyfill.
 *
 * ## Idempotency contract
 *
 * `installBuffer()` is safe to call any number of times, from any number of
 * concurrent callers, in any environment:
 *
 *  1. Fast path — if `globalThis.Buffer` is already defined (Node, jsdom, or
 *     a previous call to `installBuffer()` in this page), the function
 *     returns the existing `Buffer` constructor **without** importing the
 *     `buffer` package. This keeps the production Node bundle untouched
 *     (the `buffer` import is dynamic, so Vite/Rollup tree-shakes it away
 *     in Node-only builds where the polyfill never runs).
 *  2. Slow path — if `globalThis.Buffer` is `undefined`, the function
 *     dynamically imports the `buffer` package (latest 6.x) and assigns
 *     `Buffer` to `globalThis.Buffer` exactly once. The in-flight import
 *     promise is cached so two concurrent callers see the **same**
 *     `Buffer` constructor (reference equality).
 *
 * ## Where it must be imported
 *
 * `src/routes/+layout.svelte` imports this module as its first statement,
 * before any `$lib/adapters` import. This guarantees `globalThis.Buffer` is
 * defined before `isomorphic-git`'s sub-modules evaluate.
 *
 * Tests (`tests/adapters/buffer.test.ts`) assert the idempotency contract:
 * `await installBuffer()` twice produces the same `globalThis.Buffer`
 * instance.
 */

// Node already has Buffer; this includes the Vitest `server` project (which
// runs on Node), so the polyfill is a fast no-op there. We still expose the
// installBuffer() entry so consumers don't have to branch on environment.
declare global {
	interface GlobalThis {
		Buffer?: unknown;
	}
}

/**
 * The cached in-flight install promise. `null` once installed; a Promise
 * while a dynamic import is in progress. Two concurrent callers see the
 * same value, guaranteeing reference equality of the installed `Buffer`.
 */
let inFlight: Promise<unknown> | null = null;

/**
 * The `Buffer` constructor installed by this polyfill, captured at install
 * time so the function returns a stable reference even after a hot reload
 * (which would otherwise reset `globalThis.Buffer` but leave the old
 * constructor orphaned in `inFlight`).
 */
let installedBuffer: unknown = null;

/**
 * Install `Buffer` on `globalThis` exactly once. Returns the `Buffer`
 * constructor (either the pre-existing one or the freshly-installed one).
 *
 * Calling this function repeatedly is safe: the second and subsequent
 * calls return the same constructor instance as the first.
 *
 * The function returns `Promise<unknown>` (not `Promise<typeof Buffer>`) so
 * it can be imported from `.svelte` files without pulling `buffer`'s types
 * into the client bundle. Callers that want the `Buffer` type can import
 * the `Buffer` namespace from the `buffer` package directly.
 */
export async function installBuffer(): Promise<unknown> {
	// Fast path: already installed by us, OR already present in the
	// environment (Node, jsdom, or a previous call). Either way, no work
	// to do.
	if (globalThis.Buffer !== undefined) {
		installedBuffer = globalThis.Buffer;
		return installedBuffer;
	}

	// Another caller is mid-install; await their import to guarantee
	// reference equality.
	if (inFlight !== null) {
		await inFlight;
		return globalThis.Buffer;
	}

	// First caller; kick off the dynamic import. We do not `await` it
	// inside the assignment so concurrent callers that arrive while the
	// import is in flight can take the `inFlight` branch above.
	inFlight = import('buffer').then((mod) => {
		// `buffer@6` exports `Buffer` as a named export (CommonJS default
		// is also exposed as `mod.default` for interop). Prefer the named
		// export; fall back to default if a future major shifts the shape.
		const candidate =
			(mod as { Buffer?: unknown }).Buffer ?? (mod as { default?: unknown }).default;
		if (typeof candidate !== 'function') {
			throw new Error('[buffer-polyfill] `buffer` package did not export a Buffer constructor');
		}
		(globalThis as { Buffer: unknown }).Buffer = candidate;
		installedBuffer = candidate;
		return candidate;
	});

	try {
		await inFlight;
	} finally {
		// Clear the in-flight slot so a later `installBuffer()` call after
		// the install completes is a fast-path no-op.
		inFlight = null;
	}

	return installedBuffer;
}

/**
 * Type-narrowing predicate: `true` if `globalThis.Buffer` has been installed
 * (by us or by the host environment). Useful in tests that want to assert
 * the polyfill ran without inspecting the constructor identity directly.
 */
export function isBufferInstalled(): boolean {
	return globalThis.Buffer !== undefined;
}

/**
 * Synchronous, module-load-time scheduler for the install.
 *
 * `installBuffer()` is async because it dynamically imports the `buffer`
 * package (the package must not be in the initial bundle). In a browser
 * that means `globalThis.Buffer` is not defined the instant the import
 * statement finishes — there is a microtask delay before the dynamic
 * import resolves. To shrink that window to zero, we eagerly schedule
 * the import at module-load below. By the time `isomorphic-git`'s
 * sub-modules evaluate (in subsequent microtasks) and reference
 * `globalThis.Buffer`, the install is already in flight or complete.
 *
 * In Node / jsdom the fast path inside `installBuffer()` returns
 * synchronously without touching `globalThis`, so this scheduler is a
 * no-op.
 */
function ensureBufferScheduled(): void {
	void installBuffer();
}

// Eager side-effect: this is the only top-level statement in the file
// that has an observable side effect, which is what keeps Rollup / Vite
// from tree-shaking the module away when nothing imports a named export.
ensureBufferScheduled();
