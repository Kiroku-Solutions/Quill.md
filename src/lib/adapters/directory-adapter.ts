/**
 * The minimal filesystem contract the service layer needs.
 *
 * Both the FSA-backed implementation (step 4) and the in-memory test mock
 * implement this interface. Paths are POSIX-style and relative to the adapter
 * root, e.g. `.agnostic-issuer/config.json`.
 *
 * The service layer treats the adapter as opaque: it never sees a
 * `FileSystemDirectoryHandle` or any other browser-specific type.
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

/** Normalize separators and collapse redundant slashes; preserves leading `.`. */
export function normalizePath(path: string): string {
	const parts: string[] = [];
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') parts.pop();
		else parts.push(segment);
	}
	return parts.join('/') || '.';
}
