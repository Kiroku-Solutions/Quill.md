/**
 * Soft-delete helpers over a {@link DirectoryAdapter}.
 *
 * Files are moved into a reserved `.nomad.md/.trash/` directory with a
 * timestamp + short-UUID prefix so they can be restored or permanently
 * removed.
 *
 * ## Trash filename format
 *
 * A trashed file is stored at:
 * ```
 * .nomad.md/.trash/<timestamp>-<uuid8>-<originalName>
 * ```
 * where `<timestamp> = Date.now()` (Unix ms) and `<uuid8>` is the first
 * 8 hex characters of `crypto.randomUUID()`. The combination is unique
 * even if the same source file is trashed twice within the same
 * millisecond — the timestamp guarantees monotonic ordering, and the
 * UUID guarantees that two trash operations of an identically-named
 * source never overwrite each other. The original filename is preserved
 * at the end so the user can still recognise the issue / file.
 *
 * ## Interaction with the adapter contract
 *
 * `moveToTrash` calls `adapter.moveFile`, so atomicity guarantees are the
 * same as `moveFile` on the underlying adapter (NFR-7 applies to the original
 * `writeTextFile` call, not to trash operations).
 *
 * The trash directory itself is created implicitly — the first file moved to
 * trash triggers creation of `.nomad.md/.trash/`. Both adapter implementations
 * (`MemoryFsAdapter.listDirectory`, `LocalFsAdapter.listDirectory`) return an
 * empty list rather than throwing when the directory does not exist, so
 * `emptyTrash` returns `0` instead of bubbling a `not-found` error.
 *
 * ERS coverage: FR-4 (soft-delete is part of Local CRUD lifecycle).
 */

import { splitPath } from './directory-adapter.ts';
import type { DirectoryAdapter } from './directory-adapter.ts';

/** Reserved directory inside every `.nomad.md/` root. */
export const TRASH_DIRECTORY = '.nomad.md/.trash';

/**
 * Move a file to the trash directory.
 *
 * The destination path is
 * `.nomad.md/.trash/<timestamp>-<uuid8>-<originalName>` — the
 * `<timestamp>` orders entries by trashing time, the `<uuid8>` makes the
 * path unique even when two operations happen in the same millisecond,
 * and `<originalName>` is preserved verbatim so the user can still
 * identify the file in a trash listing.
 *
 * @param adapter - The DirectoryAdapter to operate on.
 * @param sourcePath - Relative path of the file to trash.
 * @returns The trash path the file was moved to.
 * @throws AdapterNotFoundError if the source file does not exist.
 */
export async function moveToTrash(adapter: DirectoryAdapter, sourcePath: string): Promise<string> {
	const { name } = splitPath(sourcePath);

	const timestamp = Date.now();
	// First 8 hex chars of a v4 UUID — 32 bits of entropy is more than
	// enough to guarantee uniqueness within a single millisecond and keeps
	// the trash filename readable. (A full 36-char UUID would make every
	// trashed entry visually noisy in a listing.)
	const uuid8 = globalThis.crypto.randomUUID().split('-')[0] ?? '';
	const trashName = `${timestamp}-${uuid8}-${name}`;
	const trashPath = `${TRASH_DIRECTORY}/${trashName}`;

	await adapter.moveFile(sourcePath, trashPath);

	return trashPath;
}

/**
 * Permanently remove every file currently inside the trash directory.
 *
 * Subdirectories inside the trash directory are preserved (not recursed
 * into, not removed) — only leaf files are deleted. This is a hardening
 * choice: if some other component writes a subdirectory into trash by
 * mistake, `emptyTrash` will not blow it away.
 *
 * @param adapter - The DirectoryAdapter to operate on.
 * @returns The number of files removed. Returns `0` when the trash
 *   directory does not exist or contains no files.
 */
export async function emptyTrash(adapter: DirectoryAdapter): Promise<number> {
	const entries = await adapter.listDirectory(TRASH_DIRECTORY);
	let count = 0;

	for (const entry of entries) {
		if (entry.kind === 'file') {
			const filePath = `${TRASH_DIRECTORY}/${entry.name}`;
			await adapter.removeFile(filePath);
			count++;
		}
	}

	return count;
}
