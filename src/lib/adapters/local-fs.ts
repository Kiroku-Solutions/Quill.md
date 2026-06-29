/**
 * FSA-backed implementation of {@link DirectoryAdapter} for Local Edit Mode.
 *
 * Wraps the browser File System Access API (FSA) around a
 * `FileSystemDirectoryHandle`. The handle is supplied by the caller (typically
 * obtained via {@link pick} or restored from {@link handleStore}).
 *
 * ## Atomicity (NFR-7)
 *
 * `writeTextFile` uses the temp-file + move pattern:
 * 1. Write to `.tmp-<uuid>` (createWritable)
 * 2. `directoryHandle.move(temp, final)` — atomic rename on POSIX + Windows
 * 3. On any failure: remove the temp file, then propagate
 *
 * The original file is never modified until the move succeeds.
 *
 * ## Permission model (C-4)
 *
 * Every mutating operation calls `verifyPermission()` first. If the state
 * is not `'granted'`, a `FsaPermissionError` is thrown so the caller can
 * trigger a re-prompt.
 *
 * ## Path semantics
 *
 * All paths are relative to the adapter root and interpreted as POSIX paths.
 * They are normalised via `normalizePath` before use — no `..` segment
 * can escape the root.
 *
 * ## Error mapping
 *
 * | FSA DOMException.name | AdapterError subclass            |
 * | --------------------- | --------------------------------- |
 * | `NotAllowedError`     | `FsaPermissionError`              |
 * | `NotFoundError`       | `AdapterNotFoundError`            |
 * | `AbortError`          | `FsaPermissionError` (cancelled)  |
 *
 * ERS coverage: FR-4 (Local CRUD), NFR-7 (atomicity, rollback), C-3 (FSA
 * availability), C-4 (permission re-grant), ERS §5.5 (handle lifecycle).
 */
import {
	normalizePath,
	splitPath,
	assertNoControlChars,
	type DirectoryAdapter
} from './directory-adapter.ts';
import type { DirectoryEntry } from './directory-adapter.ts';
import {
	AdapterNotFoundError,
	AdapterValidationError,
	FsaPermissionError,
	FsaUnavailableError
} from './errors.ts';
import { isFsaAvailable } from './feature-detect.ts';

/** Re-export `DirectoryEntry` so callers only need one import. */
export type { DirectoryEntry } from './directory-adapter.ts';

/** Re-export error classes so callers can use them as types without extra imports. */
export type {
	AdapterNotFoundError,
	AdapterValidationError,
	FsaPermissionError,
	FsaUnavailableError
} from './errors.ts';

/** Maximum allowed file size in UTF-16 code units (10 MiB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export class LocalFsAdapter implements DirectoryAdapter {
	// ---------------------------------------------------------------------------
	// Construction
	// ---------------------------------------------------------------------------

	/** Constructor — also exposed via {@link LocalFsAdapter.pick} for the picker UX. */
	constructor(private readonly handle: FileSystemDirectoryHandle) {}

	/**
	 * Read-only access to the wrapped handle. Required so the picker UX
	 * (which calls {@link LocalFsAdapter.pick}) can hand the handle to
	 * the mode store's `openLocalFolder` after a successful pick, where
	 * the store's adapter factory re-wraps it via `createLocalAdapter`.
	 * The handle is browser-managed; we never mutate it.
	 */
	get directoryHandle(): FileSystemDirectoryHandle {
		return this.handle;
	}

	/**
	 * Bind a pre-acquired `FileSystemDirectoryHandle` to a new
	 * `LocalFsAdapter`. Used by the mode store to wire a handle that
	 * `bootstrap()` restored from IndexedDB into the same adapter shape
	 * that `pick()` would return.
	 */
	static fromHandle(handle: FileSystemDirectoryHandle): LocalFsAdapter {
		return new LocalFsAdapter(handle);
	}

	/**
	 * Open the native directory picker and return a `LocalFsAdapter`
	 * wrapping the selected folder.
	 *
	 * @throws FsaUnavailableError  if FSA is not available in this browser.
	 * @throws FsaPermissionError   if the user cancels or denies permission.
	 */
	static async pick(): Promise<LocalFsAdapter> {
		if (!isFsaAvailable()) {
			throw new FsaUnavailableError();
		}

		let handle: FileSystemDirectoryHandle;
		try {
			// The `id` lets the browser remember the user's choice per origin,
			// so subsequent calls skip the picker and re-request permission.
			handle = await window.showDirectoryPicker({
				id: 'nomad-md-folder',
				mode: 'readwrite'
			});
		} catch (cause) {
			if (
				cause instanceof DOMException &&
				(cause.name === 'AbortError' || cause.name === 'NotAllowedError')
			) {
				throw new FsaPermissionError(undefined, cause);
			}
			throw cause;
		}

		return new LocalFsAdapter(handle);
	}

	// ---------------------------------------------------------------------------
	// Permission management (ERS §5.5, C-4)
	// ---------------------------------------------------------------------------

	/**
	 * Query the current read-write permission state for this folder handle.
	 *
	 * Returns `'granted'`, `'denied'`, or `'prompt'` (meaning the browser will
	 * show a permission prompt on the next write).
	 */
	async verifyPermission(): Promise<PermissionState> {
		return this.handle.queryPermission({ mode: 'readwrite' }) as Promise<PermissionState>;
	}

	/**
	 * Explicitly request read-write permission, showing the browser's
	 * permission prompt if the state is `'prompt'`.
	 *
	 * Returns `'granted'` on success, `'denied'` on refusal.
	 * Throws `FsaPermissionError` on `AbortError`.
	 */
	async requestPermission(): Promise<PermissionState> {
		try {
			return await this.handle.requestPermission({ mode: 'readwrite' });
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') {
				throw new FsaPermissionError(this.handle.name, cause);
			}
			throw cause;
		}
	}

	// ---------------------------------------------------------------------------
	// DirectoryAdapter contract
	// ---------------------------------------------------------------------------

	async readTextFile(path: string): Promise<string> {
		const normalized = requireNonEmpty(path);
		this.assertNotRoot(normalized);
		await this.requirePermission();

		const { parent, name } = splitPath(normalized);
		const parentHandle = await this.resolveDirectoryHandle(parent, false);

		let fileHandle: FileSystemFileHandle;
		try {
			fileHandle = await parentHandle.getFileHandle(name);
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotFoundError') {
				throw new AdapterNotFoundError(normalized, cause);
			}
			throw cause;
		}

		let file: File;
		try {
			file = await fileHandle.getFile();
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				throw new FsaPermissionError(this.handle.name, cause);
			}
			throw cause;
		}

		return file.text();
	}

	async writeTextFile(path: string, contents: string): Promise<void> {
		const normalized = requireNonEmpty(path);
		this.assertNotRoot(normalized);
		await this.requirePermission();

		// NFR-7 hardening: reject write if the path already exists as a directory.
		try {
			await this.resolveDirectoryHandle(normalized, false);
			// resolveDirectoryHandle succeeded without error → path is a directory.
			throw new AdapterValidationError(
				`Cannot write to a path that is an existing directory: "${normalized}"`,
				{ path: normalized }
			);
		} catch (cause) {
			// Re-throw our explicit validation error.
			if (cause instanceof AdapterValidationError) throw cause;
			// It threw (path doesn't exist as a dir) — proceed.
		}

		// maxFileSize check: reject oversized content before any mutation.
		if (contents.length > MAX_FILE_SIZE) {
			throw new AdapterValidationError(
				`File contents exceed the per-file limit (${contents.length} > ${MAX_FILE_SIZE} UTF-16 code units)`,
				{ path: normalized }
			);
		}

		const { parent, name } = splitPath(normalized);
		const parentHandle = await this.resolveDirectoryHandle(parent, true);
		const tempName = `.tmp-${globalThis.crypto.randomUUID()}`;

		let tempHandle: FileSystemFileHandle | undefined;
		try {
			tempHandle = await parentHandle.getFileHandle(tempName, { create: true });

			const writable = await tempHandle.createWritable();
			try {
				await writable.write(contents);
				await writable.close();
			} catch (cause) {
				await writable.abort();
				throw cause;
			}

			// Atomic rename: temp → final name.
			// On POSIX rename(2) is atomic; on Windows MoveFileEx is atomic for
			// same-volume moves. NFR-7: no partial state observable.
			await parentHandle.move(tempName, name);
		} catch (cause) {
			// Best-effort cleanup of the temp file; original is untouched.
			if (tempHandle !== undefined) {
				try {
					await parentHandle.removeEntry(tempName);
				} catch {
					// Ignore cleanup failures.
				}
			}

			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				throw new FsaPermissionError(this.handle.name, cause);
			}
			if (cause instanceof DOMException && cause.name === 'NotFoundError') {
				throw new AdapterNotFoundError(normalized, cause);
			}
			throw cause;
		}
	}

	async listDirectory(path: string): Promise<DirectoryEntry[]> {
		requireNonEmpty(path);
		const normalized = normalizePath(path);

		const dirHandle = await this.resolveDirectoryMaybeCreate(normalized);
		if (!dirHandle) return [];

		const entries: DirectoryEntry[] = [];
		for await (const [name, handle] of dirHandle.entries()) {
			entries.push({
				name,
				kind: handle.kind === 'file' ? 'file' : 'directory'
			});
		}
		return entries;
	}

	async removeFile(path: string): Promise<void> {
		const normalized = requireNonEmpty(path);
		this.assertNotRoot(normalized);
		await this.requirePermission();

		const { parent, name } = splitPath(normalized);
		const parentHandle = await this.resolveDirectoryHandle(parent, false);

		try {
			await parentHandle.removeEntry(name);
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'NotFoundError') {
				throw new AdapterNotFoundError(normalized, cause);
			}
			if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
				throw new FsaPermissionError(this.handle.name, cause);
			}
			throw cause;
		}
	}

	async moveFile(from: string, to: string): Promise<void> {
		const fromNormalized = requireNonEmpty(from);
		const toNormalized = requireNonEmpty(to);

		// Self-move is a no-op — matches POSIX rename(a, a) semantics.
		if (fromNormalized === toNormalized) return;

		this.assertNotRoot(fromNormalized);
		this.assertNotRoot(toNormalized);

		const fromSplit = splitPath(fromNormalized);
		const toSplit = splitPath(toNormalized);

		if (fromSplit.parent === toSplit.parent) {
			// Same parent: DirectoryHandle.move is atomic within a directory.
			await this.requirePermission();
			const parent = await this.resolveDirectoryHandle(fromSplit.parent, false);
			try {
				await parent.move(fromSplit.name, toSplit.name);
			} catch (cause) {
				if (cause instanceof DOMException && cause.name === 'NotFoundError') {
					throw new AdapterNotFoundError(fromNormalized, cause);
				}
				throw cause;
			}
		} else {
			// Different parent: read + write + remove. Not atomic across directories.
			const content = await this.readTextFile(fromNormalized);
			await this.writeTextFile(toNormalized, content);
			await this.removeFile(fromNormalized);
		}
	}

	// ---------------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------------

	/**
	 * Ensure we have readwrite permission, throwing `FsaPermissionError`
	 * if the state is not `'granted'`.
	 */
	private async requirePermission(): Promise<void> {
		const state = await this.verifyPermission();
		if (state !== 'granted') {
			throw new FsaPermissionError(this.handle.name);
		}
	}

	private assertNotRoot(path: string): void {
		if (path === '.') {
			throw new AdapterValidationError('Operation not allowed on the root path "."', { path });
		}
	}

	/**
	 * Walk the path segments from the root handle, optionally creating
	 * intermediate directories.
	 *
	 * Throws `AdapterNotFoundError` if `create` is false and the path
	 * does not exist or resolves to a file (cannot traverse a file as a dir).
	 */
	private async resolveDirectoryHandle(
		path: string,
		create: boolean
	): Promise<FileSystemDirectoryHandle> {
		const normalized = normalizePath(path);
		if (normalized === '.') return this.handle;

		const segments = normalized.split('/');
		let current: FileSystemDirectoryHandle = this.handle;

		for (const segment of segments) {
			try {
				current = await current.getDirectoryHandle(segment, { create });
			} catch (cause) {
				// `getDirectoryHandle` throws TypeError if the entry exists as a file.
				if (cause instanceof TypeError) {
					throw new AdapterNotFoundError(normalized, cause);
				}
				if (cause instanceof DOMException && cause.name === 'NotFoundError') {
					throw new AdapterNotFoundError(normalized, cause);
				}
				throw cause;
			}
		}
		return current;
	}

	/**
	 * Like `resolveDirectoryHandle` but returns `null` instead of throwing when
	 * the directory does not exist. Used by `listDirectory` to distinguish
	 * "empty directory" from "does not exist".
	 */
	private async resolveDirectoryMaybeCreate(
		path: string
	): Promise<FileSystemDirectoryHandle | null> {
		const normalized = normalizePath(path);
		if (normalized === '.') return this.handle;

		const segments = normalized.split('/');
		let current: FileSystemDirectoryHandle = this.handle;

		for (const segment of segments) {
			try {
				current = await current.getDirectoryHandle(segment, { create: true });
			} catch (cause) {
				if (cause instanceof TypeError) return null;
				if (cause instanceof DOMException && cause.name === 'NotFoundError') return null;
				throw cause;
			}
		}
		return current;
	}
}

// ---------------------------------------------------------------------------
// Module-level validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that `path` is a non-empty string without control characters.
 * Returns the normalised path so callers don't need to call normalizePath again.
 *
 * @throws AdapterValidationError  if the path is empty or contains control chars.
 */
function requireNonEmpty(path: string): string {
	if (typeof path !== 'string' || path.length === 0) {
		throw new AdapterValidationError('Path must be a non-empty string');
	}
	assertNoControlChars(path);
	return normalizePath(path);
}
