/**
 * The minimal filesystem contract the service layer needs.
 *
 * Split into two interfaces so the type system can enforce the read-only /
 * read-write distinction at every consumer:
 *
 *  - {@link ReadOnlyDirectoryAdapter} — used by Remote Read-Only Mode and by
 *    any read-only consumer (Kanban / List / Gantt views read from this).
 *  - {@link WritableDirectoryAdapter} — extends the read-only surface with
 *    the three mutating verbs needed by Local Edit Mode.
 *  - {@link DirectoryAdapter} — the original unified interface, kept as a
 *    type alias for `WritableDirectoryAdapter` so existing service code that
 *    does not yet discriminate continues to compile.
 *
 * Both the FSA-backed implementation (step 4) and the in-memory test mock
 * implement the writable surface. The remote (`isomorphic-git` + LightningFS)
 * adapter implements only the read-only surface — Remote Mode never writes
 * (ERS C-2).
 *
 * Paths are POSIX-style and relative to the adapter root, e.g.
 * `.nomad.md/config.json`. The service layer treats the adapter as opaque:
 * it never sees a `FileSystemDirectoryHandle` or any other browser-specific
 * type.
 *
 * ## Contract
 *
 * **Path semantics.** All paths are interpreted relative to the adapter root.
 * There is no concept of "parent of root": `..` segments collapse against the
 * last non-`..` segment (see {@link normalizePath}) and cannot escape the
 * root. Leading `/` is dropped. Empty paths are equivalent to `.`.
 *
 * **Character set.** Paths must not contain ASCII control characters
 * (`U+0000` … `U+001F`, `U+007F`). Unicode above U+007F is permitted.
 *
 * **Root path.** `.` (or any path that normalises to `.`) is reserved and
 * may not be passed to mutating operations. Use `listDirectory('.')` to read
 * the root listing.
 *
 * **File vs directory.** Each adapter maintains separate tracking for files
 * and directories. Calling `writeTextFile` on a path that already names a
 * directory is an error, and vice versa for `removeFile` on a directory.
 *
 * **Atomicity.** `writeTextFile` and `moveFile` either fully complete or
 * leave the filesystem unchanged from the caller's perspective. Mid-operation
 * state (temp keys, half-finished parent directories) is never observable
 * through the public API.
 *
 * **Concurrency.** Adapters are **not safe for concurrent calls** on
 * overlapping paths. JavaScript is single-threaded, but `await` boundaries
 * inside `moveFile` and `writeTextFile` allow other async tasks to observe
 * intermediate state. The service layer is expected to serialise access.
 *
 * **Self-move.** `moveFile(x, x)` is a no-op. POSIX `rename(a, a)` returns
 * success without touching the file; adapters honour that contract.
 *
 * **Error model.** All adapter-layer errors are subclasses of
 * `AdapterError` (see `./errors.ts`). Service-layer code should use
 * `instanceof` (or the type guards in `feature-detect.ts`) to narrow.
 */
export interface DirectoryEntry {
	name: string;
	kind: 'file' | 'directory';
}

/**
 * Read-only filesystem surface. Implemented by every adapter, including the
 * remote adapter (which implements ONLY this interface — Remote Mode is
 * strictly read-only per ERS C-2).
 */
export interface ReadOnlyDirectoryAdapter {
	readTextFile(path: string): Promise<string>;
	listDirectory(path: string): Promise<DirectoryEntry[]>;
}

/**
 * Writable filesystem surface. Implemented by `MemoryFsAdapter` (tests) and
 * `LocalFsAdapter` (FSA). NOT implemented by the remote adapter.
 */
export interface WritableDirectoryAdapter extends ReadOnlyDirectoryAdapter {
	writeTextFile(path: string, contents: string): Promise<void>;
	removeFile(path: string): Promise<void>;
	moveFile(from: string, to: string): Promise<void>;
}

/**
 * Backwards-compatible alias. New code should prefer
 * {@link WritableDirectoryAdapter} when it actually mutates and
 * {@link ReadOnlyDirectoryAdapter} when it doesn't — the split is what makes
 * the remote adapter's read-only contract a compile-time fact, not a cast.
 */
export type DirectoryAdapter = WritableDirectoryAdapter;

/**
 * Normalize a relative POSIX path into its parent directory and the leaf name.
 * Returns `['.']` for paths without a separator.
 */
export function splitPath(path: string): { parent: string; name: string } {
	const idx = path.lastIndexOf('/');
	if (idx < 0) return { parent: '.', name: path };
	return { parent: path.slice(0, idx) || '.', name: path.slice(idx + 1) };
}

/**
 * Reject path strings that contain ASCII control characters (NUL, tab,
 * newline, CR, DEL, …). These characters break log aggregation, can confuse
 * downstream string handling, and are the typical injection vector for path
 * attacks (e.g. embedded `\0` to truncate paths in C-style consumers).
 *
 * Note: only the C0 (`\x00-\x1f`) and DEL (`\x7f`) ranges are rejected.
 * Higher code points (`\x80+`) are left alone because they are valid
 * second/third bytes in UTF-8 multi-byte sequences — rejecting them would
 * block legitimate Unicode filenames.
 */
export function assertNoControlChars(path: string): void {
	/* eslint-disable no-control-regex --
	   Intentional: we want to reject these characters in user-supplied paths. */
	const controlCharPattern = /[\x00-\x1f\x7f]/;
	if (controlCharPattern.test(path)) {
		throw new Error(`Path contains a control character: ${JSON.stringify(path)}`);
	}
}

/** Normalize separators and collapse redundant slashes; preserves leading `.`. */
export function normalizePath(path: string): string {
	assertNoControlChars(path);
	const parts: string[] = [];
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') parts.pop();
		else parts.push(segment);
	}
	return parts.join('/') || '.';
}
