/**
 * Tests for `src/lib/services/issue-trash.ts`.
 *
 * The issue trash is the service-layer wrapper around the generic
 * adapter-level trash (`adapters/trash.ts`). It exists so the state
 * layer never imports the adapter helper directly — same leak-fix
 * pattern as `issue-saver.ts`. Coverage targets:
 *  - `trashedIssuePath`:
 *    - produces the ERS §6.5 format for a known id + title.
 *    - honours the explicit `now` parameter for deterministic tests.
 *  - `moveIssueToTrash`:
 *    - moves a file from `.quill.md/issues/...` using the typed
 *      `<timestamp>-<id>-<slug>.md` format.
 *    - removes the file from the source location after the move.
 *    - falls back to the adapter-level helper (UUID-suffixed) when
 *      the source path is not under `.quill.md/issues/`.
 *  - `ISSUE_TRASH_DIRECTORY` is `.quill.md/.trash`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import {
	ISSUE_TRASH_DIRECTORY,
	moveIssueToTrash,
	trashedIssuePath
} from '$lib/services/issue-trash';
import type { Issue } from '$lib/types';

const ISSUE_PATH = '.quill.md/issues/0007-fix-login.md';

function makeIssue(
	id = 7,
	title = 'Fix login'
): Pick<Issue, 'id'> & { fields: Pick<Issue['fields'], 'title'> } {
	return { id, fields: { title } };
}

describe('trashedIssuePath (pure helper)', () => {
	it('produces the ERS §6.5 "<timestamp>-<id>-<slug>.md" format', () => {
		const path = trashedIssuePath(makeIssue(), 1736899200000);
		expect(path).toBe('.quill.md/.trash/1736899200000-7-fix-login.md');
	});

	it('honours an explicit `now` parameter for deterministic output', () => {
		const a = trashedIssuePath(makeIssue(42, 'Sprint retro'), 1_700_000_000_000);
		const b = trashedIssuePath(makeIssue(42, 'Sprint retro'), 1_800_000_000_000);
		expect(a).toBe('.quill.md/.trash/1700000000000-42-sprint-retro.md');
		expect(b).toBe('.quill.md/.trash/1800000000000-42-sprint-retro.md');
		expect(a).not.toBe(b);
	});

	it('exposes ISSUE_TRASH_DIRECTORY as ".quill.md/.trash"', () => {
		expect(ISSUE_TRASH_DIRECTORY).toBe('.quill.md/.trash');
	});
});

describe('moveIssueToTrash — issue source path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await fs.writeTextFile(ISSUE_PATH, 'placeholder body');
	});

	it('moves the file using the typed ERS §6.5 format', async () => {
		const fixedNow = 1_700_000_000_000;
		const trashPath = await moveIssueToTrash(fs, makeIssue(), ISSUE_PATH, fixedNow);
		expect(trashPath).toBe(`${ISSUE_TRASH_DIRECTORY}/${fixedNow}-7-fix-login.md`);

		// The file lives at the new path with its original content.
		const moved = await fs.readTextFile(trashPath);
		expect(moved).toBe('placeholder body');
	});

	it('removes the file from the source location after the move', async () => {
		await moveIssueToTrash(fs, makeIssue(), ISSUE_PATH, 1_700_000_000_000);
		// The source path no longer exists; the only file under
		// `.quill.md/issues/` is gone.
		const issuesEntries = await fs.listDirectory('.quill.md/issues');
		expect(issuesEntries).toEqual([]);
	});
});

describe('moveIssueToTrash — non-issue source path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('falls back to the adapter-level helper (UUID-suffixed) for non-issue paths', async () => {
		// A source path outside `.quill.md/issues/` is treated as a
		// generic file: the helper defers to `adapters/trash.ts`, which
		// uses `<timestamp>-<uuid8>-<originalName>` instead.
		const stray = '.quill.md/stray-attachment.txt';
		await fs.writeTextFile(stray, 'not an issue');

		const trashPath = await moveIssueToTrash(fs, makeIssue(), stray, 1_700_000_000_000);
		// Format: <timestamp>-<uuid8>-<originalName>
		expect(trashPath.startsWith(`${ISSUE_TRASH_DIRECTORY}/`)).toBe(true);
		expect(trashPath.endsWith('-stray-attachment.txt')).toBe(true);
		// The middle segment is 8 hex characters (the UUID prefix).
		const suffix = trashPath.slice(
			`${ISSUE_TRASH_DIRECTORY}/`.length,
			-'-stray-attachment.txt'.length
		);
		const dashIdx = suffix.indexOf('-');
		expect(dashIdx).toBeGreaterThan(0);
		const middle = suffix.slice(dashIdx + 1);
		expect(middle).toMatch(/^[0-9a-f]{8}$/);

		// Content survives the move.
		expect(await fs.readTextFile(trashPath)).toBe('not an issue');
	});
});
