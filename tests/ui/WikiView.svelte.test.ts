import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { StoreGraph } from '$lib/state';
import type {
	WritableDirectoryAdapter,
	ReadOnlyDirectoryAdapter
} from '$lib/adapters/directory-adapter';
import WikiView from '$lib/components/WikiView.svelte';

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
}

describe('WikiView', () => {
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
			}
		} as unknown as StoreGraph;
	});

	it('renders empty state initially', async () => {
		render(WikiView);
		await expect.element(page.getByText('No wiki pages found.')).toBeInTheDocument();
	});

	it('hides Save and Lock buttons for immutable document', async () => {
		mockAdapter.files.set(
			'.quill.md/wiki/locked.md',
			'---\nid: "123"\nimmutable: true\nintegrity_hash: "sha256:d55ffc04a29a05c3ab6ba4b568bfd09c2777174b830ffba74dc0fcba2207b5a1"\n---\n\nTest content'
		);
		render(WikiView);

		await page.getByText('locked.md').click();
		await expect.element(page.getByText('Immutable')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Lock Document' }))
			.not.toBeInTheDocument();
	});

	it('displays Integrity Warning when file is modified manually', async () => {
		// Valid hash is different for "Modified content"
		mockAdapter.files.set(
			'.quill.md/wiki/corrupt.md',
			'---\nid: "123"\nimmutable: true\nintegrity_hash: "sha256:d55ffc04a29a05c3ab6ba4b568bfd09c2777174b830ffba74dc0fcba2207b5a1"\n---\n\nModified content'
		);
		render(WikiView);

		await page.getByText('corrupt.md').click();
		await expect.element(page.getByText('integrity.editorWarning')).toBeInTheDocument();
	});
});
