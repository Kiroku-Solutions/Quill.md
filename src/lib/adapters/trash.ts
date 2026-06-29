/**
 * Soft-delete helpers over a {@link DirectoryAdapter}.
 *
 * Files are moved into a reserved `.agnostic-issuer/.trash/` directory with a
 * timestamp prefix so they can be restored or permanently removed.
 *
 * ## Trash filename format
 *
 * A trashed file is stored at:
 * ```
 * .agnostic-issuer/.trash/<timestamp>-<originalName>
 * ```
 * where `<timestamp> = Date.now()` (Unix ms).  The timestamp makes each move
 * unique and allows `emptyTrash` to optionally age-filter entries.
 *
 * ## Interaction with the adapter contract
 *
 * `moveToTrash` calls `adapter.moveFile`, so atomicity guarantees are the
 * same as `moveFile` on the underlying adapter (NFR-7 applies to the original
 * `writeTextFile` call, not to trash operations).
 *
 * The trash directory itself is created implicitly — the first file moved to
 * trash triggers creation of `.agnostic-issuer/.trash/`.
 *
 * ERS coverage: FR-4 (soft-delete is part of Local CRUD lifecycle).
 */

import { splitPath } from './directory-adapter.ts';
import type { DirectoryAdapter } from './directory-adapter.ts';

/** Reserved directory inside every `.agnostic-issuer/` root. */
export const TRASH_DIRECTORY = '.agnostic-issuer/.trash';

/**
 * Move a file to the trash directory.
 *
 * @param adapter - The DirectoryAdapter to operate on.
 * @param sourcePath - Relative path of the file to trash.
 * @returns The trash path the file was moved to (`.agnostic-issuer/.trash/<timestamp>-<name>`).
 * @throws AdapterNotFoundError if the source file does not exist.
 */
export async function moveToTrash(adapter: DirectoryAdapter, sourcePath: string): Promise<string> {
	const { parent, name } = splitPath(sourcePath);
	void parent;

	const timestamp = Date.now();
	const trashName = `${timestamp}-${name}`;
	const trashPath = `${TRASH_DIRECTORY}/${trashName}`;

	await adapter.moveFile(sourcePath, trashPath);

	return trashPath;
}

/**
 * Permanently remove every file currently inside the trash directory.
 *
 * @param adapter - The DirectoryAdapter to operate on.
 * @returns The number of files removed.
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
