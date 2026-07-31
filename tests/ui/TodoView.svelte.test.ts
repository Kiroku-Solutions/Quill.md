import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { StoreGraph } from '$lib/state';
import type {
	WritableDirectoryAdapter,
	ReadOnlyDirectoryAdapter
} from '$lib/adapters/directory-adapter';
import TodoView from '$lib/components/TodoView.svelte';
import { createTodoStore } from '$lib/state/todo.svelte';

// Create a side-effect-free stub for $lib/state
let activeStub: StoreGraph | null = null;
vi.mock('$lib/state', () => ({
	getStores: () => {
		if (!activeStub) {
			throw new Error('Mock: getStores() called before stub was set.');
		}
		return activeStub;
	}
}));

// Mock $lib/ui/strings to avoid real i18n
vi.mock('$lib/ui/strings', () => ({
	t: (key: string, opts?: { default?: string }) => opts?.default || key
}));

vi.mock('$lib/state/_context.ts', () => ({
	assertBrowser: () => {}
}));

class MockAdapter {
	files = new Map<string, string>();
	readonly id = 'mock';
	async readTextFile(path: string) {
		if (!this.files.has(path)) throw new Error('Not found');
		return this.files.get(path)!;
	}
	async writeTextFile(path: string, content: string) {
		this.files.set(path, content);
	}
	async listDirectory(path: string) {
		return Array.from(this.files.keys())
			.filter((p) => p.startsWith(path + '/'))
			.map((p) => ({
				name: p.split('/').pop()!,
				kind: 'file' as const
			}));
	}
	async removeFile(path: string) {
		this.files.delete(path);
	}
	async moveFile(oldPath: string, newPath: string) {
		const content = this.files.get(oldPath);
		if (content !== undefined) {
			this.files.set(newPath, content);
			this.files.delete(oldPath);
		}
	}
}

describe('TodoView', () => {
	let mockAdapter: MockAdapter;

	beforeEach(() => {
		mockAdapter = new MockAdapter();
		// Construct minimum StoreGraph for the test
		activeStub = {
			mode: {
				mode: 'local',
				isReadOnly: false,
				localAdapter: mockAdapter as unknown as WritableDirectoryAdapter,
				remoteAdapter: null as unknown as ReadOnlyDirectoryAdapter
			},
			todo: createTodoStore()
		} as unknown as StoreGraph;
	});

	it('renders empty state initially', async () => {
		render(TodoView);
		await expect.element(page.getByText('No To-Do lists found.')).toBeInTheDocument();
	});

	it('loads lists from adapter and auto-selects the first one', async () => {
		mockAdapter.files.set('.quill.md/todos/backend.md', '# Backend Tasks\n- [ ] Fix bugs');
		render(TodoView);

		await expect.element(page.getByText('Backend Tasks').first()).toBeInTheDocument();
		await expect.element(page.getByText('Fix bugs')).toBeInTheDocument();
	});

	it('creates a new list via prompt', async () => {
		render(TodoView);

		const originalPrompt = window.prompt;
		window.prompt = () => 'New Tasks';

		await page.getByRole('button', { name: 'New List', exact: true }).click();

		await expect.element(page.getByText('New Tasks').first()).toBeInTheDocument();
		const saved = mockAdapter.files.get('.quill.md/todos/new_tasks.md');
		expect(saved).toBe('# New Tasks\n\n- [ ] ');

		window.prompt = originalPrompt;
	});

	it('renames a list via prompt', async () => {
		mockAdapter.files.set('.quill.md/todos/backend.md', '# Backend Tasks\n- [ ] Fix bugs');
		render(TodoView);

		const originalPrompt = window.prompt;
		window.prompt = () => 'Core Tasks';

		await page.getByRole('button', { name: 'Rename' }).click();

		await expect.element(page.getByText('Core Tasks').first()).toBeInTheDocument();
		const saved = mockAdapter.files.get('.quill.md/todos/core_tasks.md');
		expect(saved).toContain('# Core Tasks');

		window.prompt = originalPrompt;
	});

	it('deletes a list via confirm', async () => {
		mockAdapter.files.set('.quill.md/todos/backend.md', '# Backend Tasks\n- [ ] Fix bugs');
		render(TodoView);

		const originalConfirm = window.confirm;
		window.confirm = () => true;

		await page.getByRole('button', { name: 'Delete' }).click();

		await expect.element(page.getByText('No To-Do lists found.')).toBeInTheDocument();
		expect(mockAdapter.files.has('.quill.md/todos/backend.md')).toBe(false);

		window.confirm = originalConfirm;
	});
});
