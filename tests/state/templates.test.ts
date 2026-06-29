/**
 * Tests for the templates store.
 *
 * Coverage targets:
 *  - load() with two valid template JSON files populates `templates`,
 *    sorted by id.
 *  - `byType` is a Map keyed by template id with the same content as
 *    `templates`.
 *  - load() with no templates directory returns `templates: []`,
 *    `status: 'ready'`, `error: null`.
 *  - load() with malformed JSON surfaces `status: 'error'`,
 *    `error instanceof Error`.
 *  - load() with a template missing a required field surfaces
 *    `status: 'error'`.
 *  - Supersede: two concurrent load() calls; the second wins.
 *  - Null adapter provider → status stays `idle`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTemplatesStore } from '$lib/state';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';

const VALID_BUG = JSON.stringify({
	id: 'bug',
	name: 'Bug',
	icon: 'bug',
	color: '#f00',
	default_status: 'open',
	fields: [
		{ id: 1, key: 'severity', type: 'text', name: 'Severity', obligatory: false },
		{ id: 2, key: 'steps', type: 'longtext', name: 'Steps', obligatory: true }
	],
	sections: [
		{ id: 1, key: 'description', name: 'Description', obligatory: true },
		{ id: 2, key: 'steps', name: 'Steps to reproduce', obligatory: false }
	]
});

const VALID_TASK = JSON.stringify({
	id: 'task',
	name: 'Task',
	icon: 'check',
	color: '#0f0',
	default_status: 'todo',
	fields: [{ id: 1, key: 'priority', type: 'text', name: 'Priority', obligatory: false }],
	sections: [{ id: 1, key: 'description', name: 'Description', obligatory: true }]
});

describe('createTemplatesStore — happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);
		await fs.writeTextFile('.nomad.md/templates/task.json', VALID_TASK);
	});

	it('returns the parsed templates sorted by id', async () => {
		const store = createTemplatesStore(() => fs);
		expect(store.status).toBe('idle');
		await store.load();
		expect(store.status).toBe('ready');
		expect(store.templates).toHaveLength(2);
		expect(store.templates.map((t) => t.id)).toEqual(['bug', 'task']);
		expect(store.error).toBeNull();
	});

	it('byType is a Map keyed by template id with the same content', async () => {
		const store = createTemplatesStore(() => fs);
		await store.load();
		const map = store.byType;
		expect(map).toBeInstanceOf(Map);
		expect(map.size).toBe(2);
		expect(map.get('bug')?.name).toBe('Bug');
		expect(map.get('task')?.name).toBe('Task');
		// Same content as `templates` — sanity-check via structural equality.
		expect([...map.values()]).toEqual(store.templates);
	});

	it('reload() is an alias for load()', async () => {
		const store = createTemplatesStore(() => fs);
		await store.reload();
		expect(store.status).toBe('ready');
		expect(store.templates).toHaveLength(2);
	});
});

describe('createTemplatesStore — missing directory', () => {
	it('returns templates=[], status=ready, error=null (FR-11 wizard path)', async () => {
		// `MemoryFsAdapter.listDirectory` auto-creates directories and returns
		// [], so this exercises the in-memory path. The production missing-dir
		// path (FSA throws ENOENT, loader wraps it with "Could not list
		// .nomad.md/templates:") is exercised by the next test.
		const fs = new MemoryFsAdapter();
		const store = createTemplatesStore(() => fs);
		await store.load();
		expect(store.status).toBe('ready');
		expect(store.templates).toEqual([]);
		expect(store.error).toBeNull();
		expect(store.byType.size).toBe(0);
	});

	it('returns templates=[] when the adapter throws ENOENT (production path)', async () => {
		const throwingAdapter = {
			listDirectory: () => Promise.reject(new Error('ENOENT: no such file or directory'))
		} as unknown as MemoryFsAdapter;
		const store = createTemplatesStore(() => throwingAdapter);
		await store.load();
		expect(store.status).toBe('ready');
		expect(store.templates).toEqual([]);
		expect(store.error).toBeNull();
	});
});

describe('createTemplatesStore — malformed file', () => {
	it('surfaces status=error and error instanceof Error on malformed JSON', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/templates/bug.json', '{ not json');
		const store = createTemplatesStore(() => fs);
		await store.load();
		expect(store.status).toBe('error');
		expect(store.error).toBeInstanceOf(Error);
		expect(store.templates).toEqual([]);
	});

	it('surfaces status=error when a required field is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = JSON.parse(VALID_BUG) as Record<string, unknown>;
		delete bad['id'];
		await fs.writeTextFile('.nomad.md/templates/bug.json', JSON.stringify(bad));
		const store = createTemplatesStore(() => fs);
		await store.load();
		expect(store.status).toBe('error');
		expect(store.error).toBeInstanceOf(Error);
		expect(store.error?.message).toMatch(/"id"/);
		expect(store.templates).toEqual([]);
	});
});

describe('createTemplatesStore — supersede', () => {
	it('a second load() supersedes the first; the first does not flip status', async () => {
		// Adapter 1: no templates (resolves to ready:[] quickly).
		// Adapter 2: two valid templates (the winner).
		// We call load() twice in quick succession and verify that the final
		// state reflects adapter 2 — the supersede contract.
		const fs1 = new MemoryFsAdapter();
		const fs2 = new MemoryFsAdapter();
		await fs2.writeTextFile('.nomad.md/templates/bug.json', VALID_BUG);
		await fs2.writeTextFile('.nomad.md/templates/task.json', VALID_TASK);

		let currentAdapter: MemoryFsAdapter = fs1;
		const store = createTemplatesStore(() => currentAdapter);

		const p1 = store.load();
		// Swap the adapter mid-flight to simulate a folder switch.
		currentAdapter = fs2;
		const p2 = store.load();

		await Promise.all([p1, p2]);
		expect(store.status).toBe('ready');
		expect(store.templates).toHaveLength(2);
		expect(store.templates.map((t) => t.id)).toEqual(['bug', 'task']);
	});
});

describe('createTemplatesStore — no adapter', () => {
	it('stays idle when the provider returns null', async () => {
		const store = createTemplatesStore(() => null);
		await store.load();
		expect(store.status).toBe('idle');
		expect(store.templates).toEqual([]);
		expect(store.error).toBeNull();
	});
});
