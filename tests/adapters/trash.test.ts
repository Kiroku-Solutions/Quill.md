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

		expect(trashPath).toMatch(/^\.agnostic-issuer\/\.trash\/\d+-notes\.txt$/);
		expect(trashPath).toContain('-notes.txt');

		const content = await fs.readTextFile(trashPath);
		expect(content).toBe('hello');
	});

	it('returns a path ending with <timestamp>-<originalName>', async () => {
		await fs.writeTextFile('report.md', '# Report');

		const trashPath = await moveToTrash(fs, 'report.md');

		const segments = trashPath.split('/');
		const leaf = segments[segments.length - 1];
		const dashIdx = leaf.indexOf('-');
		expect(dashIdx).toBeGreaterThan(0);

		const timestampPart = leaf.slice(0, dashIdx);
		const timestamp = Number(timestampPart);
		expect(Number.isSafeInteger(timestamp)).toBe(true);
		expect(timestamp).toBeGreaterThan(0);
	});

	it('creates .agnostic-issuer/.trash/ implicitly on first move', async () => {
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
		await fs.writeTextFile('.agnostic-issuer/issues/0001-test.md', 'content');

		const trashPath = await moveToTrash(fs, '.agnostic-issuer/issues/0001-test.md');

		expect(trashPath).toContain('-0001-test.md');
		await expect(fs.readTextFile('.agnostic-issuer/issues/0001-test.md')).rejects.toThrow(
			AdapterNotFoundError
		);
	});

	it('timestamp collision: two files moved in the same millisecond get different trash names', async () => {
		await fs.writeTextFile('a.txt', 'alpha');
		await fs.writeTextFile('b.txt', 'beta');

		const [pathA, pathB] = await Promise.all([moveToTrash(fs, 'a.txt'), moveToTrash(fs, 'b.txt')]);

		expect(pathA).not.toBe(pathB);
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

describe('TRASH_DIRECTORY constant', () => {
	it('is ".agnostic-issuer/.trash"', () => {
		expect(TRASH_DIRECTORY).toBe('.agnostic-issuer/.trash');
	});
});
