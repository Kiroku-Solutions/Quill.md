/**
 * Tests for `template-loader.ts`.
 *
 * Coverage targets:
 *  - Happy path: a valid template directory yields the parsed templates,
 *    sorted by id.
 *  - Missing directory: an actionable error.
 *  - Malformed JSON in any file aborts the load with a path-tagged error.
 *  - Every required field is validated individually.
 *  - Non-JSON files and directories are silently skipped.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { loadTemplates, TEMPLATES_DIRECTORY } from '$lib/services/template-loader';
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

describe('loadTemplates — happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('returns an empty list when the templates directory is empty', async () => {
		const list = await loadTemplates(fs);
		expect(list).toEqual([]);
	});

	it('returns the parsed templates', async () => {
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, VALID_BUG);
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/task.json`, VALID_TASK);
		const list = await loadTemplates(fs);
		expect(list).toHaveLength(2);
		expect(list.map((t) => t.id)).toEqual(['bug', 'task']);
	});

	it('sorts templates by id (lexicographic)', async () => {
		// Insert in reverse order — loader must sort.
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/task.json`, VALID_TASK);
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, VALID_BUG);
		const list = await loadTemplates(fs);
		expect(list.map((t) => t.id)).toEqual(['bug', 'task']);
	});

	it('exposes the canonical TEMPLATES_DIRECTORY', () => {
		expect(TEMPLATES_DIRECTORY).toBe('.nomad.md/templates');
	});
});

describe('loadTemplates — missing directory', () => {
	/**
	 * The MemoryFsAdapter auto-creates directories on `listDirectory`
	 * (matches the FSA behaviour), so `loadTemplates` sees an empty list
	 * and returns `[]` — not an error. The production `LocalFsAdapter`
	 * and `RemoteGitAdapter` do throw, which is the behaviour the editor
	 * relies on for the "open folder" flow. We cover that contract here
	 * by exercising a stub adapter that mimics production behaviour.
	 */
	it('returns [] when the directory is empty (auto-create semantics)', async () => {
		const fs = new MemoryFsAdapter();
		const list = await loadTemplates(fs);
		expect(list).toEqual([]);
	});

	it('throws with the path when the underlying adapter throws', async () => {
		const throwingAdapter = {
			listDirectory: () => Promise.reject(new Error('ENOENT: no such file or directory'))
		} as unknown as MemoryFsAdapter;
		await expect(loadTemplates(throwingAdapter)).rejects.toThrow(/templates/);
	});
});

describe('loadTemplates — malformed input', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('throws on malformed JSON', async () => {
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, '{ not json');
		await expect(loadTemplates(fs)).rejects.toThrow(/Malformed JSON/);
	});

	it('throws when the top-level value is not an object', async () => {
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, '"string"');
		await expect(loadTemplates(fs)).rejects.toThrow(/must be a JSON object/);
	});

	it('throws when id is missing', async () => {
		const bad = { ...JSON.parse(VALID_BUG) } as Record<string, unknown>;
		delete bad['id'];
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/"id"/);
	});

	it('throws when fields is not an array', async () => {
		const bad = { ...JSON.parse(VALID_BUG), fields: 'nope' };
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/fields/);
	});

	it('throws when a field has an unknown type', async () => {
		const bad = JSON.parse(VALID_BUG) as Record<string, unknown>;
		const fields = (bad['fields'] as Array<Record<string, unknown>>).map((f, i) =>
			i === 0 ? { ...f, type: 'frobnitz' } : f
		);
		bad['fields'] = fields;
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/type/);
	});

	it('throws when a field is missing obligatory', async () => {
		const bad = JSON.parse(VALID_BUG) as Record<string, unknown>;
		const fields = (bad['fields'] as Array<Record<string, unknown>>).map((f, i) =>
			i === 0 ? { ...f, obligatory: 'yes' as unknown as boolean } : f
		);
		bad['fields'] = fields;
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/obligatory/);
	});

	it('throws when sections is not an array', async () => {
		const bad = { ...JSON.parse(VALID_BUG), sections: 'nope' };
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/sections/);
	});

	it('rejects field.options when it is not an array', async () => {
		const bad = JSON.parse(VALID_BUG) as Record<string, unknown>;
		const fields = (bad['fields'] as Array<Record<string, unknown>>).map((f, i) =>
			i === 0 ? { ...f, options: 'nope' } : f
		);
		bad['fields'] = fields;
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, JSON.stringify(bad));
		await expect(loadTemplates(fs)).rejects.toThrow(/options/);
	});
});

describe('loadTemplates — filtering', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('skips files that do not end in .json', async () => {
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/bug.json`, VALID_BUG);
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/README.md`, '# ignore me');
		await fs.writeTextFile(`${TEMPLATES_DIRECTORY}/notes.txt`, 'ignore me');
		const list = await loadTemplates(fs);
		expect(list).toHaveLength(1);
		expect(list[0]?.id).toBe('bug');
	});
});
