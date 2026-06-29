/**
 * Cross-store integration test for the state layer.
 *
 * Plan §D specifies a single integration file that wires every store
 * against a `MemoryFsAdapter` and walks through a full user journey:
 * bootstrap → load → create → edit → save → reload → assert clean.
 *
 * The `mode` store participates in the wiring (per the plan) but is
 * driven with a fake handle store so the test stays in the Node
 * environment. The assertions focus on the data path
 * (config → templates → issues → editor), which is where the
 * cross-store composition actually matters.
 *
 * Fixture: a `.nomad.md/` directory seeded with a valid `config.json`,
 * two `templates/*.json` files, and one issue file. Mirrors the
 * ERS Appendix B.6 example at a small scale.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { createModeStore } from '$lib/state';
import { createConfigStore } from '$lib/state';
import { createTemplatesStore } from '$lib/state';
import { createIssuesStore } from '$lib/state';
import { createEditorStore } from '$lib/state';
import { createStateContext } from '$lib/state';
import { serializeIssue } from '$lib/services/serializer';
import type { HandleRecord, HandleStore } from '$lib/adapters/handle-store';
import type { Issue } from '$lib/types';

// ─── Fixture ──────────────────────────────────────────────────────────────

const VALID_CONFIG = JSON.stringify({
	statuses: [
		{ id: 'open', name: 'Open', color: '#0f0' },
		{ id: 'closed', name: 'Closed', color: '#888' }
	],
	default_status: 'open',
	labels: [{ id: 'security', name: 'Security', color: '#f00' }],
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
	fields: [{ id: 1, key: 'priority', type: 'text', name: 'Priority', obligatory: false }],
	sections: [{ id: 1, key: 'description', name: 'Description', obligatory: true }]
});

function seedIssue(overrides: Partial<Issue>): Issue {
	return {
		id: 1,
		title: 'Seed issue',
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
		sections: [{ name: 'Description', markdown: 'Initial.' }],
		integrityWarning: false,
		...overrides
	};
}

function makeFakeHandleStore(): HandleStore & { active: HandleRecord | null } {
	const f = {
		active: null as HandleRecord | null,
		async getActive() {
			return f.active;
		},
		async setActive() {
			/* no-op for tests */
		},
		async clearActive() {
			f.active = null;
		},
		async getRecent() {
			return [];
		},
		async removeRecent() {
			/* no-op for tests */
		},
		async clearAll() {
			f.active = null;
		}
	};
	return f as unknown as HandleStore & { active: HandleRecord | null };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('state layer integration — full CRUD journey', () => {
	let fs: MemoryFsAdapter;
	let handles: ReturnType<typeof makeFakeHandleStore>;

	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		handles = makeFakeHandleStore();

		// Seed the virtual `.nomad.md/` directory with a valid config,
		// two templates, and one well-formed issue (so reload-after-save
		// has something to compare against).
		await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
		await fs.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);
		await fs.writeTextFile('.nomad.md/templates/task.json', VALID_TASK);

		const seedText = await serializeIssue(
			seedIssue({
				id: 1,
				title: 'Original seed',
				issueType: 'task',
				sections: [{ name: 'Description', markdown: 'Original body.' }]
			})
		);
		await fs.writeTextFile('.nomad.md/issues/0001-original-seed.md', seedText);
	});

	it('walks: bootstrap → load → create → edit → save → reload → integrity clean', async () => {
		// ── Bootstrap (mode store) ───────────────────────────────────────
		// mode is wired with a fake handle store. We don't assert on mode
		// behaviour here — the integration target is the data path. We
		// only verify the wiring type-checks and the store constructs.
		const mode = createModeStore(createStateContext(fs), { handles });
		expect(mode.mode).toBe('home'); // no active handle in the fake
		await mode.bootstrap();
		expect(mode.mode).toBe('home');

		// ── Load the data path ──────────────────────────────────────────
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		await config.load();
		await templates.load();
		expect(config.status).toBe('ready');
		expect(templates.status).toBe('ready');
		expect(templates.byType.size).toBe(2);

		const issues = createIssuesStore(() => fs, { config, templates });
		await issues.load();
		expect(issues.status).toBe('ready');
		expect(issues.issues).toHaveLength(1);
		expect(issues.byId.get(1)?.issue.title).toBe('Original seed');
		expect(issues.integrityWarnings).toHaveLength(0);

		// ── Create a new issue ──────────────────────────────────────────
		const newId = await issues.create({
			title: 'Newly created',
			issueType: 'bug',
			author: 'jane'
		});
		expect(newId).toBe(2); // next id after the seeded 1
		expect(issues.issues).toHaveLength(2);
		expect(fs.snapshot().files['.nomad.md/issues/0002-newly-created.md']).toBeDefined();

		// ── Open in the editor, patch, save ─────────────────────────────
		const editor = createEditorStore({ issues, config, templates });
		expect(editor.activeId).toBeNull();
		editor.open(newId);
		expect(editor.activeId).toBe(newId);
		expect(editor.draft?.issue.title).toBe('Newly created');
		expect(editor.isDirty).toBe(false);

		editor.patchField('title', 'Edited title');
		editor.patchField('severity', 'critical'); // custom field on bug template
		editor.patchSection('Description', 'Patched body content.');
		expect(editor.isDirty).toBe(true);
		// Note: `editor.errors` reaches through to `issues.validate(activeId)`,
		// which validates the source issue in the issues store — NOT the draft.
		// (The plan's literal API; see editor.test.ts "errors reflect
		// issues.validate(activeId)".) So the errors shown during editing
		// are the pre-patch state. The post-patch validation happens at
		// `editor.save()` time and is the assertion below.

		await editor.save();
		expect(editor.isDirty).toBe(false);

		// ── Reload via fresh stores and verify integrity is clean ───────
		const config2 = createConfigStore(() => fs);
		const templates2 = createTemplatesStore(() => fs);
		await config2.load();
		await templates2.load();
		const issues2 = createIssuesStore(() => fs, { config: config2, templates: templates2 });
		await issues2.load();

		const reloaded = issues2.byId.get(newId);
		expect(reloaded).toBeDefined();
		expect(reloaded?.issue.title).toBe('Edited title');
		expect(reloaded?.issue.customFields['severity']).toBe('critical');
		expect(reloaded?.issue.sections.find((s) => s.name === 'Description')?.markdown).toBe(
			'Patched body content.'
		);
		// The whole point: a save through the store produces a file whose
		// canonical hash matches the on-disk hash. FR-15.
		expect(reloaded?.issue.integrityWarning).toBe(false);
		expect(issues2.integrityWarnings).toHaveLength(0);

		// The seeded issue should also have stayed clean (not touched).
		const seedReloaded = issues2.byId.get(1);
		expect(seedReloaded?.issue.integrityWarning).toBe(false);

		// ── Discard (round-trip the editor) ─────────────────────────────
		editor.open(1);
		editor.patchField('title', 'Will be discarded');
		expect(editor.isDirty).toBe(true);
		editor.discard();
		expect(editor.isDirty).toBe(false);
		expect(editor.draft?.issue.title).toBe('Original seed');

		// ── Close ───────────────────────────────────────────────────────
		editor.close();
		expect(editor.activeId).toBeNull();
		expect(editor.draft).toBeNull();
	});

	it('create → save → remove: the soft-delete path cleans up state', async () => {
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		await config.load();
		await templates.load();
		const issues = createIssuesStore(() => fs, { config, templates });
		await issues.load();

		const newId = await issues.create({
			title: 'Doomed',
			issueType: 'task',
			author: 'jane'
		});
		expect(issues.issues).toHaveLength(2);

		await issues.remove(newId);
		expect(issues.issues).toHaveLength(1);
		expect(issues.byId.has(newId)).toBe(false);

		const snap = fs.snapshot();
		expect(snap.files['.nomad.md/issues/0002-doomed.md']).toBeUndefined();
		const trashFiles = Object.keys(snap.files).filter((p) => p.startsWith('.nomad.md/.trash/'));
		expect(trashFiles).toHaveLength(1);
		// ERS §6.5: `<timestamp>-<id>-<slug>.md` — id=2, slug=doomed.
		expect(trashFiles[0]).toMatch(/\.nomad\.md\/\.trash\/\d+-2-doomed\.md$/);
	});

	it('save round-trip via editor.save() preserves integrity hash (FR-15)', async () => {
		// A more focused regression: load, edit one field, save, reload,
		// assert the on-disk hash matches the recomputed hash. Mirrors the
		// plan §A.3 acceptance test #8.
		const config = createConfigStore(() => fs);
		const templates = createTemplatesStore(() => fs);
		await config.load();
		await templates.load();
		const issues = createIssuesStore(() => fs, { config, templates });
		await issues.load();

		const editor = createEditorStore({ issues, config, templates });
		editor.open(1);
		editor.patchField('title', 'Hash integrity check');
		await editor.save();

		const config2 = createConfigStore(() => fs);
		const templates2 = createTemplatesStore(() => fs);
		await config2.load();
		await templates2.load();
		const issues2 = createIssuesStore(() => fs, { config: config2, templates: templates2 });
		await issues2.load();
		expect(issues2.byId.get(1)?.issue.integrityWarning).toBe(false);
	});
});
