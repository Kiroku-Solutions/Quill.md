/**
 * Browser feature detection and adapter-error type guards.
 *
 * ERS coverage:
 *  - NFR-5 (browser support matrix)
 *  - C-3   (Local Edit Mode is Chromium-only)
 *  - C-4   (permission re-grant flows)
 *
 * All checks are defensive against SSR / Node test environments where
 * `window` and `globalThis.crypto` are absent.
 */

import {
	AdapterError,
	FsaPermissionError,
	AdapterNotFoundError,
	RemoteFetchError,
	RemoteAuthError,
	RemoteConflictError,
	RemoteBranchMissingError,
	RemoteCommitRejectedError,
	RemoteUnsupportedHostError
} from './errors.ts';

/** Names of `window` members that gate File System Access support. */
const FSA_WINDOW_KEYS = [
	'showDirectoryPicker',
	'FileSystemDirectoryHandle',
	'FileSystemFileHandle'
] as const;

/** Capability snapshot for the current runtime. */
export interface BrowserCapabilities {
	readonly fsa: boolean;
	readonly indexedDB: boolean;
	readonly webCrypto: boolean;
}

/** Default capability snapshot used when `window` is unavailable (SSR). */
const SSR_CAPABILITIES = {
	fsa: false,
	indexedDB: false,
	webCrypto: false
} as const satisfies BrowserCapabilities;

/**
 * Snapshot the browser capabilities relevant to the adapter layer.
 *
 * Returns `{ fsa: false, indexedDB: false, webCrypto: false }` when called in
 * a non-browser environment (SSR, Vitest `server` project, etc.).
 */
export function getBrowserCapabilities(): BrowserCapabilities {
	if (typeof window === 'undefined') {
		return SSR_CAPABILITIES;
	}

	const w = window as unknown as Record<string, unknown>;
	// We use `typeof !== 'undefined'` rather than `key in w` because tests
	// (and some real-world polyfills) set the property explicitly to
	// `undefined` to mean "absent". `in` would still report presence.
	const fsa = FSA_WINDOW_KEYS.every((key) => typeof w[key] !== 'undefined');

	const idb = typeof w['indexedDB'] !== 'undefined';

	const crypto = (globalThis as { crypto?: { subtle?: unknown } }).crypto;
	const webCrypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

	return { fsa, indexedDB: idb, webCrypto };
}

/** `true` iff the File System Access API surface is fully available. */
export function isFsaAvailable(): boolean {
	return getBrowserCapabilities().fsa;
}

/** `true` iff `window.indexedDB` (or `globalThis.indexedDB`) exists. */
export function isIndexedDBAvailable(): boolean {
	return getBrowserCapabilities().indexedDB;
}

/** `true` iff Web Crypto (`globalThis.crypto.subtle`) is available. */
export function isWebCryptoAvailable(): boolean {
	return getBrowserCapabilities().webCrypto;
}

/** Narrows an unknown value to the shared `AdapterError` base. */
export function isAdapterError(err: unknown): err is AdapterError {
	return err instanceof AdapterError;
}

/** Narrows an unknown value to `FsaPermissionError`. */
export function isFsaPermissionError(err: unknown): err is FsaPermissionError {
	return err instanceof FsaPermissionError;
}

/** Narrows an unknown value to `AdapterNotFoundError`. */
export function isNotFoundError(err: unknown): err is AdapterNotFoundError {
	return err instanceof AdapterNotFoundError;
}

/** Narrows an unknown value to either remote-mode error class. */
export function isRemoteError(err: unknown): err is RemoteFetchError | RemoteAuthError {
	return err instanceof RemoteFetchError || err instanceof RemoteAuthError;
}

/** Narrows an unknown value to any remote error class. */
export function isAnyRemoteError(
	err: unknown
): err is
	| RemoteFetchError
	| RemoteAuthError
	| RemoteConflictError
	| RemoteBranchMissingError
	| RemoteCommitRejectedError
	| RemoteUnsupportedHostError {
	return (
		err instanceof RemoteFetchError ||
		err instanceof RemoteAuthError ||
		err instanceof RemoteConflictError ||
		err instanceof RemoteBranchMissingError ||
		err instanceof RemoteCommitRejectedError ||
		err instanceof RemoteUnsupportedHostError
	);
}

/** Narrows an unknown value to `RemoteConflictError`. */
export function isRemoteConflictError(err: unknown): err is RemoteConflictError {
	return err instanceof RemoteConflictError;
}
