import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { StoreGraph } from '$lib/state';
import AdrView from '$lib/components/AdrView.svelte';

let activeStub: StoreGraph | null = null;
vi.mock('$lib/state', () => ({
	getStores: () => {
		if (!activeStub) {
			throw new Error('Mock: getStores() called before stub was set.');
		}
		return activeStub;
	}
}));

vi.mock('$lib/ui/strings', () => ({
	t: (key: string, opts: any) => opts?.default || key
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
            .filter(p => p.startsWith(path + '/'))
            .map(p => ({
                name: p.split('/').pop()!,
                kind: 'file' as const
            }));
	}
}

describe('AdrView', () => {
    let mockAdapter: MockAdapter;

    beforeEach(() => {
        mockAdapter = new MockAdapter();
        activeStub = {
            mode: {
                mode: 'local',
                isReadOnly: false,
                localAdapter: mockAdapter as any,
                remoteAdapter: null as any
            }
        } as unknown as StoreGraph;
    });

	it('renders empty state initially', async () => {
		render(AdrView);
		await expect.element(page.getByText('No ADRs found.')).toBeInTheDocument();
	});

	it('hides Save and Lock buttons for immutable document', async () => {
        mockAdapter.files.set('.quill.md/adr/0001.md', '---\nid: "123"\nimmutable: true\nintegrity_hash: "sha256:495bcbe091ba8fa632ba5f98ce3ff7090b6a6c09b85c3f3ab66a7b74bdba9bdf"\n---\n\nTest');
		render(AdrView);
        
        await page.getByText('0001.md').click();
		await expect.element(page.getByText('Immutable')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Lock Document' })).not.toBeInTheDocument();
	});

    it('shows Integrity Warning when file is corrupted', async () => {
        mockAdapter.files.set('.quill.md/adr/corrupt.md', '---\nid: "123"\nimmutable: true\nintegrity_hash: "sha256:fakehash"\n---\n\nModified content');
		render(AdrView);
        
        await page.getByText('corrupt.md').click();
		await expect.element(page.getByText('integrity.editorWarning')).toBeInTheDocument();
	});
});
