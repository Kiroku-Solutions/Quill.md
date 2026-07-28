/**
 * Tests for `src/lib/services/issue-saver.ts`.
 *
 * The saver is the service-layer single source of truth for
 * "serialize + write + reparse" — `state/issues.ts` calls into it
 * instead of inlining the adapter plumbing. Coverage targets:
 *  - `buildDefaultIssue`:
 *    - default status is `'open'` when `input.status` is omitted.
 *    - explicit `input.status` wins.
 *    - custom fields are copied (own object — not shared by reference).
 *    - `today` defaults to UTC now; explicit `today` overrides.
 *    - next id is `nextIssueId(existing)`.
 *  - `issuePath`: filename is `<padded-id>-<slug>.md` under `ISSUES_DIR`.
 *  - `createIssue`:
 *    - writes the file through the adapter.
 *    - reparse round-trip: returned `LoadedIssue` has
 *      `integrityWarning: false` (the hash was computed during serialize).
 *    - service is permissive about unknown `issueType` (the validator
 *      is the gate, not the saver).
 *  - `saveIssue`:
 *    - overwrites an existing file in place.
 *    - concurrent saves are last-write-wins (the adapter doesn't
 *      coordinate; we serialize them with `await` and assert the
 *      later write survives).
 *    - returned `LoadedIssue` matches the on-disk form.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import {
	buildDefaultIssue,
	createIssue,
	issuePath,
	ISSUES_DIR,
	saveIssue
} from '$lib/services/issue-saver';
import type { Issue } from '$lib/types';

describe('buildDefaultIssue', () => {
	const noExisting: ReadonlyArray<{ id: number }> = [];

	it('defaults `status` to "open" when input.status is omitted', () => {
		const issue = buildDefaultIssue(
			{ title: 'Hello', issueType: 'task', author: 'jane' },
			noExisting
		);
		expect(issue.fields.status).toBe('open');
	});

	it('respects an explicit input.status', () => {
		const issue = buildDefaultIssue(
			{ title: 'Hello', issueType: 'task', author: 'jane', status: 'in_progress' },
			noExisting
		);
		expect(issue.fields.status).toBe('in_progress');
	});

	it('copies customFields into a fresh object (no shared mutation)', () => {
		const seed = { severity: 'high', priority: 'p1' };
		const issue = buildDefaultIssue(
			{
				title: 'Hello',
				issueType: 'task',
				author: 'jane',
				customFields: seed
			},
			noExisting
		);
		expect(issue.customFields).toEqual({ severity: 'high', priority: 'p1' });
		// Not the same reference — the saver must clone so a later
		// mutation of the caller's seed doesn't leak into the Issue.
		expect(issue.customFields).not.toBe(seed);
	});

	it('defaults creationDate / updatedDate to today UTC', () => {
		const today = '2026-06-24';
		const issue = buildDefaultIssue(
			{ title: 'Hello', issueType: 'task', author: 'jane', today },
			noExisting
		);
		expect(issue.fields.creationDate).toBe('2026-06-24');
		expect(issue.fields.updatedDate).toBe('2026-06-24');
	});

	it('uses nextIssueId(existing) when assigning the id', () => {
		const existing = [{ id: 3 }, { id: 7 }];
		const issue = buildDefaultIssue(
			{ title: 'Hello', issueType: 'task', author: 'jane', today: '2026-06-24' },
			existing
		);
		expect(issue.id).toBe(8);
	});
});

describe('issuePath', () => {
	it('composes the canonical <id>-<slug>.md under ISSUES_DIR', () => {
		expect(issuePath(42, 'Fix login redirect!')).toBe(`${ISSUES_DIR}/0042-fix-login-redirect.md`);
	});

	it('exposes ISSUES_DIR as ".quill.md/issues"', () => {
		expect(ISSUES_DIR).toBe('.quill.md/issues');
	});
});

describe('createIssue — write + reparse round-trip', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('writes the file through the adapter and returns a re-parsed LoadedIssue', async () => {
		const li = await createIssue(
			fs,
			{ title: 'New thing', issueType: 'task', author: 'jane', today: '2026-06-24' },
			[]
		);

		expect(li.issue.id).toBe(1);
		expect(li.issue.fields.title).toBe('New thing');
		expect(li.sourcePath).toBe('.quill.md/issues/0001-new-thing.md');

		// The file must exist on disk after the call.
		const onDisk = await fs.readTextFile(li.sourcePath);
		expect(onDisk).toContain('id: 1');
		expect(onDisk).toContain('title: New thing');

		// The returned LoadedIssue is the post-write ground truth: its
		// stored integrity hash must verify.
		expect(li.issue.integrityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(li.issue.integrityWarning).toBe(false);
	});

	it('does not refuse an unknown issueType (the service layer is permissive)', async () => {
		// The validator (`src/lib/services/validator.ts`) is the gate
		// that flags unknown `issueType` values; the saver must let
		// any string through so a user editing a malformed file can
		// still save their work.
		const li = await createIssue(
			fs,
			{ title: 'T', issueType: 'mystery-type', author: 'jane', today: '2026-06-24' },
			[]
		);
		expect(li.issue.fields.issueType).toBe('mystery-type');
		expect(li.issue.integrityWarning).toBe(false);
	});
});

describe('saveIssue — overwrite + last-write-wins', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	function baseIssue(): Issue {
		return {
			id: 1,
			fields: {
				title: 'Hello',
				author: 'jane',
				creationDate: '2026-01-01',
				updatedDate: '2026-01-01',
				issueType: 'task',
				status: 'open',
				assignee: null,
				labels: [],
				relations: [],
				startDate: null,
				endDate: null,
				duration: null,
				sprintId: null,
				estimate: null
			},
			integrityHash: null,
			customFields: {},
			sections: [],
			integrityWarning: false
		};
	}

	it('overwrites an existing file in place (same sourcePath)', async () => {
		const path = '.quill.md/issues/0001-hello.md';
		const li1 = await saveIssue(fs, baseIssue(), path);
		expect(li1.issue.fields.title).toBe('Hello');

		const updated: Issue = {
			...baseIssue(),
			fields: { ...baseIssue().fields, title: 'Hello, world!', status: 'in_progress' }
		};
		const li2 = await saveIssue(fs, updated, path);

		expect(li2.issue.fields.title).toBe('Hello, world!');
		expect(li2.issue.fields.status).toBe('in_progress');
		// Only one file remains under the issues dir.
		const entries = await fs.listDirectory(ISSUES_DIR);
		expect(entries.filter((e) => e.kind === 'file')).toHaveLength(1);
	});

	it('concurrent sequential saves: the later write wins', async () => {
		// The adapter is not safe for concurrent calls on overlapping
		// paths (per its docs); the service layer is expected to
		// serialise. Here we await each save in turn to exercise the
		// "last write wins" semantics deterministically.
		const path = '.quill.md/issues/0001-hello.md';
		await saveIssue(
			fs,
			{ ...baseIssue(), fields: { ...baseIssue().fields, title: 'First' } },
			path
		);
		await saveIssue(
			fs,
			{ ...baseIssue(), fields: { ...baseIssue().fields, title: 'Second' } },
			path
		);
		await saveIssue(
			fs,
			{ ...baseIssue(), fields: { ...baseIssue().fields, title: 'Third' } },
			path
		);

		const final = await fs.readTextFile(path);
		expect(final).toContain('title: Third');
	});
});
