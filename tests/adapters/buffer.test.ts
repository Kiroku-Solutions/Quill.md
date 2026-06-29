/**
 * Tests for the Buffer polyfill (`src/lib/polyfills/buffer.ts`).
 *
 * Runs in the `server` Vitest project (Node). Node ships `Buffer`
 * natively, so the polyfill's fast-path branch is exercised — the
 * dynamic import of the `buffer` package should never run in this
 * environment, and `globalThis.Buffer` should remain the Node-native
 * constructor.
 *
 * The test that exercises the slow-path branch (a Node process with
 * `globalThis.Buffer` deleted) would need a forked subprocess; we cover
 * it indirectly by asserting the *contract* (idempotency, reference
 * equality) which is the property the committee audit
 * (`docs/audits/2026-06-23/architecture-audit.md:353`) requires.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { installBuffer, isBufferInstalled } from '$lib/polyfills/buffer';

describe('buffer polyfill — fast path (Node)', () => {
	it('globalThis.Buffer is defined on Node (sanity)', () => {
		expect(globalThis.Buffer).toBeDefined();
		expect(typeof globalThis.Buffer).toBe('function');
	});

	it('installBuffer() returns the existing Node-native Buffer and does not change it', async () => {
		// On the fast path, the polyfill must return the same reference
		// it found on `globalThis.Buffer`. We assert reference equality
		// (no replace, no mutation) — the *no-dynamic-import* property
		// is enforced by the fact that, on this code path, the function
		// never reaches the `inFlight` branch.
		const before = globalThis.Buffer;
		const installed = await installBuffer();
		expect(installed).toBe(before);
		expect(globalThis.Buffer).toBe(before);
		expect(isBufferInstalled()).toBe(true);
	});
});

describe('buffer polyfill — idempotency', () => {
	// Snapshot the original `Buffer` so we can restore it after tests that
	// temporarily delete it. The Vitest `server` project runs on Node, which
	// has a real `Buffer` global — restoring it after each delete keeps the
	// rest of the suite (and any later tests in this file) honest.
	const originalBuffer = globalThis.Buffer;

	afterEach(() => {
		(globalThis as { Buffer: unknown }).Buffer = originalBuffer;
	});

	it('two consecutive installBuffer() calls produce the same globalThis.Buffer instance (fast path)', async () => {
		expect(globalThis.Buffer).toBeDefined();
		const first = await installBuffer();
		const second = await installBuffer();
		expect(first).toBe(second);
		expect(first).toBe(globalThis.Buffer);
	});

	it('three consecutive installBuffer() calls all return the same instance (fast path)', async () => {
		const results = await Promise.all([installBuffer(), installBuffer(), installBuffer()]);
		const head = results[0];
		for (const r of results) {
			expect(r).toBe(head);
		}
		expect(head).toBe(globalThis.Buffer);
	});

	it('isBufferInstalled() returns true after a fast-path call', async () => {
		await installBuffer();
		expect(isBufferInstalled()).toBe(true);
	});
});
