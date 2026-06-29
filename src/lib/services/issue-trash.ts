/**
 * Issue soft-delete (trash) service — the state layer's only entry point
 * for moving an issue file to `.nomad.md/.trash/`.
 *
 * Lives in the service layer so the state layer never imports
 * `adapters/trash.ts` directly (closing the same layer leak that
 * `docs/audits/2026-06-23/architecture-audit.md` flagged for the create /
 * save paths).
 *
 * Filename format matches ERS §6.5:
 * `.nomad.md/.trash/<timestamp>-<id>-<slug>.md`
 *
 * The original implementation (`adapters/trash.ts`) uses `<timestamp>-<uuid8>-<originalName>`
 * for collision resistance on any file type. The spec format
 * (`<timestamp>-<id>-<slug>`) is strictly typed to *issue* files and lets
 * the user recognise the trashed entry from its name alone. UUID-8's role
 * for collision avoidance is replaced by the millisecond timestamp, which
 * is monotonic.
 */
import type { WritableDirectoryAdapter } from '../adapters/directory-adapter.ts';
import { splitPath } from '../adapters/directory-adapter.ts';
import type { Issue } from '../types/index.ts';
import { slugify } from './slugs.ts';
import { moveToTrash as adapterMoveToTrash } from '../adapters/trash.ts';

export const ISSUE_TRASH_DIRECTORY = '.nomad.md/.trash';

/**
 * Compute the ERS §6.5 trash path for an issue file. Pure — no I/O.
 * Exposed so callers can show the path in the UI before moving the file.
 */
export function trashedIssuePath(
	issue: Pick<Issue, 'id' | 'title'>,
	now: number = Date.now()
): string {
	const idSegment = String(issue.id);
	const slugSegment = slugify(issue.title);
	return `${ISSUE_TRASH_DIRECTORY}/${now}-${idSegment}-${slugSegment}.md`;
}

/**
 * Move an issue file to the trash directory using the ERS §6.5 filename
 * format. Falls back to the adapter-level primitive (which uses a UUID
 * suffix) when the source path does not look like an issue file (no
 * `.nomad.md/issues/` prefix), so the helper is safe to call from any
 * soft-delete path.
 */
export async function moveIssueToTrash(
	adapter: WritableDirectoryAdapter,
	issue: Pick<Issue, 'id' | 'title'>,
	sourcePath: string
): Promise<string> {
	const { parent } = splitPath(sourcePath);
	if (parent === '.nomad.md/issues') {
		const timestamp = Date.now();
		const trashPath = trashedIssuePath(issue, timestamp);
		await adapter.moveFile(sourcePath, trashPath);
		return trashPath;
	}
	// Non-issue source: defer to the adapter-level helper (UUID-suffixed).
	return adapterMoveToTrash(adapter, sourcePath);
}
