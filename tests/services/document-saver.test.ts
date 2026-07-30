import { describe, expect, it } from 'vitest';
import { parseDocumentFile, serializeDocument, saveDocument } from '$lib/services/document-saver';
import type { WritableDirectoryAdapter, DirectoryEntry } from '$lib/adapters/directory-adapter';

class MockAdapter implements WritableDirectoryAdapter {
	private files = new Map<string, string>();
	readonly id = 'mock';

	async ensureDirectory(): Promise<void> {}
	async writeTextFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}
	async readTextFile(path: string): Promise<string> {
		if (!this.files.has(path)) throw new Error('Not found');
		return this.files.get(path)!;
	}
	async listDirectory(): Promise<DirectoryEntry[]> {
		return [];
	}
	async removeFile(path: string): Promise<void> {
		this.files.delete(path);
	}
	async moveFile(from: string, to: string): Promise<void> {
		const content = this.files.get(from);
		if (content !== undefined) {
			this.files.set(to, content);
			this.files.delete(from);
		}
	}
	watch() {
		return () => {};
	}
	getFiles() {
		return this.files;
	}
}

describe('document-saver', () => {
	it('serializeDocument injects integrity_hash correctly', async () => {
		const id = 'my-uuid-123';
		const content = '# Hello\nWorld';

		const serialized = await serializeDocument(id, false, content);

		expect(serialized).toContain('id: my-uuid-123');
		expect(serialized).toContain('immutable: false');
		expect(serialized).toContain('integrity_hash: "sha256:');
		expect(serialized).toContain(content);
	});

	it('serializeDocument includes immutable flag when true', async () => {
		const serialized = await serializeDocument('abc', true, 'content');
		expect(serialized).toContain('immutable: true');
	});

	it('parseDocumentFile verifies a valid document', async () => {
		const id = 'abc';
		const content = 'Test';
		const serialized = await serializeDocument(id, false, content);

		const parsed = await parseDocumentFile(serialized);
		expect(parsed.id).toBe(id);
		expect(parsed.immutable).toBe(false);
		expect(parsed.integrityWarning).toBe(false);
		expect(parsed.content).toBe(content);
	});

	it('parseDocumentFile flags integrity warning on modified content', async () => {
		const serialized = await serializeDocument('abc', false, 'Test');
		const modified = serialized.replace('Test', 'Modified');

		const parsed = await parseDocumentFile(modified);
		expect(parsed.integrityWarning).toBe(true);
		expect(parsed.content).toBe('Modified');
	});

	it('parseDocumentFile flags integrity warning on manually added immutable flag', async () => {
		const serialized = await serializeDocument('abc', false, 'Test');
		// Change immutable: false to true without updating hash
		const modified = serialized.replace('immutable: false', 'immutable: true');

		const parsed = await parseDocumentFile(modified);
		expect(parsed.integrityWarning).toBe(true);
		expect(parsed.immutable).toBe(true);
	});

	it('saveDocument uses the adapter to persist the document', async () => {
		const adapter = new MockAdapter();
		const doc = await saveDocument(adapter, 'dir', 'test.md', 'id-1', true, 'Content');

		expect(doc.id).toBe('id-1');
		expect(doc.immutable).toBe(true);
		expect(doc.integrityWarning).toBe(false);

		const savedContent = await adapter.readTextFile('dir/test.md');
		expect(savedContent).toContain('immutable: true');
		expect(savedContent).toContain('integrity_hash: "sha256:');
	});
});
