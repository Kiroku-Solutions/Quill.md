/**
 * Tests for `feature-detect`.
 *
 * Run in Vitest's `server` project (Node env), where `window` is undefined by
 * default. Each test mutates `globalThis.window` to simulate a browser and
 * restores it via `afterEach`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getBrowserCapabilities,
	isFsaAvailable,
	isIndexedDBAvailable,
	isWebCryptoAvailable,
	isAdapterError,
	isFsaPermissionError,
	isNotFoundError,
	isRemoteError
} from '$lib/adapters/feature-detect';
import {
	FsaUnavailableError,
	FsaPermissionError,
	AdapterNotFoundError,
	AdapterValidationError,
	RemoteFetchError,
	RemoteAuthError,
	RenderError
} from '$lib/adapters/errors';

type BrowserWindow = {
	showDirectoryPicker?: () => Promise<unknown>;
	FileSystemDirectoryHandle?: unknown;
	FileSystemFileHandle?: unknown;
	indexedDB?: unknown;
};

function mockWindow(overrides: BrowserWindow = {}): void {
	(globalThis as { window: BrowserWindow }).window = {
		showDirectoryPicker: () => Promise.resolve({}),
		FileSystemDirectoryHandle: class {},
		FileSystemFileHandle: class {},
		indexedDB: {},
		...overrides
	};
}

function clearWindow(): void {
	delete (globalThis as { window?: unknown }).window;
}

describe('feature-detect', () => {
	let originalWindow: unknown;
	let originalCrypto: unknown;

	beforeEach(() => {
		originalWindow = (globalThis as { window?: unknown }).window;
		originalCrypto = (globalThis as { crypto?: unknown }).crypto;
	});

	afterEach(() => {
		if (typeof originalWindow === 'undefined') {
			clearWindow();
		} else {
			(globalThis as { window: unknown }).window = originalWindow;
		}
		if (typeof originalCrypto === 'undefined') {
			delete (globalThis as { crypto?: unknown }).crypto;
		} else {
			(globalThis as { crypto: unknown }).crypto = originalCrypto;
		}
	});

	describe('SSR (no window, no crypto)', () => {
		beforeEach(() => {
			clearWindow();
			delete (globalThis as { crypto?: unknown }).crypto;
		});

		it('getBrowserCapabilities returns all-false', () => {
			expect(getBrowserCapabilities()).toEqual({
				fsa: false,
				indexedDB: false,
				webCrypto: false
			});
		});

		it('isFsaAvailable is false', () => {
			expect(isFsaAvailable()).toBe(false);
		});

		it('isIndexedDBAvailable is false', () => {
			expect(isIndexedDBAvailable()).toBe(false);
		});

		it('isWebCryptoAvailable is false', () => {
			expect(isWebCryptoAvailable()).toBe(false);
		});
	});

	describe('full browser', () => {
		beforeEach(() => {
			mockWindow();
			(globalThis as { crypto: { subtle: unknown } }).crypto = { subtle: {} };
		});

		it('getBrowserCapabilities returns all-true', () => {
			expect(getBrowserCapabilities()).toEqual({
				fsa: true,
				indexedDB: true,
				webCrypto: true
			});
		});

		it('isFsaAvailable is true', () => {
			expect(isFsaAvailable()).toBe(true);
		});

		it('isIndexedDBAvailable is true', () => {
			expect(isIndexedDBAvailable()).toBe(true);
		});

		it('isWebCryptoAvailable is true', () => {
			expect(isWebCryptoAvailable()).toBe(true);
		});
	});

	describe('partial FSA support', () => {
		beforeEach(() => {
			(globalThis as { crypto: { subtle: unknown } }).crypto = { subtle: {} };
		});

		it('fsa is false when showDirectoryPicker is missing', () => {
			mockWindow({ showDirectoryPicker: undefined });
			expect(isFsaAvailable()).toBe(false);
		});

		it('fsa is false when FileSystemDirectoryHandle is missing', () => {
			mockWindow({ FileSystemDirectoryHandle: undefined });
			expect(isFsaAvailable()).toBe(false);
		});

		it('fsa is false when FileSystemFileHandle is missing', () => {
			mockWindow({ FileSystemFileHandle: undefined });
			expect(isFsaAvailable()).toBe(false);
		});

		it('fsa is false when window.indexedDB is missing but FSA is present', () => {
			mockWindow({ indexedDB: undefined });
			expect(isFsaAvailable()).toBe(true);
			expect(isIndexedDBAvailable()).toBe(false);
		});

		it('indexedDB is false when window.indexedDB is missing', () => {
			mockWindow({ indexedDB: undefined });
			expect(isIndexedDBAvailable()).toBe(false);
		});
	});

	describe('partial Web Crypto support', () => {
		beforeEach(() => {
			mockWindow();
		});

		it('webCrypto is false when globalThis.crypto is missing', () => {
			delete (globalThis as { crypto?: unknown }).crypto;
			expect(isWebCryptoAvailable()).toBe(false);
		});

		it('webCrypto is false when crypto.subtle is missing', () => {
			(globalThis as { crypto: { subtle?: unknown } }).crypto = {};
			expect(isWebCryptoAvailable()).toBe(false);
		});
	});

	describe('type guards', () => {
		describe('isAdapterError', () => {
			it('returns true for any AdapterError subclass', () => {
				expect(isAdapterError(new FsaUnavailableError())).toBe(true);
				expect(isAdapterError(new FsaPermissionError())).toBe(true);
				expect(isAdapterError(new AdapterNotFoundError('/x'))).toBe(true);
				expect(isAdapterError(new RemoteFetchError('boom'))).toBe(true);
			});

			it('returns false for plain Error', () => {
				expect(isAdapterError(new Error('plain'))).toBe(false);
			});

			it('returns false for non-error values', () => {
				expect(isAdapterError('a string')).toBe(false);
				expect(isAdapterError(42)).toBe(false);
				expect(isAdapterError(null)).toBe(false);
				expect(isAdapterError(undefined)).toBe(false);
				expect(isAdapterError({})).toBe(false);
			});
		});

		describe('isFsaPermissionError', () => {
			it('returns true for FsaPermissionError', () => {
				expect(isFsaPermissionError(new FsaPermissionError('folder'))).toBe(true);
			});

			it('returns true when called via narrowed unknown', () => {
				const err: unknown = new FsaPermissionError('folder');
				if (isFsaPermissionError(err)) {
					expect(err.handleName).toBe('folder');
					expect(err.type).toBe('fsa-permission-denied');
				} else {
					throw new Error('expected to narrow');
				}
			});

			it('returns false for sibling AdapterError subclasses', () => {
				expect(isFsaPermissionError(new FsaUnavailableError())).toBe(false);
				expect(isFsaPermissionError(new AdapterNotFoundError('/x'))).toBe(false);
				expect(isFsaPermissionError(new AdapterValidationError('bad'))).toBe(false);
			});

			it('returns false for non-error values', () => {
				expect(isFsaPermissionError('x')).toBe(false);
				expect(isFsaPermissionError(0)).toBe(false);
				expect(isFsaPermissionError(null)).toBe(false);
				expect(isFsaPermissionError(undefined)).toBe(false);
			});
		});

		describe('isNotFoundError', () => {
			it('returns true for AdapterNotFoundError', () => {
				expect(isNotFoundError(new AdapterNotFoundError('/x'))).toBe(true);
			});

			it('narrowing exposes the path', () => {
				const err: unknown = new AdapterNotFoundError('/missing.md');
				if (isNotFoundError(err)) {
					expect(err.path).toBe('/missing.md');
				} else {
					throw new Error('expected to narrow');
				}
			});

			it('returns false for other AdapterError subclasses', () => {
				expect(isNotFoundError(new FsaPermissionError())).toBe(false);
				expect(isNotFoundError(new RenderError('x'))).toBe(false);
			});

			it('returns false for non-error values', () => {
				expect(isNotFoundError('x')).toBe(false);
				expect(isNotFoundError(1)).toBe(false);
				expect(isNotFoundError(null)).toBe(false);
				expect(isNotFoundError(undefined)).toBe(false);
			});
		});

		describe('isRemoteError', () => {
			it('returns true for RemoteFetchError', () => {
				expect(isRemoteError(new RemoteFetchError('timeout'))).toBe(true);
			});

			it('returns true for RemoteAuthError', () => {
				expect(isRemoteError(new RemoteAuthError())).toBe(true);
			});

			it('narrows to the union type', () => {
				const err: unknown = new RemoteFetchError('timeout', { status: 500 });
				if (isRemoteError(err)) {
					expect(err.type).toBe('remote-fetch');
				} else {
					throw new Error('expected to narrow');
				}
			});

			it('narrows for auth case', () => {
				const err: unknown = new RemoteAuthError();
				if (isRemoteError(err)) {
					expect(err.type).toBe('remote-auth');
				} else {
					throw new Error('expected to narrow');
				}
			});

			it('returns false for non-remote AdapterError subclasses', () => {
				expect(isRemoteError(new FsaUnavailableError())).toBe(false);
				expect(isRemoteError(new AdapterNotFoundError('/x'))).toBe(false);
				expect(isRemoteError(new RenderError('x'))).toBe(false);
			});

			it('returns false for non-error values', () => {
				expect(isRemoteError('x')).toBe(false);
				expect(isRemoteError(1)).toBe(false);
				expect(isRemoteError(null)).toBe(false);
				expect(isRemoteError(undefined)).toBe(false);
			});

			it('AdapterError is the parent of both remote classes', () => {
				const f = new RemoteFetchError('x');
				const a = new RemoteAuthError();
				expect(isAdapterError(f)).toBe(true);
				expect(isAdapterError(a)).toBe(true);
			});
		});
	});
});
