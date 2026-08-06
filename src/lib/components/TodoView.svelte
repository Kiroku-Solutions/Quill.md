<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { Button, CodeMirrorEditor } from '$lib/ui';
	import MarkdownPreview from './MarkdownPreview.svelte';
	import Check from '@lucide/svelte/icons/check';
	import Edit2 from '@lucide/svelte/icons/edit-2';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import FileText from '@lucide/svelte/icons/file-text';
	import { untrack } from 'svelte';
	import type { WritableDirectoryAdapter } from '$lib/adapters/directory-adapter';

	const { mode, todo } = getStores();
	const adapter = $derived(mode.mode === 'remote' ? mode.remoteAdapter : mode.localAdapter);

	let fileContent = $state<string>('');
	let originalContent = $state<string>('');
	let isDirty = $derived(fileContent !== originalContent);

	let activeTab = $state<'write' | 'preview'>('preview');
	let localError = $state<string | null>(null);

	const isReadOnly = $derived(mode.isReadOnly);

	async function loadContent() {
		if (!adapter) return;
		await todo.load(adapter);
	}

	$effect(() => {
		const activeId = todo.activeListId;
		const content = todo.content;
		untrack(() => {
			if (activeId) {
				fileContent = content;
				originalContent = content;
				if (!content.trim()) {
					activeTab = 'write';
				} else {
					activeTab = 'preview';
				}
			} else {
				fileContent = '';
				originalContent = '';
			}
		});
	});

	async function selectList(id: string) {
		if (!adapter) return;
		await todo.selectList(adapter, id);
	}

	async function save() {
		if (!adapter || isReadOnly || !todo.activeListId) return;
		try {
			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.writeTextFile === 'function') {
				await todo.save(w, fileContent);
				originalContent = todo.content;
				localError = null;
			}
		} catch {
			localError = t('common.errorSaving', { default: 'Failed to save.' });
		}
	}

	async function createList() {
		if (!adapter || isReadOnly) return;
		const name = prompt(t('todo.newPrompt', { default: 'Enter new To-Do list name:' }));
		if (name && name.trim()) {
			const safeName = name.trim();
			const id = `${safeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.md`;
			if (todo.lists.some((l) => l.id === id)) {
				alert(t('todo.alreadyExists', { default: 'A list with this name already exists.' }));
				return;
			}
			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.writeTextFile === 'function') {
				await todo.createList(w, id, safeName);
				activeTab = 'write';
			}
		}
	}

	async function renameList() {
		if (!adapter || isReadOnly || !todo.activeListId) return;
		const currentList = todo.lists.find((l) => l.id === todo.activeListId);
		if (!currentList) return;

		const newName = prompt(
			t('todo.renamePrompt', { default: 'Enter new name:' }),
			currentList.name
		);
		if (newName && newName.trim() && newName.trim() !== currentList.name) {
			const safeName = newName.trim();
			const newId = `${safeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.md`;

			if (newId !== todo.activeListId && todo.lists.some((l) => l.id === newId)) {
				alert(t('todo.alreadyExists', { default: 'A list with this name already exists.' }));
				return;
			}

			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.writeTextFile === 'function') {
				await todo.renameList(w, todo.activeListId, newId, safeName);
			}
		}
	}

	async function deleteList() {
		if (!adapter || isReadOnly || !todo.activeListId) return;
		const currentList = todo.lists.find((l) => l.id === todo.activeListId);
		if (!currentList) return;

		if (
			confirm(t('todo.deleteConfirm', { default: 'Are you sure you want to delete this list?' }))
		) {
			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.removeFile === 'function') {
				await todo.deleteList(w, todo.activeListId);
			}
		}
	}

	function handleTaskToggle(e: Event) {
		const customEvent = e as CustomEvent<{ index: number; checked: boolean }>;
		const { index, checked } = customEvent.detail;
		let matchCount = 0;
		const updatedContent = fileContent.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (match, prefix) => {
			if (matchCount === index) {
				matchCount++;
				return `${prefix}[${checked ? 'x' : ' '}]`;
			}
			matchCount++;
			return match;
		});
		if (updatedContent !== fileContent) {
			fileContent = updatedContent;
			save();
		}
	}

	$effect(() => {
		if (adapter) {
			untrack(() => loadContent());
		}
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-6 p-6 md:flex-row">
	<!-- Left Sidebar: Lists -->
	<div class="flex w-full shrink-0 flex-col gap-4 overflow-y-auto pr-2 md:w-64">
		<div class="flex items-center justify-between border-b border-border pb-3">
			<h3 class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
				{t('leftrail.view.todo', { default: 'To-Do List' })}
			</h3>
			{#if !isReadOnly}
				<button
					class="text-primary hover:text-primary/80"
					title={t('todo.newList', { default: 'New List' })}
					onclick={createList}
				>
					<Edit2 class="h-4 w-4" />
				</button>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			{#each todo.lists as list (list.id)}
				<button
					class="hover:bg-surface-dark flex items-center gap-2 rounded-md p-2 text-sm transition-colors {todo.activeListId ===
					list.id
						? 'bg-primary/10 font-bold text-primary'
						: 'text-foreground'}"
					onclick={() => selectList(list.id)}
				>
					<FileText class="h-4 w-4 shrink-0" />
					<span class="truncate">{list.name}</span>
				</button>
			{/each}
			{#if todo.lists.length === 0 && !todo.loading}
				<p class="p-2 text-xs text-muted-foreground italic">
					{t('todo.emptyLists', { default: 'No To-Do lists found.' })}
				</p>
			{/if}
		</div>
	</div>

	<!-- Right Workspace: Editor / Preview -->
	<div class="flex flex-1 flex-col gap-4 overflow-y-auto border-border pl-2 md:border-l md:pl-6">
		{#if todo.activeListId}
			<div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
				<div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
					<h2
						class="flex items-center gap-3 truncate font-display text-xl font-bold text-foreground"
					>
						{todo.lists.find((l) => l.id === todo.activeListId)?.name || todo.activeListId}
					</h2>
					<div class="flex items-center gap-3">
						<div class="flex rounded-md border border-border bg-background p-1 text-sm">
							<button
								class="rounded-sm px-3 py-1 transition-colors {activeTab === 'write'
									? 'bg-surface font-medium text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (activeTab = 'write')}
							>
								{t('editor.tabs.write', { default: 'Write' })}
							</button>
							<button
								class="rounded-sm px-3 py-1 transition-colors {activeTab === 'preview'
									? 'bg-surface font-medium text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (activeTab = 'preview')}
							>
								{t('editor.tabs.preview', { default: 'Preview' })}
							</button>
						</div>
						{#if !isReadOnly}
							<Button
								variant="outline"
								onclick={renameList}
								class="hover:bg-surface-dark flex items-center gap-2 border-border px-2 text-foreground"
								title={t('common.rename', { default: 'Rename' })}
							>
								<Edit2 class="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								onclick={deleteList}
								class="flex items-center gap-2 border-error/20 px-2 text-error hover:bg-error/10"
								title={t('common.delete', { default: 'Delete' })}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
							<Button
								variant="primary"
								disabled={!isDirty || todo.loading}
								onclick={save}
								class="flex items-center gap-2"
							>
								<Check class="h-4 w-4" />
								{todo.loading
									? t('common.loading', { default: 'Saving...' })
									: t('common.save', { default: 'Save' })}
							</Button>
						{/if}
					</div>
				</div>

				{#if todo.error || localError}
					<div class="rounded-md bg-error/10 p-3 text-sm text-error">
						{todo.error || localError}
					</div>
				{/if}

				<div class="min-h-[400px] flex-1">
					{#if activeTab === 'write'}
						<CodeMirrorEditor
							class="h-full min-h-[400px] w-full"
							value={fileContent}
							onchange={(newValue) => (fileContent = newValue)}
							readonly={isReadOnly || todo.loading}
						/>
					{:else}
						<MarkdownPreview
							markdown={fileContent}
							class="prose-sm"
							ontasktoggle={handleTaskToggle}
						/>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-center">
				<div class="flex flex-col items-center gap-2 opacity-50">
					<FileText class="h-12 w-12 text-muted-foreground" />
					<p class="text-sm font-medium">
						{t('todo.selectPage', { default: 'Select a list from the sidebar to start' })}
					</p>
					{#if !isReadOnly}
						<Button variant="outline" onclick={createList} class="mt-4">
							{t('todo.newList', { default: 'Create New List' })}
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
