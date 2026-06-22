/**
 * The minimal filesystem contract the service layer needs.
 *
 * Both the FSA-backed implementation (step 4) and the in-memory test mock
 * implement this interface. Paths are POSIX-style and relative to the adapter
 * root, e.g. `.agnostic-issuer/config.json`.
 *
 * The service layer treats the adapter as opaque: it never sees a
 * `FileSystemDirectoryHandle` or any other browser-specific type.
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

export interface DirectoryAdapter {
	readTextFile(path: string): Promise<string>;
	writeTextFile(path: string, contents: string): Promise<void>;
	listDirectory(path: string): Promise<DirectoryEntry[]>;
	removeFile(path: string): Promise<void>;
	moveFile(from: string, to: string): Promise<void>;
}

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
