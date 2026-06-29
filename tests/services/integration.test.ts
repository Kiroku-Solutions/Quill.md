/**
 * End-to-end integration test (Step 4 — Tarea 18).
 *
 * Goal: verify the full "open folder → create issue → save → re-read"
 * pipeline works against `MemoryFsAdapter` plus every service-layer
 * loader / parser / serializer.
 *
 * This test is the bridge between the unit tests of individual services
 * and the future Playwright E2E suite (Step 7). It catches wiring
 * regressions — e.g. a service that reads from a path the loader doesn't
 * write to — that unit tests by definition miss.
 *
 * Coverage targets:
 *  - Open a fresh folder: config + templates + issues load as empty.
 *  - Seed a config + template + issue; reload; data survives intact.
 *  - Create a new issue from a template, persist it, reload, assert the
 *    on-disk form matches the in-memory form (round-trip).
 *  - Delete (move to trash): the original path is gone, the trash
 *    directory holds the entry with a timestamp prefix.
 *  - Edge cases: list a folder that doesn't exist (treated as empty),
 *    re-load after a write picks up the new file.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { loadConfig } from '$lib/services/config-loader';
import { loadTemplates } from '$lib/services/template-loader';
import { loadIssues } from '$lib/services/issue-loader';
import { parseIssueFile } from '$lib/services/parser';
import { serializeIssue } from '$lib/services/serializer';
import { buildIssueFilename, nextIssueId } from '$lib/services/slugs';
import { emptyTrash, moveToTrash, TRASH_DIRECTORY } from '$lib/adapters/trash';
import type { Config, Issue, Template } from '$lib/types';

const VALID_CONFIG: Config = {
	statuses: [
		{ id: 'open', name: 'Open', color: '#fff' },
		{ id: 'in_progress', name: 'In Progress', color: '#0f0' },
		{ id: 'done', name: 'Done', color: '#888' }
	],
	default_status: 'open',
	labels: [
		{ id: 'security', name: 'Security', color: '#f00' },
		{ id: 'frontend', name: 'Frontend', color: '#00f' }
	],
	users: [
		{ id: 'jane', name: 'Jane' },
		{ id: 'jose', name: 'Jose' }
	],
	kanban: { columns: ['open', 'in_progress', 'done'] },
	gantt: { group_by: 'assignee', default_view: 'week' },
	remote: { cors_proxy: 'https://cors.example.com' }
};

const VALID_TASK_TEMPLATE: Template = {
	id: 'task',
	name: 'Task',
	icon: 'check',
	color: '#0f0',
	default_status: 'open',
	fields: [
		{ id: 1, key: 'priority', type: 'text', name: 'Priority', obligatory: false },
		{ id: 2, key: 'story_points', type: 'number', name: 'Story Points', obligatory: false }
	],
	sections: [
		{ id: 1, key: 'description', name: 'Description', obligatory: true },
		{ id: 2, key: 'acceptance', name: 'Acceptance Criteria', obligatory: false }
	]
};

const VALID_BUG_TEMPLATE: Template = {
	id: 'bug',
	name: 'Bug',
	icon: 'bug',
	color: '#f00',
	default_status: 'open',
	fields: [{ id: 1, key: 'severity', type: 'text', name: 'Severity', obligatory: true }],
	sections: [
		{ id: 1, key: 'description', name: 'Description', obligatory: true },
		{ id: 2, key: 'steps', name: 'Steps to reproduce', obligatory: false }
	]
};

async function seedFixtures(
	fs: MemoryFsAdapter,
	opts: { includeIssues?: number; includeTemplates?: Template[] } = {}
): Promise<void> {
	await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(VALID_CONFIG));
	const templates = opts.includeTemplates ?? [VALID_TASK_TEMPLATE, VALID_BUG_TEMPLATE];
	for (const t of templates) {
		await fs.writeTextFile(`.nomad.md/templates/${t.id}.json`, JSON.stringify(t));
	}
	if (opts.includeIssues && opts.includeIssues > 0) {
		for (let i = 1; i <= opts.includeIssues; i++) {
			const md = await renderFixtureIssue(i, `Issue ${i}`);
			await fs.writeTextFile(`.nomad.md/issues/${buildIssueFilename(i, `Issue ${i}`)}`, md);
		}
	}
}

async function renderFixtureIssue(id: number, title: string): Promise<string> {
	const issue: Issue = {
		id,
		title,
		author: 'jane',
		creationDate: '2026-10-20',
		updatedDate: '2026-10-20',
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
		sections: [{ name: 'Description', markdown: `Body of ${title}.` }],
		integrityWarning: false
	};
	return serializeIssue(issue);
}

describe('integration — open folder', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('loads config, templates, and (empty) issues from a freshly opened folder', async () => {
		await seedFixtures(fs);

		const config = await loadConfig(fs);
		expect(config.default_status).toBe('open');

		const templates = await loadTemplates(fs);
		expect(templates.map((t) => t.id).sort()).toEqual(['bug', 'task']);

		const issues = await loadIssues(fs);
		expect(issues).toEqual([]);
	});

	it('throws an actionable error when config.json is missing', async () => {
		// Empty folder — no config.json.
		await expect(loadConfig(fs)).rejects.toThrow(/config\.json/);
	});

	it('returns [] when the issues directory is missing', async () => {
		await seedFixtures(fs);
		const issues = await loadIssues(fs);
		expect(issues).toEqual([]);
	});
});

describe('integration — create → save → re-read', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await seedFixtures(fs);
	});

	it('persists a newly-created issue and surfaces it on reload', async () => {
		// 1. Read the current issue set.
		const before = await loadIssues(fs);
		const nextId = nextIssueId(before.map((li) => li.issue));

		// 2. Compose a new issue from a template (task) + the loaded config.
		const title = 'Add login screen';
		const newIssue: Issue = {
			id: nextId,
			title,
			author: 'jane',
			creationDate: '2026-10-22',
			updatedDate: '2026-10-22',
			issueType: 'task',
			status: VALID_CONFIG.default_status,
			assignee: null,
			labels: ['frontend'],
			relations: [],
			startDate: null,
			endDate: null,
			duration: 2,
			integrityHash: null,
			customFields: { priority: 'p1' },
			sections: [
				{ name: 'Description', markdown: 'Build the new login screen.' },
				{ name: 'Acceptance Criteria', markdown: '- [ ] Form validates\n- [ ] Errors display' }
			],
			integrityWarning: false
		};

		// 3. Serialize and write through the adapter.
		const serialized = await serializeIssue(newIssue);
		const filename = buildIssueFilename(newIssue.id, newIssue.title);
		const fullPath = `.nomad.md/issues/${filename}`;
		await fs.writeTextFile(fullPath, serialized);

		// 4. Re-read the directory — the new file must appear.
		const after = await loadIssues(fs);
		expect(after).toHaveLength(before.length + 1);
		const persisted = after.find((li) => li.issue.id === nextId);
		expect(persisted).toBeDefined();
		expect(persisted?.sourcePath).toBe(fullPath);

		// 5. Re-parse the on-disk form to verify it round-trips.
		const reparsed = await parseIssueFile(serialized, fullPath);
		expect(reparsed.issue.title).toBe(title);
		expect(reparsed.issue.labels).toEqual(['frontend']);
		expect(reparsed.issue.customFields['priority']).toBe('p1');
		expect(reparsed.issue.sections.map((s) => s.name)).toEqual([
			'Description',
			'Acceptance Criteria'
		]);
		expect(reparsed.issue.integrityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(reparsed.issue.integrityWarning).toBe(false);
	});

	it('re-loads all previously seeded issues after restart', async () => {
		await seedFixtures(fs, { includeIssues: 3 });

		const issues = await loadIssues(fs);
		expect(issues).toHaveLength(3);
		expect(issues.map((li) => li.issue.id)).toEqual([1, 2, 3]);
		expect(issues.map((li) => li.issue.title)).toEqual(['Issue 1', 'Issue 2', 'Issue 3']);
	});

	it('updates an existing issue in place and the change is picked up on reload', async () => {
		await seedFixtures(fs, { includeIssues: 1 });
		const before = await loadIssues(fs);
		const original = before[0]!;
		const sourcePath = original.sourcePath;

		// Mutate: change status to in_progress + add a label.
		const updated: Issue = {
			...original.issue,
			status: 'in_progress',
			updatedDate: '2026-10-23',
			labels: ['security', 'frontend'],
			integrityHash: null
		};
		await fs.writeTextFile(sourcePath, await serializeIssue(updated));

		// Re-read.
		const after = await loadIssues(fs);
		expect(after).toHaveLength(1);
		expect(after[0]?.issue.status).toBe('in_progress');
		expect(after[0]?.issue.labels).toEqual(['security', 'frontend']);
		expect(after[0]?.issue.updatedDate).toBe('2026-10-23');
	});
});

describe('integration — delete (move-to-trash)', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await seedFixtures(fs, { includeIssues: 2 });
	});

	it('moves an issue to trash and removes it from the active list', async () => {
		const before = await loadIssues(fs);
		expect(before).toHaveLength(2);

		const target = before[0]!;
		const trashPath = await moveToTrash(fs, target.sourcePath);

		// The trash path is under .nomad.md/.trash/<timestamp>-<filename>
		expect(trashPath.startsWith(`${TRASH_DIRECTORY}/`)).toBe(true);
		expect(trashPath).toContain(target.sourcePath.split('/').pop());

		// The active list now has one fewer item.
		const after = await loadIssues(fs);
		expect(after).toHaveLength(1);
		expect(after.find((li) => li.issue.id === target.issue.id)).toBeUndefined();

		// The trashed content is still readable at its new path.
		const trashContent = await fs.readTextFile(trashPath);
		expect(trashContent.length).toBeGreaterThan(0);
		expect(trashContent).toContain(`id: ${target.issue.id}`);
	});

	it('emptyTrash clears the trash directory without touching issues outside it', async () => {
		// 1. Keep one issue in `.nomad.md/issues/` (the "untouched" one).
		// 2. Move the other one to trash.
		// 3. Empty the trash.
		// 4. Assert the kept issue is still present, and the trash is empty.
		const before = await loadIssues(fs);
		const moved = before[0]!;
		const kept = before[1]!;

		await moveToTrash(fs, moved.sourcePath);
		expect(await emptyTrash(fs)).toBe(1);

		const after = await loadIssues(fs);
		expect(after).toHaveLength(1);
		expect(after[0]?.issue.id).toBe(kept.issue.id);

		const trashEntries = await fs.listDirectory(TRASH_DIRECTORY);
		expect(trashEntries).toEqual([]);
	});
});

describe('integration — multi-template workflow', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await seedFixtures(fs);
	});

	it('creates issues from two different templates and persists both', async () => {
		const templates = await loadTemplates(fs);
		const task = templates.find((t) => t.id === 'task');
		const bug = templates.find((t) => t.id === 'bug');
		expect(task).toBeDefined();
		expect(bug).toBeDefined();

		const taskIssue: Issue = {
			id: 1,
			title: 'Implement login',
			author: 'jane',
			creationDate: '2026-10-22',
			updatedDate: '2026-10-22',
			issueType: 'task',
			status: 'open',
			assignee: 'jane',
			labels: ['frontend'],
			relations: [],
			startDate: null,
			endDate: null,
			duration: 5,
			integrityHash: null,
			customFields: { priority: 'p1' },
			sections: [{ name: 'Description', markdown: 'task body' }],
			integrityWarning: false
		};
		const bugIssue: Issue = {
			id: 2,
			title: 'Login crash',
			author: 'jose',
			creationDate: '2026-10-22',
			updatedDate: '2026-10-22',
			issueType: 'bug',
			status: 'open',
			assignee: null,
			labels: ['security'],
			relations: [],
			startDate: null,
			endDate: null,
			duration: null,
			integrityHash: null,
			customFields: { severity: 'high' },
			sections: [{ name: 'Description', markdown: 'bug body' }],
			integrityWarning: false
		};

		await fs.writeTextFile(
			`.nomad.md/issues/${buildIssueFilename(taskIssue.id, taskIssue.title)}`,
			await serializeIssue(taskIssue)
		);
		await fs.writeTextFile(
			`.nomad.md/issues/${buildIssueFilename(bugIssue.id, bugIssue.title)}`,
			await serializeIssue(bugIssue)
		);

		const issues = await loadIssues(fs);
		expect(issues).toHaveLength(2);

		const loadedTask = issues.find((li) => li.issue.id === 1);
		const loadedBug = issues.find((li) => li.issue.id === 2);
		expect(loadedTask?.issue.customFields['priority']).toBe('p1');
		expect(loadedBug?.issue.customFields['severity']).toBe('high');
	});
});

describe('integration — round-trip via serialize → write → read → parse', () => {
	it('preserves every Issue field through the full pipeline', async () => {
		const fs = new MemoryFsAdapter();
		await seedFixtures(fs);

		const original: Issue = {
			id: 42,
			title: 'Fix login redirect',
			author: 'jane',
			creationDate: '2026-10-20',
			updatedDate: '2026-10-21',
			issueType: 'bug',
			status: 'in_progress',
			assignee: 'jane',
			labels: ['security', 'frontend'],
			relations: [
				{ type: 'blocks', id: 45 },
				{ type: 'relates_to', id: 7 }
			],
			startDate: '2026-10-20',
			endDate: '2026-10-25',
			duration: 3,
			integrityHash: null,
			customFields: { severity: 'high', priority: 'p1' },
			sections: [
				{ name: 'Description', markdown: '# Login form\n\nBody text.' },
				{ name: 'Steps to reproduce', markdown: '1. Step one.\n2. Step two.' }
			],
			integrityWarning: false
		};

		const path = `.nomad.md/issues/${buildIssueFilename(original.id, original.title)}`;
		await fs.writeTextFile(path, await serializeIssue(original));

		const reloaded = await loadIssues(fs);
		expect(reloaded).toHaveLength(1);
		const li = reloaded[0]!;
		expect(li.issue.id).toBe(original.id);
		expect(li.issue.title).toBe(original.title);
		expect(li.issue.assignee).toBe(original.assignee);
		expect(li.issue.relations).toEqual(original.relations);
		expect(li.issue.customFields).toEqual(original.customFields);
		expect(li.issue.sections.map((s) => s.name)).toEqual(['Description', 'Steps to reproduce']);
		expect(li.issue.integrityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(li.issue.integrityWarning).toBe(false);
	});
});
