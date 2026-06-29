/**
 * Tests for the state-layer foundation: `errors.ts` and `_context.ts`.
 *
 * Coverage targets:
 *  - StateError carries the `kind` discriminator and is `instanceof Error`.
 *  - assertBrowser() throws StateError('not-in-browser') in a non-browser
 *    context and does not throw when `window` is defined.
 *  - createStateContext returns the adapter; signal is optional.
 */

// removed in t1-state-types-layout — see git history: StoreNotReadyError
// removed in t1-state-types-layout — see git history: ConcurrentSaveError
// removed in t1-state-types-layout — see git history: debouncedSave / DebouncedSave

import { describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { assertBrowser, createStateContext, StateError } from '$lib/state';

describe('StateError — base class', () => {
	it('is an Error subclass and carries the kind discriminator', () => {
		const e = new StateError('not-in-browser', 'boom');
		expect(e).toBeInstanceOf(Error);
		expect(e).toBeInstanceOf(StateError);
		expect(e.kind).toBe('not-in-browser');
		expect(e.name).toBe('StateError');
		expect(e.message).toBe('boom');
	});

	it('preserves the cause option', () => {
		const cause = new Error('root');
		const e = new StateError('internal', 'wrap', { cause });
		expect(e.cause).toBe(cause);
	});
});

describe('assertBrowser', () => {
	it('throws StateError("not-in-browser") when window is undefined', () => {
		const original = (globalThis as { window?: unknown }).window;
		delete (globalThis as { window?: unknown }).window;
		try {
			let caught: unknown;
			try {
				assertBrowser();
			} catch (e) {
				caught = e;
			}
			expect(caught).toBeInstanceOf(StateError);
			expect((caught as StateError).kind).toBe('not-in-browser');
		} finally {
			(globalThis as { window?: unknown }).window = original;
		}
	});

	it('does not throw when window is defined', () => {
		(globalThis as { window?: unknown }).window = globalThis;
		expect(() => assertBrowser()).not.toThrow();
	});
});

describe('createStateContext', () => {
	it('returns a context with the given adapter and no signal', () => {
		const adapter = new MemoryFsAdapter();
		const ctx = createStateContext(adapter);
		expect(ctx.adapter).toBe(adapter);
		expect(ctx.signal).toBeUndefined();
	});

	it('passes through the signal when provided', () => {
		const adapter = new MemoryFsAdapter();
		const controller = new AbortController();
		const ctx = createStateContext(adapter, controller.signal);
		expect(ctx.adapter).toBe(adapter);
		expect(ctx.signal).toBe(controller.signal);
	});

	it('does not include signal when omitted (no extra key)', () => {
		const adapter = new MemoryFsAdapter();
		const ctx = createStateContext(adapter);
		expect('signal' in ctx).toBe(false);
	});
});
