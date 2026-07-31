import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createTodoStore } from '../../src/lib/state/todo.svelte';
import { MemoryFsAdapter } from '../../src/lib/adapters/memory-fs';

vi.mock('../../src/lib/state/_context.ts', () => ({
	assertBrowser: () => {}
}));

describe('TodoStore', () => {
	let adapter: MemoryFsAdapter;

	beforeEach(() => {
		adapter = new MemoryFsAdapter();
	});

	it('loads empty when no files exist', async () => {
		expect.assertions(2);
		const store = createTodoStore();
		await store.load(adapter);
		expect(store.lists).toEqual([]);
		expect(store.activeListId).toBeNull();
	});

	it('loads existing files and auto-selects the first one', async () => {
		expect.assertions(3);
		await adapter.writeTextFile(
			'.quill.md/todos/backend.md',
			'# Backend Tasks\n- [x] existing task'
		);
		const store = createTodoStore();
		await store.load(adapter);
		expect(store.lists).toEqual([{ id: 'backend.md', name: 'Backend Tasks' }]);
		expect(store.activeListId).toBe('backend.md');
		expect(store.content).toContain('existing task');
	});

	it('creates a new list', async () => {
		expect.assertions(3);
		const store = createTodoStore();
		await store.load(adapter);
		await store.createList(adapter, 'frontend.md', 'Frontend Tasks');

		expect(store.lists).toEqual([{ id: 'frontend.md', name: 'Frontend Tasks' }]);
		expect(store.activeListId).toBe('frontend.md');
		expect(store.content).toContain('# Frontend Tasks');
	});

	it('saves content to active file', async () => {
		expect.assertions(2);
		const store = createTodoStore();
		await store.load(adapter);
		await store.createList(adapter, 'test.md', 'Test List');
		await store.save(adapter, '# New Title\n- [ ] new task');

		expect(store.content).toBe('# New Title\n- [ ] new task');
		const saved = await adapter.readTextFile('.quill.md/todos/test.md');
		expect(saved).toBe('# New Title\n- [ ] new task');
	});

	it('renames list and updates H1', async () => {
		expect.assertions(3);
		const store = createTodoStore();
		await store.load(adapter);
		await store.createList(adapter, 'test.md', 'Test List');
		await store.renameList(adapter, 'test.md', 'renamed.md', 'Renamed List');

		expect(store.lists).toEqual([{ id: 'renamed.md', name: 'Renamed List' }]);
		expect(store.activeListId).toBe('renamed.md');
		expect(store.content).toContain('# Renamed List');
	});

	it('deletes list', async () => {
		expect.assertions(2);
		const store = createTodoStore();
		await store.load(adapter);
		await store.createList(adapter, 'test.md', 'Test List');
		await store.deleteList(adapter, 'test.md');

		expect(store.lists).toEqual([]);
		expect(store.activeListId).toBeNull();
	});
});
