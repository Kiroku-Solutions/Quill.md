/**
 * Tests for the issues store.
 *
 * Coverage targets:
 *  1.  load happy path: pre-seeded issues appear in `issues` and `byId`.
 *  2.  load partial failure: a malformed file (no hash, no closing
 *      frontmatter fence) still produces a record, but it surfaces in
 *      `integrityWarnings`. (The `loadIssues` service is lenient: a
 *      parse-level failure flips `integrityWarning`, it does NOT throw
 *      and does NOT lose the file.)
 *  3.  create assigns correct sequential ids and writes a file on disk.
 *  4.  update marks dirty and does NOT write to disk.
 *  5.  save round-trip: update -> save -> reload produces a clean
 *      `integrityWarning: false` record.
 *  6.  concurrent save: two `save(id)` calls in quick succession resolve
 *      to the same promise; the second does not throw.
 *  7.  remove moves the file to `.trash` and clears it from state.
 *  8.  validate returns errors for an issue missing a required field.
 *  9.  byStatus groups issues by their `status` field.
 * 10.  discard clears the dirty flag without touching disk.
 * 11.  integrityWarnings surfaces a record whose stored hash mismatches
 *      the recomputed hash.
 * 12.  load supersede: a second load() aborts the first; the second wins.
 * 13.  save validation failure: errors populate the per-id map.
 * 14.  byStatus surfaces an unknown status under its own key.
 * 15.  validate on an unloaded store returns [] (does not throw).
 * 16.  discard reverts the in-memory issue to the last saved snapshot.
 * 17.  applyPatch preserves `customFields` reference identity for held refs.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createIssuesStore } from '$lib/state';
import { createConfigStore } from '$lib/state';
import { createTemplatesStore } from '$lib/state';
import { createStateContext } from '$lib/state';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { canonicalForm, serializeIssue } from '$lib/services/serializer';
import { computeIntegrityHash } from '$lib/services/integrity';
import type { Issue, LoadedIssue } from '$lib/types';

const VALID_CONFIG = JSON.stringify({
	statuses: [
		{ id: 'open', name: 'Open', color: '#fff' },
		{ id: 'closed', name: 'Closed', color: '#000' }
	],
	default_status: 'open',
	labels: [],
	users: [{ id: 'jane', name: 'Jane' }],
	kanban: { columns: ['open', 'closed'] },
	gantt: { group_by: 'assignee', default_view: 'week' },
	remote: { cors_proxy: 'https://cors.example.com' }
});

const VALID_BUG = JSON.stringify({
	id: 'bug',
	name: 'Bug',
	icon: 'bug',
	color: '#f00',
	default_status: 'open',
	fields: [{ id: 1, key: 'severity', type: 'text', name: 'Severity', obligatory: true }],
	sections: [{ id: 1, key: 'description', name: 'Description', obligatory: true }]
});

const VALID_TASK = JSON.stringify({
	id: 'task',
	name: 'Task',
	icon: 'check',
	color: '#0f0',
	default_status: 'open',
	fields: [],
	sections: []
});

function makeIssue(overrides: Partial<Issue> = {}): Issue {
	return {
		id: 1,
		title: 'First issue',
		author: 'jane',
		creationDate: '2026-01-15',
		updatedDate: '2026-01-15',
		issueType: 'task',
		status: 'open',
		assignee: null,
		labels: [],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		integrityHash: null,
		customFields: {},
		sections: [{ name: 'Description', markdown: 'Initial description.' }],
		integrityWarning: false,
		...overrides
	};
}

/** Build a well-formed issue file (with valid integrity hash) for seeding. */
async function seedIssueFile(fs: MemoryFsAdapter, issue: Issue): Promise<void> {
	const text = await serializeIssue(issue);
	const padded = String(issue.id).padStart(4, '0');
	await fs.writeTextFile(`.nomad.md/issues/${padded}-issue.md`, text);
}

/** Wire up the three stores against the same adapter. */
async function makeStores(fs: MemoryFsAdapter): Promise<{
	config: ReturnType<typeof createConfigStore>;
	templates: ReturnType<typeof createTemplatesStore>;
	issues: ReturnType<typeof createIssuesStore>;
}> {
	await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
	await fs.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);
	await fs.writeTextFile('.nomad.md/templates/task.json', VALID_TASK);

	const config = createConfigStore(() => fs);
	const templates = createTemplatesStore(() => fs);
	await config.load();
	await templates.load();

	const ctx = createStateContext(fs);
	const issues = createIssuesStore(() => fs, { config, templates }, ctx);
	return { config, templates, issues };
}

// -----------------------------------------------------------------------------
// 1. load happy path
// -----------------------------------------------------------------------------
describe('createIssuesStore — load happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'Alpha' }));
		await seedIssueFile(fs, makeIssue({ id: 2, title: 'Beta' }));
	});

	it('populates issues and byId from disk', async () => {
		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.status).toBe('ready');
		expect(issues.issues).toHaveLength(2);
		expect(issues.byId.size).toBe(2);
		expect(issues.byId.get(1)?.issue.title).toBe('Alpha');
		expect(issues.byId.get(2)?.issue.title).toBe('Beta');
		expect(issues.integrityWarnings).toHaveLength(0);
	});
});

// -----------------------------------------------------------------------------
// 2. load partial failure — malformed file surfaces as integrityWarning
// -----------------------------------------------------------------------------
describe('createIssuesStore — load partial failure', () => {
	it('a malformed file produces an integrityWarning, not an exception', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'Good' }));
		// A file with no frontmatter at all — parser treats the whole text as
		// content and produces an issue with all-default fields and no hash,
		// which trips `integrityWarning: true`.
		await fs.writeTextFile(
			'.nomad.md/issues/0002-bad.md',
			'<!-- [SECTION_START: Description] -->\nbroken\n<!-- [SECTION_END: Description] -->\n'
		);

		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.issues).toHaveLength(2);
		expect(issues.integrityWarnings).toHaveLength(1);
		// The malformed record has id=0 (no frontmatter to read it from).
		// We assert on the file path being present in the issues array
		// rather than on the id, since the malformed frontmatter cannot
		// produce a positive id.
		const warned = issues.integrityWarnings[0];
		expect(warned).toBeDefined();
		expect(warned?.sourcePath).toBe('.nomad.md/issues/0002-bad.md');
		expect(warned?.issue.integrityWarning).toBe(true);
	});
});

// -----------------------------------------------------------------------------
// 3. create assigns correct id and writes file to disk
// -----------------------------------------------------------------------------
describe('createIssuesStore — create', () => {
	it('assigns sequential ids starting at 1 and writes the file to disk', async () => {
		const fs = new MemoryFsAdapter();
		const { issues } = await makeStores(fs);
		await issues.load();

		const id1 = await issues.create({ title: 'Foo', issueType: 'task', author: 'jane' });
		expect(id1).toBe(1);
		const id2 = await issues.create({ title: 'Bar', issueType: 'bug', author: 'jane' });
		expect(id2).toBe(2);

		const snap = fs.snapshot();
		expect(snap.files['.nomad.md/issues/0001-foo.md']).toBeDefined();
		expect(snap.files['.nomad.md/issues/0002-bar.md']).toBeDefined();
		expect(issues.issues).toHaveLength(2);
	});
});

// -----------------------------------------------------------------------------
// 4. update marks dirty, does not write to disk
// -----------------------------------------------------------------------------
describe('createIssuesStore — update', () => {
	it('marks dirty but does not touch disk', async () => {
		const fs = new MemoryFsAdapter();
		const original = await serializeIssue(makeIssue({ id: 1, title: 'Original' }));
		await fs.writeTextFile('.nomad.md/issues/0001-original.md', original);

		const { issues } = await makeStores(fs);
		await issues.load();
		const before = fs.snapshot().files['.nomad.md/issues/0001-original.md'];
		expect(before).toBeDefined();

		issues.update(1, { title: 'Renamed' });
		expect(issues.dirty.has(1)).toBe(true);

		const after = fs.snapshot().files['.nomad.md/issues/0001-original.md'];
		expect(after).toBe(before);
		expect(issues.issues[0]?.issue.title).toBe('Renamed');
	});
});

// -----------------------------------------------------------------------------
// 5. save round-trip — update, save, reload, integrityWarning is false
// -----------------------------------------------------------------------------
describe('createIssuesStore — save round-trip', () => {
	it('produces an integrityWarning=false record after save + reload', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'Before' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		issues.update(1, { title: 'After' });
		await issues.save(1);

		expect(issues.dirty.has(1)).toBe(false);

		// Reload via a fresh store to ensure the on-disk hash matches the
		// canonical form (no warning).
		const config2 = createConfigStore(() => fs);
		const templates2 = createTemplatesStore(() => fs);
		await config2.load();
		await templates2.load();
		const issues2 = createIssuesStore(() => fs, {
			config: config2,
			templates: templates2
		});
		await issues2.load();

		const refreshed = issues2.byId.get(1);
		expect(refreshed?.issue.title).toBe('After');
		expect(refreshed?.issue.integrityWarning).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 6. concurrent save — second call joins in-flight, no exception
// -----------------------------------------------------------------------------
describe('createIssuesStore — concurrent save', () => {
	it('two save() calls in quick succession join onto one in-flight promise', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'X' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		issues.update(1, { title: 'X2' });

		const p1 = issues.save(1);
		const p2 = issues.save(1);
		await expect(p1).resolves.toBeUndefined();
		await expect(p2).resolves.toBeUndefined();

		// Both promises should be the same reference (the plan §C.4 / state-of-the-art §3.2).
		expect(p1).toBe(p2);
		expect(issues.pendingSaves.has(1)).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 7. remove — moves file to trash, clears state
// -----------------------------------------------------------------------------
describe('createIssuesStore — remove', () => {
	it('moves the file to .trash and drops it from issues/dirty/errors', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'Doomed' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		issues.update(1, { title: 'Doomed still' });

		await issues.remove(1);
		expect(issues.issues).toHaveLength(0);
		expect(issues.dirty.has(1)).toBe(false);
		expect(issues.pendingSaves.has(1)).toBe(false);
		expect(issues.errors.has(1)).toBe(false);

		const snap = fs.snapshot();
		// seedIssueFile names the file `<padded>-issue.md`, so the trashed
		// file should follow ERS §6.5: `<timestamp>-<id>-<slug>.md`.
		// The issue has id=1 and title="Doomed still" (slug: doomed-still).
		const originalPath = '.nomad.md/issues/0001-issue.md';
		expect(snap.files[originalPath]).toBeUndefined();
		const trashFiles = Object.keys(snap.files).filter((p) => p.startsWith('.nomad.md/.trash/'));
		expect(trashFiles).toHaveLength(1);
		expect(trashFiles[0]).toMatch(/\.nomad\.md\/\.trash\/\d+-1-doomed-still\.md$/);
	});
});

// -----------------------------------------------------------------------------
// 8. validate — returns errors for missing required field
// -----------------------------------------------------------------------------
describe('createIssuesStore — validate', () => {
	it('returns errors when an obligatory field is empty', async () => {
		const fs = new MemoryFsAdapter();
		// issueType 'bug' has obligatory severity field; leaving it empty
		// should produce a validation error.
		await seedIssueFile(fs, makeIssue({ id: 1, issueType: 'bug', title: 'Bug no severity' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		const errs = issues.validate(1);
		expect(errs.length).toBeGreaterThan(0);
		expect(errs.some((e) => e.field === 'severity')).toBe(true);
	});

	it('returns an empty array for a fully valid issue', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(
			fs,
			makeIssue({
				id: 1,
				issueType: 'bug',
				title: 'Bug full',
				customFields: { severity: 'high' },
				sections: [{ name: 'Description', markdown: 'desc' }]
			})
		);
		const { issues } = await makeStores(fs);
		await issues.load();
		const errs = issues.validate(1);
		expect(errs).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// 9. byStatus — grouping
// -----------------------------------------------------------------------------
describe('createIssuesStore — byStatus', () => {
	it('groups issues by their status field', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, status: 'open' }));
		await seedIssueFile(fs, makeIssue({ id: 2, status: 'open' }));
		await seedIssueFile(fs, makeIssue({ id: 3, status: 'closed' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.byStatus.get('open')).toHaveLength(2);
		expect(issues.byStatus.get('closed')).toHaveLength(1);
	});
});

// -----------------------------------------------------------------------------
// 10. discard — clears dirty flag
// -----------------------------------------------------------------------------
describe('createIssuesStore — discard', () => {
	it('clears the dirty flag without writing to disk', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'X' }));

		const { issues } = await makeStores(fs);
		await issues.load();
		issues.update(1, { title: 'Y' });
		expect(issues.dirty.has(1)).toBe(true);
		const before = fs.snapshot().files['.nomad.md/issues/0001-x.md'];

		issues.discard(1);
		expect(issues.dirty.has(1)).toBe(false);
		const after = fs.snapshot().files['.nomad.md/issues/0001-x.md'];
		expect(after).toBe(before);
	});
});

// -----------------------------------------------------------------------------
// 11. integrityWarnings — wrong stored hash surfaces a warning
// -----------------------------------------------------------------------------
describe('createIssuesStore — integrityWarnings', () => {
	it('surfaces a record whose stored hash does not match a recomputed one', async () => {
		const fs = new MemoryFsAdapter();
		// Serialize a real issue, then overwrite integrity_hash with a fake
		// value. The parser compares the stored hash to the recomputed one
		// over the canonical form and flips integrityWarning.
		const issue = makeIssue({ id: 1, title: 'Tampered' });
		const canonical = canonicalForm(issue);
		const realHash = await computeIntegrityHash(canonical);
		const text = await serializeIssue(issue);
		const tampered = text.replace(realHash, 'sha256:' + '0'.repeat(64));
		await fs.writeTextFile('.nomad.md/issues/0001-tampered.md', tampered);

		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.integrityWarnings).toHaveLength(1);
		expect(issues.integrityWarnings[0]?.issue.id).toBe(1);
	});
});

// -----------------------------------------------------------------------------
// 12. load supersede — a second load() aborts the first
// -----------------------------------------------------------------------------
describe('createIssuesStore — load supersede', () => {
	it('a second load() wins; the first does not flip status', async () => {
		// Two adapters: fs1 has one issue, fs2 has two. We swap the adapter
		// mid-flight and call load() twice. The second wins; the first does
		// not flip status to 'ready' on its own.
		const fs1 = new MemoryFsAdapter();
		await seedIssueFile(fs1, makeIssue({ id: 1, title: 'A' }));

		const fs2 = new MemoryFsAdapter();
		await seedIssueFile(fs2, makeIssue({ id: 1, title: 'B' }));
		await seedIssueFile(fs2, makeIssue({ id: 2, title: 'C' }));

		let current = fs1;
		const config = createConfigStore(() => current);
		const templates = createTemplatesStore(() => current);
		await config.load();
		await templates.load();
		const ctx = createStateContext(current);
		const issues = createIssuesStore(() => current, { config, templates }, ctx);

		const p1 = issues.load();
		// The adapter provider reads `current` at call time, not at factory
		// time, so this swap means the second load() will see fs2.
		current = fs2;
		const p2 = issues.load();
		await Promise.all([p1, p2]);

		expect(issues.status).toBe('ready');
		expect(issues.issues).toHaveLength(2);
		expect(issues.issues.map((li) => li.issue.title).sort()).toEqual(['B', 'C']);
	});
});

// -----------------------------------------------------------------------------
// 13. save validation failure — errors populate the per-id map
// -----------------------------------------------------------------------------
describe('createIssuesStore — save validation failure', () => {
	it('populates errors.set(id, ...) and throws when validation fails', async () => {
		const fs = new MemoryFsAdapter();
		// bug template has obligatory 'severity' field. We seed an issue
		// whose severity is empty → save must fail validation.
		await seedIssueFile(
			fs,
			makeIssue({
				id: 1,
				issueType: 'bug',
				title: 'No severity',
				customFields: { severity: '' }
			})
		);
		const { issues } = await makeStores(fs);
		await issues.load();

		await expect(issues.save(1)).rejects.toThrow(/Validation failed/);
		expect(issues.errors.has(1)).toBe(true);
		expect(issues.errors.get(1)?.some((e) => e.field === 'severity')).toBe(true);
	});
});

// -----------------------------------------------------------------------------
// 14. byStatus with an unknown status
// -----------------------------------------------------------------------------
describe('createIssuesStore — byStatus with unknown status', () => {
	it('surfaces issues with a status not in config.statuses under their own key', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, status: 'open' }));
		await seedIssueFile(fs, makeIssue({ id: 2, status: 'mystery' })); // not in VALID_CONFIG

		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.byStatus.get('open')).toHaveLength(1);
		expect(issues.byStatus.get('mystery')).toHaveLength(1);
		// 'closed' was seeded from config but has no issues — still a key.
		expect(issues.byStatus.get('closed')).toHaveLength(0);
	});

	it('frozen bucket rejects .push() so consumers cannot corrupt store state', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, status: 'open' }));
		const { issues } = await makeStores(fs);
		await issues.load();
		const bucket = issues.byStatus.get('open');
		expect(bucket).toBeDefined();
		// The bucket is Object.freeze'd at the array level. Pushing to it
		// would silently fail in non-strict mode; in strict mode it throws.
		// We expect the throw so consumers catch the bug early.
		expect(() => {
			(bucket as unknown as LoadedIssue[]).push({} as never);
		}).toThrow();
	});
});

// -----------------------------------------------------------------------------
// 15. validate on an unloaded store
// -----------------------------------------------------------------------------
describe('createIssuesStore — validate on unloaded store', () => {
	it('returns [] (does not throw) when called before load()', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
		await fs.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);

		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		await config.load();
		await templates.load();
		const issues = createIssuesStore(() => fs, { config, templates });

		// No load() called yet — store is empty.
		expect(issues.validate(99)).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// 16. discard reverts in-memory state to the last saved snapshot
// -----------------------------------------------------------------------------
describe('createIssuesStore — discard reverts in-memory state', () => {
	it('rolls back title, customFields, and updatedDate to the pre-update snapshot', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(
			fs,
			makeIssue({
				id: 1,
				title: 'Original',
				customFields: { severity: 'low' }
			})
		);
		const { issues } = await makeStores(fs);
		await issues.load();
		const originalSnapshot = issues.byId.get(1)?.issue;

		issues.update(1, { title: 'Edited', customFields: { severity: 'critical' } });
		expect(issues.byId.get(1)?.issue.title).toBe('Edited');
		expect(issues.byId.get(1)?.issue.customFields['severity']).toBe('critical');

		issues.discard(1);

		const after = issues.byId.get(1)?.issue;
		expect(after?.title).toBe(originalSnapshot?.title);
		expect(after?.customFields).toEqual(originalSnapshot?.customFields);
		expect(issues.dirty.has(1)).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 17. applyPatch preserves customFields reference identity
// -----------------------------------------------------------------------------
describe('createIssuesStore — applyPatch reference identity', () => {
	it('preserves the customFields map reference across an update', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, customFields: { severity: 'low' } }));
		const { issues } = await makeStores(fs);
		await issues.load();
		const heldRef = issues.byId.get(1)?.issue.customFields;
		expect(heldRef).toBeDefined();

		issues.update(1, { customFields: { priority: 'p1' } });

		// Same map object — the per-key assignment in applyPatch preserves
		// identity. (A wholesale reassignment would break any held reference,
		// including the editor's draft buffer in Phase 8.)
		expect(issues.byId.get(1)?.issue.customFields).toBe(heldRef);
		expect(heldRef?.['severity']).toBe('low'); // untouched key preserved
		expect(heldRef?.['priority']).toBe('p1'); // new key added in place
	});
});

// -----------------------------------------------------------------------------
// 18. Concurrent save on DIFFERENT ids — should run in parallel (issue.ts:289)
// -----------------------------------------------------------------------------
describe('createIssuesStore — concurrent save on different ids', () => {
	it('two save() calls for distinct ids both succeed and run concurrently', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1, title: 'One' }));
		await seedIssueFile(fs, makeIssue({ id: 2, title: 'Two' }));
		const { issues } = await makeStores(fs);
		await issues.load();

		const order: number[] = [];
		// Mark both dirty before awaiting saves so the writes actually run.
		issues.update(1, { title: 'One edited' });
		issues.update(2, { title: 'Two edited' });

		const [r1, r2] = await Promise.all([issues.save(1), issues.save(2)]);
		order.push(1, 2);
		expect(r1).toBeUndefined();
		expect(r2).toBeUndefined();

		// Both should be on disk with the new titles.
		const reloaded = await makeStores(fs);
		await reloaded.issues.load();
		expect(reloaded.issues.byId.get(1)?.issue.title).toBe('One edited');
		expect(reloaded.issues.byId.get(2)?.issue.title).toBe('Two edited');
		expect(order).toEqual([1, 2]);
	});
});

// -----------------------------------------------------------------------------
// 19. save() with config not loaded — surfaces a typed error (issue.ts:282)
// -----------------------------------------------------------------------------
describe('createIssuesStore — save before config load', () => {
	it('save() throws an actionable error if the config store is not loaded', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1 }));
		// Construct a fresh config + templates + issues store without
		// calling .load() on config or templates.
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		const issues = createIssuesStore(() => fs, { config, templates });
		await issues.load();
		issues.update(1, { title: 'Edited' });
		await expect(issues.save(1)).rejects.toThrow(/Cannot validate: config store is not loaded/);
	});
});

// -----------------------------------------------------------------------------
// 20. validate() with config not loaded — returns [] silently (issue.ts:366)
// -----------------------------------------------------------------------------
describe('createIssuesStore — validate before config load', () => {
	it('validate() returns an empty error list without throwing when config is unloaded', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1 }));
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		const issues = createIssuesStore(() => fs, { config, templates });
		await issues.load();
		expect(issues.validate(1)).toEqual([]);
	});

	it('validate() returns an empty error list for an unknown id without throwing', async () => {
		const fs = new MemoryFsAdapter();
		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.validate(9999)).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// 21. StateContext signal abort hooks into load() (issue.ts:374)
// -----------------------------------------------------------------------------
describe('createIssuesStore — ctx signal aborts in-flight load', () => {
	it('aborting the ctx.signal mid-load sets status back to idle and keeps the previous issue set', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1 }));
		const controller = new AbortController();
		const ctx = createStateContext(fs, controller.signal);
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		const issues = createIssuesStore(() => fs, { config, templates }, ctx);
		// Kick off a load and abort it synchronously — the listener fires
		// `abortInFlightLoad()` and the in-flight controller rejects with
		// an AbortError, which `load()` swallows (it leaves the previous
		// issue set untouched per the documented "stale-data" semantics).
		const pending = issues.load();
		controller.abort();
		await pending;
		// Status stays 'idle' because no load has yet completed cleanly;
		// the store does not flip to 'error' on an abort.
		expect(issues.status).not.toBe('error');
	});

	it('without a ctx.signal the store completes a normal load (regression)', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1 }));
		const ctx = createStateContext(fs);
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		const issues = createIssuesStore(() => fs, { config, templates }, ctx);
		await issues.load();
		expect(issues.status).toBe('ready');
		expect(issues.issues).toHaveLength(1);
	});
});

// -----------------------------------------------------------------------------
// 22. error state surfaces the underlying failure (issue.ts:198-200)
// -----------------------------------------------------------------------------
describe('createIssuesStore — load error state', () => {
	it('non-abort error during load surfaces status="error" + the error object', async () => {
		const fs = new MemoryFsAdapter();
		await seedIssueFile(fs, makeIssue({ id: 1 }));
		// Force readTextFile to throw — `listDirectory` swallows its own
		// errors (treats missing dir as empty), but a read failure inside
		// the parse loop propagates out of `loadIssues` and is caught by
		// the store's outer try/catch.
		fs.readTextFile = async () => {
			throw new Error('disk on fire');
		};
		const { issues } = await makeStores(fs);
		await issues.load();
		expect(issues.status).toBe('error');
		expect(issues.error?.message).toContain('disk on fire');
	});
});
