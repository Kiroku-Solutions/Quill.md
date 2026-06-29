/**
 * Tests for the editor store.
 *
 * Coverage targets:
 *  1. `open(id)` clones the source issue; mutating the draft does NOT
 *     affect `issues.byId`.
 *  2. `patchField` sets `isDirty` and updates the draft (system key + custom
 *     key both work).
 *  3. `patchSection` updates the markdown of an existing section, and
 *     appends a new section if the name is unknown.
 *  4. `save` delegates to `issues.save` and produces a re-parsed draft.
 *  5. `discard` re-clones from `issues.byId` and clears the dirty flag.
 *  6. (bonus) `errors` is recomputed from `issues.validate(activeId)`.
 *  7. (bonus) `integrityWarning` mirrors `draft.issue.integrityWarning`.
 *  8. (bonus) `close` resets the store to the empty state.
 *
 * The store gates on `assertBrowser()` indirectly through the `issues`
 * store (which gates nothing on construction), so we install a fake
 * `window` for safety.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorStore } from '$lib/state';
import { createIssuesStore } from '$lib/state';
import { createConfigStore } from '$lib/state';
import { createTemplatesStore } from '$lib/state';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { serializeIssue } from '$lib/services/serializer';
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

async function seedIssueFile(fs: MemoryFsAdapter, issue: Issue): Promise<void> {
	const text = await serializeIssue(issue);
	const padded = String(issue.id).padStart(4, '0');
	await fs.writeTextFile(`.nomad.md/issues/${padded}-issue.md`, text);
}

interface Stores {
	readonly fs: MemoryFsAdapter;
	readonly issues: ReturnType<typeof createIssuesStore>;
	readonly config: ReturnType<typeof createConfigStore>;
	readonly templates: ReturnType<typeof createTemplatesStore>;
	readonly editor: ReturnType<typeof createEditorStore>;
}

async function makeStores(seed: (fs: MemoryFsAdapter) => Promise<void>): Promise<Stores> {
	const fs = new MemoryFsAdapter();
	await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
	await fs.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);
	await fs.writeTextFile('.nomad.md/templates/task.json', VALID_TASK);
	await seed(fs);

	const config = createConfigStore(() => fs);
	const templates = createTemplatesStore(() => fs);
	await config.load();
	await templates.load();

	const issues = createIssuesStore(() => fs, { config, templates });
	await issues.load();

	const editor = createEditorStore({ issues, config, templates });
	return { fs, issues, config, templates, editor };
}

let originalWindow: unknown;
beforeEach(() => {
	originalWindow = (globalThis as { window?: unknown }).window;
	(globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => {
	(globalThis as { window?: unknown }).window = originalWindow;
});

// -----------------------------------------------------------------------------
// 1. open clones; mutating draft does not affect issues.byId
// -----------------------------------------------------------------------------
describe('createEditorStore — open', () => {
	it('clones the issue and the clone is independent of issues.byId', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, title: 'Original' }));
		});

		stores.editor.open(1);
		expect(stores.editor.activeId).toBe(1);
		expect(stores.editor.draft?.issue.title).toBe('Original');
		expect(stores.editor.isDirty).toBe(false);

		// Mutate the draft — the source must be unchanged.
		const draft = stores.editor.draft as LoadedIssue;
		draft.issue.title = 'Mutated';
		stores.editor.patchField('title', 'Mutated');
		expect(stores.editor.isDirty).toBe(true);

		expect(stores.issues.byId.get(1)?.issue.title).toBe('Original');
		// The draft has the mutation.
		expect(stores.editor.draft?.issue.title).toBe('Mutated');
	});

	it('close() on an unknown id is a no-op that resets the store', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		stores.editor.open(1);
		stores.editor.open(99); // unknown — should reset
		expect(stores.editor.activeId).toBeNull();
		expect(stores.editor.draft).toBeNull();
		expect(stores.editor.isDirty).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 2. patchField sets isDirty
// -----------------------------------------------------------------------------
describe('createEditorStore — patchField', () => {
	it('updates a system key and sets isDirty', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, title: 'A' }));
		});
		stores.editor.open(1);
		stores.editor.patchField('title', 'B');
		expect(stores.editor.draft?.issue.title).toBe('B');
		expect(stores.editor.isDirty).toBe(true);
	});

	it('updates a custom key and sets isDirty', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, customFields: { severity: 'low' } }));
		});
		stores.editor.open(1);
		stores.editor.patchField('severity', 'high');
		expect(stores.editor.draft?.issue.customFields['severity']).toBe('high');
		expect(stores.editor.isDirty).toBe(true);
	});

	it('removes a custom key when set to undefined', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, customFields: { severity: 'low' } }));
		});
		stores.editor.open(1);
		stores.editor.patchField('severity', undefined);
		expect('severity' in (stores.editor.draft?.issue.customFields ?? {})).toBe(false);
	});

	it('is a no-op when there is no active draft', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		// No open() call.
		stores.editor.patchField('title', 'B');
		expect(stores.editor.draft).toBeNull();
		expect(stores.editor.isDirty).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 3. patchSection updates or appends
// -----------------------------------------------------------------------------
describe('createEditorStore — patchSection', () => {
	it('updates the markdown of an existing section', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(
				fs,
				makeIssue({ id: 1, sections: [{ name: 'Description', markdown: 'old' }] })
			);
		});
		stores.editor.open(1);
		stores.editor.patchSection('Description', 'new');
		expect(stores.editor.draft?.issue.sections[0]?.markdown).toBe('new');
		expect(stores.editor.isDirty).toBe(true);
	});

	it('appends a new section when the name is unknown', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, sections: [] }));
		});
		stores.editor.open(1);
		stores.editor.patchSection('Acceptance', 'criteria');
		expect(stores.editor.draft?.issue.sections).toEqual([
			{ name: 'Acceptance', markdown: 'criteria' }
		]);
	});
});

// -----------------------------------------------------------------------------
// 4. save delegates to issues.save
// -----------------------------------------------------------------------------
describe('createEditorStore — save', () => {
	it('persists the draft to disk; a fresh store reads the new state', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, title: 'A' }));
		});
		stores.editor.open(1);
		stores.editor.patchField('title', 'B');
		expect(stores.editor.isDirty).toBe(true);

		await stores.editor.save();

		expect(stores.editor.isDirty).toBe(false);
		expect(stores.issues.dirty.has(1)).toBe(false);
		// On disk: the new title.
		const onDisk = stores.fs.snapshot().files['.nomad.md/issues/0001-issue.md'];
		expect(onDisk).toContain('title: B');
		// After save the draft is re-cloned from the (re-parsed) issues
		// store, so it should reflect the new state too.
		expect(stores.editor.draft?.issue.title).toBe('B');
	});

	it('is a no-op when there is no active id', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		// No open() — should resolve undefined without throwing.
		await expect(stores.editor.save()).resolves.toBeUndefined();
	});
});

// -----------------------------------------------------------------------------
// 5. discard reverts the draft
// -----------------------------------------------------------------------------
describe('createEditorStore — discard', () => {
	it('re-clones from issues.byId and clears isDirty', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, title: 'A' }));
		});
		stores.editor.open(1);
		stores.editor.patchField('title', 'B');
		expect(stores.editor.draft?.issue.title).toBe('B');
		expect(stores.editor.isDirty).toBe(true);

		stores.editor.discard();

		expect(stores.editor.draft?.issue.title).toBe('A');
		expect(stores.editor.isDirty).toBe(false);
	});

	it('does NOT affect the source issues.byId record', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1, title: 'A' }));
		});
		stores.editor.open(1);
		stores.editor.patchField('title', 'B');
		stores.editor.discard();
		// Source untouched (we never saved).
		expect(stores.issues.byId.get(1)?.issue.title).toBe('A');
	});
});

// -----------------------------------------------------------------------------
// 6. errors reflect issues.validate(activeId)
// -----------------------------------------------------------------------------
describe('createEditorStore — errors', () => {
	it('returns the validation errors for the active issue', async () => {
		const stores = await makeStores(async (fs) => {
			// issueType 'bug' with the obligatory 'severity' field missing.
			await seedIssueFile(fs, makeIssue({ id: 1, issueType: 'bug', title: 'No severity' }));
		});
		stores.editor.open(1);
		// The `errors` getter must reach through to `issues.validate(activeId)`.
		// Since the issue has no `severity` custom field, the validator
		// surfaces a "severity is required" error.
		expect(stores.editor.draft?.issue.customFields['severity']).toBeUndefined();
		const errs = stores.editor.errors;
		expect(errs.length).toBeGreaterThan(0);
		expect(errs.some((e) => e.field === 'severity')).toBe(true);
	});

	it('is an empty array when there is no active id', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		expect(stores.editor.errors).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// 7. integrityWarning mirrors draft.issue.integrityWarning
// -----------------------------------------------------------------------------
describe('createEditorStore — integrityWarning', () => {
	it('mirrors draft.issue.integrityWarning when the stored hash is corrupt', async () => {
		const stores = await makeStores(async (fs) => {
			// Serialize a real issue, then overwrite integrity_hash with a
			// fake value. The parser compares the stored hash to the
			// recomputed one over the canonical form and flips
			// integrityWarning to `true`. The editor's `integrityWarning`
			// getter is a passthrough, so it should reflect the same.
			const { canonicalForm } = await import('$lib/services/serializer');
			const { computeIntegrityHash } = await import('$lib/services/integrity');
			const issue = makeIssue({ id: 1, title: 'Tampered' });
			const canonical = canonicalForm(issue);
			const realHash = await computeIntegrityHash(canonical);
			const text = await serializeIssue(issue);
			const tampered = text.replace(realHash, 'sha256:' + '0'.repeat(64));
			await fs.writeTextFile('.nomad.md/issues/0001-issue.md', tampered);
		});
		stores.editor.open(1);
		expect(stores.editor.draft?.issue.integrityWarning).toBe(true);
		expect(stores.editor.integrityWarning).toBe(true);
	});

	it('is false for a freshly serialised issue (no corruption)', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		stores.editor.open(1);
		expect(stores.editor.integrityWarning).toBe(false);
	});

	it('is false when no draft is active', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		expect(stores.editor.integrityWarning).toBe(false);
	});
});

// -----------------------------------------------------------------------------
// 8. close() resets the store
// -----------------------------------------------------------------------------
describe('createEditorStore — close', () => {
	it('resets activeId, draft, and isDirty', async () => {
		const stores = await makeStores(async (fs) => {
			await seedIssueFile(fs, makeIssue({ id: 1 }));
		});
		stores.editor.open(1);
		stores.editor.patchField('title', 'B');
		stores.editor.close();
		expect(stores.editor.activeId).toBeNull();
		expect(stores.editor.draft).toBeNull();
		expect(stores.editor.isDirty).toBe(false);
	});
});
