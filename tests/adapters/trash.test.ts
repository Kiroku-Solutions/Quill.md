/**
 * Tests for the trash helpers — {@link moveToTrash} and {@link emptyTrash}.
 *
 * Uses {@link MemoryFsAdapter} as the {@link DirectoryAdapter} subject, so
 * these tests run in the Vitest server project (no browser APIs needed).
 *
 * Coverage targets:
 *   1. moveToTrash moves a file with a timestamp prefix
 *   2. moveToTrash creates the trash directory implicitly
 *   3. moveToTrash raises AdapterNotFoundError when source does not exist
 *   4. emptyTrash removes all files and returns the count
 *   5. emptyTrash on an empty trash returns 0
 *   6. emptyTrash skips subdirectories (only removes files)
 *   7. Full cycle — create, moveToTrash, emptyTrash
 *
 * ERS coverage: FR-4 (soft-delete lifecycle).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { AdapterNotFoundError } from '$lib/adapters/errors';
import { TRASH_DIRECTORY, moveToTrash, emptyTrash } from '$lib/adapters/trash';

describe('moveToTrash', () => {
	let fs: MemoryFsAdapter;

	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('moves a file into the trash directory', async () => {
		await fs.writeTextFile('notes.txt', 'hello');

		const trashPath = await moveToTrash(fs, 'notes.txt');

		// Format: `<timestamp>-<uuid8>-<originalName>` — see trash.ts doc.
		expect(trashPath).toMatch(/^\.nomad\.md\/\.trash\/\d+-[0-9a-f]{8}-notes\.txt$/);
		expect(trashPath).toContain('-notes.txt');

		const content = await fs.readTextFile(trashPath);
		expect(content).toBe('hello');
	});

	it('returns a path ending with <timestamp>-<uuid8>-<originalName>', async () => {
		await fs.writeTextFile('report.md', '# Report');

		const trashPath = await moveToTrash(fs, 'report.md');

		const segments = trashPath.split('/');
		const leaf = segments[segments.length - 1];
		const dashIdx = leaf.indexOf('-');
		expect(dashIdx).toBeGreaterThan(0);

		// The substring before the FIRST dash is still the timestamp — the
		// UUID is the second segment.
		const timestampPart = leaf.slice(0, dashIdx);
		const timestamp = Number(timestampPart);
		expect(Number.isSafeInteger(timestamp)).toBe(true);
		expect(timestamp).toBeGreaterThan(0);

		// Leaf layout: <timestamp>-<uuid8>-<name>
		const afterTimestamp = leaf.slice(dashIdx + 1);
		const uuid8DashIdx = afterTimestamp.indexOf('-');
		expect(uuid8DashIdx).toBe(8); // exactly 8 hex chars between dashes
		const uuid8Part = afterTimestamp.slice(0, uuid8DashIdx);
		expect(uuid8Part).toMatch(/^[0-9a-f]{8}$/);
		expect(afterTimestamp.slice(uuid8DashIdx + 1)).toBe('report.md');
	});

	it('creates .nomad.md/.trash/ implicitly on first move', async () => {
		await fs.writeTextFile('todo.txt', 'buy milk');

		await moveToTrash(fs, 'todo.txt');

		const entries = await fs.listDirectory(TRASH_DIRECTORY);
		expect(entries).toHaveLength(1);
	});

	it('throws AdapterNotFoundError when the source file does not exist', async () => {
		await expect(moveToTrash(fs, 'nonexistent.md')).rejects.toThrow(AdapterNotFoundError);
	});

	it('source file is no longer readable after being trashed', async () => {
		await fs.writeTextFile('secret.txt', 'classified');

		await moveToTrash(fs, 'secret.txt');

		await expect(fs.readTextFile('secret.txt')).rejects.toThrow(AdapterNotFoundError);
	});

	it('handles nested paths correctly', async () => {
		await fs.writeTextFile('.nomad.md/issues/0001-test.md', 'content');

		const trashPath = await moveToTrash(fs, '.nomad.md/issues/0001-test.md');

		expect(trashPath).toContain('-0001-test.md');
		await expect(fs.readTextFile('.nomad.md/issues/0001-test.md')).rejects.toThrow(
			AdapterNotFoundError
		);
	});

	it('timestamp collision: two files moved in the same millisecond get different trash names', async () => {
		await fs.writeTextFile('a.txt', 'alpha');
		await fs.writeTextFile('b.txt', 'beta');

		const [pathA, pathB] = await Promise.all([moveToTrash(fs, 'a.txt'), moveToTrash(fs, 'b.txt')]);

		expect(pathA).not.toBe(pathB);
	});

	it('UUID guarantees uniqueness when the same file is trashed twice in the same millisecond', async () => {
		// Use a single backing file by re-creating it between calls — this is
		// the worst-case scenario for trash naming because both calls share
		// the same logical name. Without a UUID, the second `moveFile` would
		// overwrite the first.
		await fs.writeTextFile('dup.txt', 'first');

		const firstPath = await moveToTrash(fs, 'dup.txt');
		// Re-create the file (moveToTrash deletes the source) and trash it
		// again, immediately, so the millisecond is likely the same.
		await fs.writeTextFile('dup.txt', 'second');
		const secondPath = await moveToTrash(fs, 'dup.txt');

		expect(firstPath).not.toBe(secondPath);

		// Both trash entries must be readable and preserve their own content.
		expect(await fs.readTextFile(firstPath)).toBe('first');
		expect(await fs.readTextFile(secondPath)).toBe('second');
	});
});

describe('emptyTrash', () => {
	let fs: MemoryFsAdapter;

	beforeEach(async () => {
		fs = new MemoryFsAdapter();
	});

	it('returns 0 when trash is already empty', async () => {
		await fs.writeTextFile(`${TRASH_DIRECTORY}/.placeholder`, 'temp');
		await fs.removeFile(`${TRASH_DIRECTORY}/.placeholder`);

		const count = await emptyTrash(fs);

		expect(count).toBe(0);
	});

	it('removes all files in the trash directory and returns the count', async () => {
		await fs.writeTextFile(`${TRASH_DIRECTORY}/1700000000000-a.txt`, 'alpha');
		await fs.writeTextFile(`${TRASH_DIRECTORY}/1700000000001-b.txt`, 'beta');
		await fs.writeTextFile(`${TRASH_DIRECTORY}/1700000000002-c.txt`, 'gamma');

		const count = await emptyTrash(fs);

		expect(count).toBe(3);
		const entries = await fs.listDirectory(TRASH_DIRECTORY);
		expect(entries).toHaveLength(0);
	});

	it('only removes files, not subdirectories', async () => {
		await fs.writeTextFile(`${TRASH_DIRECTORY}/subdir/.keep`, '');
		await fs.writeTextFile(`${TRASH_DIRECTORY}/1700000000000-d.txt`, 'delta');

		const count = await emptyTrash(fs);

		expect(count).toBe(1);
		const entries = await fs.listDirectory(TRASH_DIRECTORY);
		const subdirs = entries.filter((e) => e.kind === 'directory');
		expect(subdirs.some((d) => d.name === 'subdir')).toBe(true);
	});

	it('is idempotent — calling emptyTrash twice on already-empty trash returns 0', async () => {
		await fs.writeTextFile(`${TRASH_DIRECTORY}/1700000000000-x.txt`, 'x');

		await emptyTrash(fs);
		const count = await emptyTrash(fs);

		expect(count).toBe(0);
	});
});

describe('full cycle: create → moveToTrash → emptyTrash', () => {
	let fs: MemoryFsAdapter;

	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('reproduces the FR-4 soft-delete lifecycle end-to-end', async () => {
		// Arrange: create an issue file (mirrors the real FR-4 happy path).
		const issuePath = '.nomad.md/issues/0001-cycle.md';
		await fs.writeTextFile(issuePath, '# Cycle test issue\nbody');

		// Verify the file exists at the source path before trashing.
		expect(await fs.readTextFile(issuePath)).toBe('# Cycle test issue\nbody');

		// Act 1 — moveToTrash.
		const trashPath = await moveToTrash(fs, issuePath);

		// The trash path lives under TRASH_DIRECTORY and is timestamp + uuid prefixed.
		expect(trashPath.startsWith(`${TRASH_DIRECTORY}/`)).toBe(true);
		expect(trashPath).toMatch(/^\.nomad\.md\/\.trash\/\d+-[0-9a-f]{8}-0001-cycle\.md$/);

		// The source is gone, the trash copy preserves the payload.
		await expect(fs.readTextFile(issuePath)).rejects.toThrow(AdapterNotFoundError);
		expect(await fs.readTextFile(trashPath)).toBe('# Cycle test issue\nbody');

		// The trash directory now holds exactly one entry.
		const beforeEmpty = await fs.listDirectory(TRASH_DIRECTORY);
		expect(beforeEmpty).toHaveLength(1);

		// Act 2 — emptyTrash.
		const removedCount = await emptyTrash(fs);
		expect(removedCount).toBe(1);

		// The trash directory is empty again and the source stays gone.
		const afterEmpty = await fs.listDirectory(TRASH_DIRECTORY);
		expect(afterEmpty).toEqual([]);

		// Calling emptyTrash once more is a no-op.
		expect(await emptyTrash(fs)).toBe(0);
	});

	it('handles a batch lifecycle (multiple create/trash/empty cycles in sequence)', async () => {
		const files = ['.nomad.md/issues/a.md', '.nomad.md/issues/b.md', '.nomad.md/issues/c.md'];
		for (const f of files) await fs.writeTextFile(f, `body of ${f}`);

		// Trash all three in parallel — timestamps may collide, but paths stay unique.
		const trashPaths = await Promise.all(files.map((f) => moveToTrash(fs, f)));
		expect(new Set(trashPaths).size).toBe(3);

		// Every source is gone.
		for (const f of files) {
			await expect(fs.readTextFile(f)).rejects.toThrow(AdapterNotFoundError);
		}

		// All three landed in the trash directory.
		const trashEntries = await fs.listDirectory(TRASH_DIRECTORY);
		expect(trashEntries.filter((e) => e.kind === 'file')).toHaveLength(3);

		// Empty removes exactly three files.
		expect(await emptyTrash(fs)).toBe(3);
		expect(await fs.listDirectory(TRASH_DIRECTORY)).toEqual([]);
	});
});

describe('TRASH_DIRECTORY constant', () => {
	it('is ".nomad.md/.trash"', () => {
		expect(TRASH_DIRECTORY).toBe('.nomad.md/.trash');
	});
});
