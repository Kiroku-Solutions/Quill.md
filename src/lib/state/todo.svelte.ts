import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';
import { assertBrowser } from './_context.ts';

const TODOS_DIR = '.quill.md/todos';

export function extractTitleFromMarkdown(content: string): string | null {
	const match = content.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : null;
}

export interface TodoListMetadata {
	id: string; // The filename e.g. "backend.md"
	name: string; // The parsed H1 or fallback
}

export interface TodoStore {
	readonly lists: TodoListMetadata[];
	readonly activeListId: string | null;
	readonly content: string;
	readonly loading: boolean;
	readonly error: string | null;

	load(adapter: ReadOnlyDirectoryAdapter): Promise<void>;
	selectList(adapter: ReadOnlyDirectoryAdapter, id: string): Promise<void>;
	createList(adapter: WritableDirectoryAdapter, id: string, name: string): Promise<void>;
	renameList(
		adapter: WritableDirectoryAdapter,
		id: string,
		newId: string,
		newName: string
	): Promise<void>;
	deleteList(adapter: WritableDirectoryAdapter, id: string): Promise<void>;
	save(adapter: WritableDirectoryAdapter, content: string): Promise<void>;
}

export function createTodoStore(): TodoStore {
	assertBrowser();

	let lists = $state<TodoListMetadata[]>([]);
	let activeListId = $state<string | null>(null);
	let content = $state<string>('');
	let loading = $state<boolean>(false);
	let error = $state<string | null>(null);

	async function load(adapter: ReadOnlyDirectoryAdapter): Promise<void> {
		loading = true;
		error = null;
		try {
			const entries = await adapter.listDirectory(TODOS_DIR);
			const loaded: TodoListMetadata[] = [];
			for (const entry of entries) {
				if (entry.kind === 'file' && entry.name.endsWith('.md')) {
					let name = entry.name.replace(/\.md$/, '');
					try {
						const fileContent = await adapter.readTextFile(`${TODOS_DIR}/${entry.name}`);
						const extracted = extractTitleFromMarkdown(fileContent);
						if (extracted) {
							name = extracted;
						}
					} catch {
						// Ignore read errors for metadata parsing
					}
					loaded.push({ id: entry.name, name });
				}
			}
			lists = loaded.sort((a, b) => a.name.localeCompare(b.name));

			if (lists.length > 0) {
				if (!activeListId || !lists.find((l) => l.id === activeListId)) {
					await selectList(adapter, lists[0].id);
				} else {
					await selectList(adapter, activeListId);
				}
			} else {
				activeListId = null;
				content = '';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function selectList(adapter: ReadOnlyDirectoryAdapter, id: string): Promise<void> {
		loading = true;
		error = null;
		try {
			content = await adapter.readTextFile(`${TODOS_DIR}/${id}`);
			activeListId = id;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			activeListId = null;
			content = '';
		} finally {
			loading = false;
		}
	}

	async function createList(
		adapter: WritableDirectoryAdapter,
		id: string,
		name: string
	): Promise<void> {
		const newContent = `# ${name}\n\n- [ ] `;
		await adapter.writeTextFile(`${TODOS_DIR}/${id}`, newContent);
		// Preemptively update state to avoid full reload
		lists = [...lists, { id, name }].sort((a, b) => a.name.localeCompare(b.name));
		await selectList(adapter, id);
	}

	async function renameList(
		adapter: WritableDirectoryAdapter,
		id: string,
		newId: string,
		newName: string
	): Promise<void> {
		const oldPath = `${TODOS_DIR}/${id}`;
		const newPath = `${TODOS_DIR}/${newId}`;
		let updatedContent = '';
		if (id !== newId) {
			await adapter.moveFile(oldPath, newPath);
		}

		// If the name changed, try to update the H1
		try {
			const currentContent = await adapter.readTextFile(newPath);
			updatedContent = currentContent.replace(/^#\s+.*$/m, `# ${newName}`);
			if (updatedContent === currentContent && !currentContent.includes('# ')) {
				updatedContent = `# ${newName}\n\n${currentContent}`;
			}
			await adapter.writeTextFile(newPath, updatedContent);
		} catch (e) {
			console.warn('Failed to update list title in file', e);
		}

		lists = lists
			.map((l) => (l.id === id ? { id: newId, name: newName } : l))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (activeListId === id) {
			activeListId = newId;
			content = updatedContent;
		}
	}

	async function deleteList(adapter: WritableDirectoryAdapter, id: string): Promise<void> {
		await adapter.removeFile(`${TODOS_DIR}/${id}`);
		lists = lists.filter((l) => l.id !== id);
		if (activeListId === id) {
			if (lists.length > 0) {
				await selectList(adapter, lists[0].id);
			} else {
				activeListId = null;
				content = '';
			}
		}
	}

	async function save(adapter: WritableDirectoryAdapter, newContent: string): Promise<void> {
		if (!activeListId) return;
		error = null;
		try {
			await adapter.writeTextFile(`${TODOS_DIR}/${activeListId}`, newContent);
			content = newContent;
			// Update the name if H1 changed
			const newName = extractTitleFromMarkdown(newContent);
			if (newName) {
				lists = lists
					.map((l) => (l.id === activeListId ? { ...l, name: newName } : l))
					.sort((a, b) => a.name.localeCompare(b.name));
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			throw err;
		}
	}

	return {
		get lists() {
			return lists;
		},
		get activeListId() {
			return activeListId;
		},
		get content() {
			return content;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		load,
		selectList,
		createList,
		renameList,
		deleteList,
		save
	};
}
