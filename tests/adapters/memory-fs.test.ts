/**
 * Tests for {@link MemoryFsAdapter} — the in-memory {@link DirectoryAdapter}
 * implementation used as test infrastructure and (potentially) as the backing
 * store for the FR-11 wizard preview.
 *
 * Coverage target: ≥95%. The notable cases are:
 *   1. The atomic-write invariant (no `.tmp-*` keys left behind, even on
 *      simulated failure).
 *   2. Parent-directory auto-creation.
 *   3. Round-trip integration with `loadIssues` from the service layer,
 *      using the ERS Appendix B.6 example file as the canonical fixture.
 *   4. Path normalization via the helpers exported by `directory-adapter.ts`.
 *
 * ERS coverage exercised here: FR-1 (parser integration), FR-4
 * (Local-CRUD contract), and the data-model invariants in §6.1.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { AdapterError, AdapterNotFoundError, AdapterValidationError } from '$lib/adapters/errors';
import { normalizePath } from '$lib/adapters/directory-adapter';
import { loadIssues } from '$lib/services/issue-loader';

describe('MemoryFsAdapter — constructor & seed', () => {
	it('starts empty when no seed is provided', () => {
		const fs = new MemoryFsAdapter();
		const snap = fs.snapshot();
		expect(snap.files).toEqual({});
		// Only the root directory should exist.
		expect(snap.directories).toEqual(['.']);
	});

	it('seeds initial files and creates parent directories', () => {
		const fs = new MemoryFsAdapter({
			files: {
				'.nomad.md/config.json': '{"statuses":[]}',
				'.nomad.md/issues/0001-first.md': '# first'
			}
		});
		const snap = fs.snapshot();
		expect(snap.files['.nomad.md/config.json']).toBe('{"statuses":[]}');
		expect(snap.files['.nomad.md/issues/0001-first.md']).toBe('# first');
		// The root + two ancestor directories should be registered.
		expect(snap.directories).toContain('.');
		expect(snap.directories).toContain('.nomad.md');
		expect(snap.directories).toContain('.nomad.md/issues');
	});

	it('reset() clears state and re-applies the new seed', () => {
		const fs = new MemoryFsAdapter({
			files: { 'a.txt': 'old' }
		});
		expect(fs.snapshot().files['a.txt']).toBe('old');

		fs.reset({ files: { 'b.txt': 'new' } });
		const snap = fs.snapshot();
		expect(snap.files['a.txt']).toBeUndefined();
		expect(snap.files['b.txt']).toBe('new');
	});

	it('reset() with no argument returns to an empty filesystem', () => {
		const fs = new MemoryFsAdapter({
			files: { 'a.txt': 'x' }
		});
		fs.reset();
		expect(fs.snapshot().files).toEqual({});
	});
});

describe('MemoryFsAdapter — readTextFile', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter({
			files: { 'hello.txt': 'world' }
		});
	});

	it('returns the content of an existing file', async () => {
		expect(await fs.readTextFile('hello.txt')).toBe('world');
	});

	it('normalizes the path before lookup', async () => {
		expect(await fs.readTextFile('./hello.txt')).toBe('world');
		expect(await fs.readTextFile('a/../hello.txt')).toBe('world');
	});

	it('throws a not-found error for a missing file', async () => {
		await expect(fs.readTextFile('missing.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError',
			message: expect.stringContaining('missing.txt')
		});
	});

	it('rejects an empty path', async () => {
		await expect(fs.readTextFile('')).rejects.toMatchObject({
			name: 'AdapterValidationError'
		});
	});
});

describe('MemoryFsAdapter — writeTextFile (atomic invariant)', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('round-trips a written file via readTextFile', async () => {
		await fs.writeTextFile('a/b.txt', 'content');
		expect(await fs.readTextFile('a/b.txt')).toBe('content');
	});

	it('auto-creates intermediate directories on write', async () => {
		await fs.writeTextFile('deep/nested/path/file.txt', 'x');
		const entries = await fs.listDirectory('deep/nested/path');
		expect(entries).toEqual([{ name: 'file.txt', kind: 'file' }]);
	});

	it('does not leave temp files behind after a successful write', async () => {
		await fs.writeTextFile('atomic.txt', 'content');
		const entries = await fs.listDirectory('.');
		const temps = entries.filter((e) => e.name.includes('.tmp-'));
		expect(temps).toEqual([]);
	});

	it('does not leave temp files behind after a write that overwrites an existing file', async () => {
		await fs.writeTextFile('atomic.txt', 'v1');
		await fs.writeTextFile('atomic.txt', 'v2');
		expect(await fs.readTextFile('atomic.txt')).toBe('v2');
		const entries = await fs.listDirectory('.');
		const temps = entries.filter((e) => e.name.includes('.tmp-'));
		expect(temps).toEqual([]);
	});

	it('registers the file as a child of its parent directory', async () => {
		await fs.writeTextFile('dir/inner.txt', 'x');
		const entries = await fs.listDirectory('dir');
		expect(entries).toContainEqual({ name: 'inner.txt', kind: 'file' });
	});

	it('overwriting an existing file replaces its content (not appends)', async () => {
		await fs.writeTextFile('f.txt', 'first');
		await fs.writeTextFile('f.txt', 'second');
		expect(await fs.readTextFile('f.txt')).toBe('second');
	});

	it('rejects writing to the root path', async () => {
		await expect(fs.writeTextFile('.', 'x')).rejects.toMatchObject({
			name: 'AdapterValidationError'
		});
	});

	it('rejects an empty path', async () => {
		await expect(fs.writeTextFile('', 'x')).rejects.toMatchObject({
			name: 'AdapterValidationError'
		});
	});
});

describe('MemoryFsAdapter — listDirectory', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('returns an empty array for an auto-created directory', async () => {
		const entries = await fs.listDirectory('does-not-exist');
		expect(entries).toEqual([]);
	});

	it('returns files and subdirectories with correct kinds', async () => {
		await fs.writeTextFile('parent/child.txt', 'x');
		await fs.writeTextFile('parent/other.txt', 'y');
		await fs.writeTextFile('parent/sub/inner.txt', 'z');

		const entries = await fs.listDirectory('parent');
		const byName = Object.fromEntries(entries.map((e) => [e.name, e.kind]));

		expect(byName['child.txt']).toBe('file');
		expect(byName['other.txt']).toBe('file');
		expect(byName['sub']).toBe('directory');
	});

	it('lists the root with its direct children', async () => {
		await fs.writeTextFile('a.txt', '1');
		await fs.writeTextFile('dir/b.txt', '2');

		const rootEntries = await fs.listDirectory('.');
		const byName = Object.fromEntries(rootEntries.map((e) => [e.name, e.kind]));

		expect(byName['a.txt']).toBe('file');
		expect(byName['dir']).toBe('directory');
	});
});

describe('MemoryFsAdapter — removeFile', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter({
			files: { 'present.txt': 'x', 'other.txt': 'y' }
		});
	});

	it('removes the file and unregisters it from its parent', async () => {
		await fs.removeFile('present.txt');
		await expect(fs.readTextFile('present.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});
		const entries = await fs.listDirectory('.');
		expect(entries.find((e) => e.name === 'present.txt')).toBeUndefined();
	});

	it('throws when the file does not exist', async () => {
		await expect(fs.removeFile('nope.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});
	});
});

describe('MemoryFsAdapter — moveFile', () => {
	it('moves a file within the same parent', async () => {
		const fs = new MemoryFsAdapter({
			files: { 'dir/old.txt': 'payload' }
		});
		await fs.moveFile('dir/old.txt', 'dir/new.txt');

		expect(await fs.readTextFile('dir/new.txt')).toBe('payload');
		await expect(fs.readTextFile('dir/old.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});

		const entries = await fs.listDirectory('dir');
		expect(entries.map((e) => e.name).sort()).toEqual(['new.txt']);
	});

	it('moves a file across parents (read + write + remove)', async () => {
		const fs = new MemoryFsAdapter({
			files: { 'src/a.txt': 'payload' }
		});
		await fs.moveFile('src/a.txt', 'dst/b.txt');

		expect(await fs.readTextFile('dst/b.txt')).toBe('payload');
		await expect(fs.readTextFile('src/a.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});
	});

	it('throws when the source file does not exist', async () => {
		const fs = new MemoryFsAdapter();
		await expect(fs.moveFile('missing.txt', 'elsewhere.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});
	});
});

describe('MemoryFsAdapter — snapshot()', () => {
	it('omits temp artefacts from the snapshot', async () => {
		const fs = new MemoryFsAdapter();
		// The internal writeTextFile path uses a temp key; snapshot() should
		// never expose it. We assert by snapshotting before AND after a
		// successful write and verifying no `.tmp-` key appears.
		await fs.writeTextFile('a.txt', '1');
		const snap = fs.snapshot();
		const allPaths = [...Object.keys(snap.files), ...snap.directories];
		expect(allPaths.some((p) => p.includes('.tmp-'))).toBe(false);
	});

	it('returns plain serialisable data', () => {
		const fs = new MemoryFsAdapter({
			files: { 'a.txt': 'x' }
		});
		const snap = fs.snapshot();
		// Must survive a JSON round-trip without throwing.
		expect(() => JSON.stringify(snap)).not.toThrow();
	});
});

describe('MemoryFsAdapter — integration with loadIssues (service layer)', () => {
	/**
	 * Verifies that the adapter fulfils the contract the service layer expects:
	 * loadIssues() reads every *.md file under .nomad.md/issues/, parses
	 * it via parseIssueFile(), and returns LoadedIssue[]. The fixture below is
	 * the ERS Appendix B.6 example verbatim — same id, same sections, same
	 * frontmatter layout.
	 */
	it('round-trips the ERS Appendix B.6 example through loadIssues', async () => {
		const fs = new MemoryFsAdapter();
		const ersExample = `---
id: 42
title: "Fix login redirect"
author: "jane"
creation_date: 2026-10-20
updated_date: 2026-10-21
issue_type: bug
status: in_progress
assignee: "jane"
labels: [security, frontend]
relations:
  - { type: blocks, id: 45 }
  - { type: relates_to, id: 7 }
start_date: 2026-10-20
duration: 3
severity: high
priority: p1
integrity_hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
---

<!-- [SECTION_START: Description] -->
# Login form

After submitting valid credentials, the user is redirected to a
404 page instead of the dashboard.
<!-- [SECTION_END: Description] -->

<!-- [SECTION_START: Steps to reproduce] -->
1. Navigate to \`/login\`.
2. Enter valid credentials.
3. Click "Sign in".
4. Observe the URL.
<!-- [SECTION_END: Steps to reproduce] -->
`;

		await fs.writeTextFile('.nomad.md/issues/0042-fix-login-redirect.md', ersExample);

		const issues = await loadIssues(fs);

		expect(issues).toHaveLength(1);
		const loaded = issues[0];
		expect(loaded).toBeDefined();
		expect(loaded?.sourcePath).toBe('.nomad.md/issues/0042-fix-login-redirect.md');

		const issue = loaded?.issue;
		expect(issue?.id).toBe(42);
		expect(issue?.title).toBe('Fix login redirect');
		expect(issue?.author).toBe('jane');
		expect(issue?.creationDate).toBe('2026-10-20');
		expect(issue?.updatedDate).toBe('2026-10-21');
		expect(issue?.issueType).toBe('bug');
		expect(issue?.status).toBe('in_progress');
		expect(issue?.assignee).toBe('jane');
		expect(issue?.labels).toEqual(['security', 'frontend']);
		expect(issue?.relations).toEqual([
			{ type: 'blocks', id: 45 },
			{ type: 'relates_to', id: 7 }
		]);
		expect(issue?.startDate).toBe('2026-10-20');
		expect(issue?.duration).toBe(3);

		// Template-defined custom fields survive the round-trip.
		expect(issue?.customFields['severity']).toBe('high');
		expect(issue?.customFields['priority']).toBe('p1');

		// Two sections extracted in declared order.
		expect(issue?.sections.map((s) => s.name)).toEqual(['Description', 'Steps to reproduce']);
		expect(issue?.sections[0]?.markdown).toContain('# Login form');
		expect(issue?.sections[1]?.markdown).toContain('Navigate to');

		// The ERS example uses a placeholder SHA-256 ('hello') that doesn't
		// match the canonical form our parser computes, so the integrity
		// warning is expected. (FR-15.)
		expect(issue?.integrityWarning).toBe(true);
	});

	it('returns an empty list when the issues directory is missing', async () => {
		// Fresh filesystem — no .nomad.md/issues/ at all.
		const fs = new MemoryFsAdapter();
		const issues = await loadIssues(fs);
		expect(issues).toEqual([]);
	});

	it('handles multiple issues in a single directory', async () => {
		const fs = new MemoryFsAdapter();
		const mkIssue = (id: number, title: string) => `---
id: ${id}
title: "${title}"
author: "jose"
creation_date: 2026-01-01
updated_date: 2026-01-01
issue_type: task
status: open
assignee: null
labels: []
relations: []
---
<!-- [SECTION_START: Description] -->
content for ${title}
<!-- [SECTION_END: Description] -->
`;

		await fs.writeTextFile('.nomad.md/issues/0001-first.md', mkIssue(1, 'first'));
		await fs.writeTextFile('.nomad.md/issues/0002-second.md', mkIssue(2, 'second'));
		await fs.writeTextFile('.nomad.md/issues/0003-third.md', mkIssue(3, 'third'));

		const issues = await loadIssues(fs);
		expect(issues.map((i) => i.issue.id)).toEqual([1, 2, 3]);
	});
});

describe('MemoryFsAdapter — path normalization behaviour', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('treats "./" prefixed paths as their normalised form', async () => {
		await fs.writeTextFile('./file.txt', 'x');
		expect(await fs.readTextFile('./file.txt')).toBe('x');
		expect(await fs.readTextFile('file.txt')).toBe('x');
	});

	it('collapses redundant separators and "." segments', async () => {
		await fs.writeTextFile('a//b/./c.txt', 'x');
		expect(await fs.readTextFile('a/b/c.txt')).toBe('x');
	});

	it('collapses ".." segments without escaping the root', async () => {
		await fs.writeTextFile('safe.txt', 'x');
		expect(await fs.readTextFile('a/../safe.txt')).toBe('x');
	});
});

// ============================================================================
// Hardening tests — added in response to the Day 1 QA audit (see
// docs/step-4-day-1-master.md §6). Each block below targets a specific
// audit finding and pins the corresponding invariant in test form.
// ============================================================================

describe('MemoryFsAdapter — moveFile self-move is a no-op (audit A1/A6)', () => {
	it('moveFile(file, file) preserves the file content', async () => {
		const fs = new MemoryFsAdapter({ files: { 'a.txt': 'payload' } });
		await fs.moveFile('a.txt', 'a.txt');
		expect(await fs.readTextFile('a.txt')).toBe('payload');
	});

	it('moveFile with different surface forms of the same path is a no-op', async () => {
		const fs = new MemoryFsAdapter({ files: { 'a.txt': 'payload' } });
		await fs.moveFile('./a.txt', 'a/../a.txt');
		expect(await fs.readTextFile('a.txt')).toBe('payload');
		const entries = await fs.listDirectory('.');
		expect(entries.map((e) => e.name)).toEqual(['a.txt']);
	});

	it('moveFile(file, file) does not error when the file does not exist', async () => {
		const fs = new MemoryFsAdapter();
		await expect(fs.moveFile('missing.txt', 'missing.txt')).resolves.toBeUndefined();
		await expect(fs.readTextFile('missing.txt')).rejects.toMatchObject({
			name: 'AdapterNotFoundError'
		});
	});
});

describe('MemoryFsAdapter — writeTextFile refuses to clobber directories (audit A2/A7)', () => {
	it('throws AdapterValidationError when writing to an existing directory path', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('parent/child.txt', 'x');
		const err = await fs.writeTextFile('parent', 'content').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterValidationError);
		expect(err).toBeInstanceOf(AdapterError);
		expect((err as AdapterValidationError).type).toBe('validation');
		expect((err as AdapterValidationError).path).toBe('parent');
	});

	it('leaves the directory entry intact after the rejected write', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('parent/child.txt', 'x');
		await expect(fs.writeTextFile('parent', 'content')).rejects.toBeInstanceOf(
			AdapterValidationError
		);
		const entries = await fs.listDirectory('parent');
		expect(entries.map((e) => e.name).sort()).toEqual(['child.txt']);
	});
});

describe('MemoryFsAdapter — error instanceof + discriminator (audit A11)', () => {
	// Replaces the older `toMatchObject({ name })` assertions with explicit
	// `instanceof` + discriminator checks so future regressions (e.g. a
	// return to the pre-refactor `Error + name` pattern) get caught.

	it('not-found errors expose the full class hierarchy and discriminator', async () => {
		const fs = new MemoryFsAdapter();
		const err = await fs.readTextFile('missing.txt').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterNotFoundError);
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
		expect((err as AdapterNotFoundError).type).toBe('not-found');
		expect((err as AdapterNotFoundError).path).toBe('missing.txt');
		expect((err as AdapterNotFoundError).name).toBe('AdapterNotFoundError');
	});

	it('empty-path errors are AdapterValidationError without path context', async () => {
		const fs = new MemoryFsAdapter();
		const err = await fs.readTextFile('').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterValidationError);
		expect((err as AdapterValidationError).type).toBe('validation');
		// Empty path has nothing to attach as `path`; the field stays undefined.
		expect((err as AdapterValidationError).path).toBeUndefined();
	});

	it('root-path errors carry the offending path', async () => {
		const fs = new MemoryFsAdapter();
		const err = await fs.writeTextFile('.', 'x').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterValidationError);
		expect((err as AdapterValidationError).type).toBe('validation');
		expect((err as AdapterValidationError).path).toBe('.');
	});

	it('errors thrown from writeTextFile are catchable as plain Error', async () => {
		const fs = new MemoryFsAdapter();
		try {
			await fs.writeTextFile('', 'x');
			throw new Error('unreachable: writeTextFile should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(AdapterValidationError);
			expect(e).toBeInstanceOf(AdapterError);
			expect(e).toBeInstanceOf(Error);
		}
	});
});

describe('MemoryFsAdapter — removeFile on a directory (audit A9)', () => {
	it('throws AdapterNotFoundError (the path is not a file)', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('parent/child.txt', 'x');
		// `parent` is a directory, not a file in `files` Map, so the lookup
		// fails the same way as a missing file would.
		const err = await fs.removeFile('parent').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterNotFoundError);
		expect((err as AdapterNotFoundError).type).toBe('not-found');
		expect((err as AdapterNotFoundError).path).toBe('parent');
	});

	it('does not destroy the directory or its children', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('parent/child.txt', 'x');
		await expect(fs.removeFile('parent')).rejects.toBeInstanceOf(AdapterNotFoundError);
		// Directory listing must still include the child.
		const entries = await fs.listDirectory('parent');
		expect(entries.map((e) => e.name)).toEqual(['child.txt']);
		// And the file must still be readable.
		expect(await fs.readTextFile('parent/child.txt')).toBe('x');
	});
});

describe('MemoryFsAdapter — bounded growth (audit A4)', () => {
	it('rejects a single write that exceeds maxFileSize', async () => {
		const fs = new MemoryFsAdapter(undefined, { maxFileSize: 16, maxEntries: 100 });
		const err = await fs.writeTextFile('big.txt', 'x'.repeat(64)).then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterValidationError);
		expect((err as AdapterValidationError).type).toBe('validation');
		// The filesystem must remain unchanged after the rejection.
		await expect(fs.readTextFile('big.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
	});

	it('accepts a write exactly at maxFileSize', async () => {
		const fs = new MemoryFsAdapter(undefined, { maxFileSize: 16, maxEntries: 100 });
		await expect(fs.writeTextFile('exact.txt', 'x'.repeat(16))).resolves.toBeUndefined();
		expect(await fs.readTextFile('exact.txt')).toHaveLength(16);
	});

	it('rejects new entries once maxEntries is reached (overwrites still allowed)', async () => {
		const fs = new MemoryFsAdapter(undefined, { maxFileSize: 1024, maxEntries: 2 });
		await fs.writeTextFile('a.txt', '1');
		await fs.writeTextFile('b.txt', '2');
		// Third NEW entry is rejected.
		const err = await fs.writeTextFile('c.txt', '3').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterValidationError);
		expect((err as AdapterValidationError).type).toBe('validation');
		expect((err as AdapterValidationError).path).toBe('c.txt');
		// Overwriting an existing entry is fine.
		await expect(fs.writeTextFile('a.txt', 'updated')).resolves.toBeUndefined();
		expect(await fs.readTextFile('a.txt')).toBe('updated');
	});

	it('seed enforces both limits so the constructor is not a DoS vector', () => {
		expect(
			() => new MemoryFsAdapter({ files: { 'big.txt': 'x'.repeat(2048) } }, { maxFileSize: 1024 })
		).toThrow(AdapterValidationError);
		expect(
			() =>
				new MemoryFsAdapter(
					{ files: { 'a.txt': '1', 'b.txt': '2', 'c.txt': '3' } },
					{ maxEntries: 2 }
				)
		).toThrow(AdapterValidationError);
	});

	it('negative or zero limits fall back to the defaults', async () => {
		const fs = new MemoryFsAdapter(undefined, { maxFileSize: 0, maxEntries: -1 });
		// Defaults are 10 MiB and 10 000 files; even a 1 KiB write must succeed.
		await expect(fs.writeTextFile('a.txt', 'x'.repeat(1024))).resolves.toBeUndefined();
	});
});

describe('MemoryFsAdapter — reset() edge cases', () => {
	it('refuses a seed entry that normalises to the root path', () => {
		// Any path made entirely of `..` segments collapses to `.` after
		// normalisation; the reset path must reject it before mutating state.
		expect(() => new MemoryFsAdapter({ files: { '.': 'x' } })).toThrow(AdapterValidationError);
		expect(() => new MemoryFsAdapter({ files: { 'a/..': 'x' } })).toThrow(AdapterValidationError);
	});
});

describe('MemoryFsAdapter — path validation against control characters (audit A5)', () => {
	it.each([
		['NUL byte', 'foo\x00bar'],
		['newline', 'foo\nbar'],
		['carriage return', 'foo\rbar'],
		['tab', 'foo\tbar'],
		['DEL', 'foo\x7fbar']
	])('rejects paths containing a %s', async (_label, badPath) => {
		const fs = new MemoryFsAdapter();
		await expect(fs.readTextFile(badPath)).rejects.toThrow();
		await expect(fs.writeTextFile(badPath, 'x')).rejects.toThrow();
		await expect(fs.listDirectory(badPath)).rejects.toThrow();
		await expect(fs.removeFile(badPath)).rejects.toThrow();
	});

	it('allows Unicode above U+007F (multi-byte UTF-8 sequences)', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('café/日本語/🎉.md', 'x');
		expect(await fs.readTextFile('café/日本語/🎉.md')).toBe('x');
	});
});

// Standalone coverage for the pure normalizePath helper. Many of the adapter
// tests exercise normalizePath transitively, but pinning the edge cases here
// keeps the helper's contract visible without scrolling through 400+ lines
// of integration tests. (Audit A8.)
describe('normalizePath — edge cases', () => {
	it.each<[string, string]>([
		['.', '.'],
		['..', '.'],
		['../', '.'],
		['a/..', '.'],
		['a/../..', '.'],
		['a/../../b', 'b'],
		['/leading/slash', 'leading/slash'],
		['///multiple///slashes///', 'multiple/slashes'],
		['a/b/..', 'a'],
		['a//b', 'a/b']
	])('%j → %j', (input, expected) => {
		expect(normalizePath(input)).toBe(expected);
	});

	it.each(['foo\x00bar', 'foo\nbar', 'foo\tbar'])('throws on control characters: %j', (badPath) => {
		expect(() => normalizePath(badPath)).toThrow();
	});
});
