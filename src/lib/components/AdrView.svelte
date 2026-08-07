<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { Button, CodeMirrorEditor } from '$lib/ui';
	import MarkdownPreview from './MarkdownPreview.svelte';
	import FileTree, { type TreeNode } from './FileTree.svelte';
	import FileText from '@lucide/svelte/icons/file-text';
	import Edit2 from '@lucide/svelte/icons/edit-2';
	import Check from '@lucide/svelte/icons/check';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Lock from '@lucide/svelte/icons/lock';
	import Download from '@lucide/svelte/icons/download';
	import { untrack } from 'svelte';
	import { saveDocument, parseDocumentFile } from '$lib/services/document-saver';
	import type { WritableDirectoryAdapter } from '$lib/adapters/directory-adapter';

	const { mode, ui } = getStores();
	const adapter = $derived(mode.mode === 'remote' ? mode.remoteAdapter : mode.localAdapter);

	let files = $state<string[]>([]);
	let selectedFile = $state<string | null>(null);
	let fileContent = $state<string>('');
	let originalContent = $state<string>('');
	let isDirty = $derived(fileContent !== originalContent);

	let documentId = $state<string>('');
	let isImmutable = $state(false);
	let integrityWarning = $state(false);

	let activeTab = $state<'write' | 'preview'>('preview');
	let error = $state<string | null>(null);

	const isReadOnly = $derived(mode.isReadOnly);
	const canEdit = $derived(!isReadOnly && !isImmutable);

	async function loadFiles() {
		if (!adapter) return;
		try {
			const entries = await adapter.listDirectory('.quill.md/adr', { recursive: true });
			files = entries
				.filter((e) => e.kind === 'file' && e.name.endsWith('.md'))
				.map((e) => e.path || e.name);
		} catch {
			files = [];
		}
	}

	async function selectFile(name: string) {
		if (!adapter) return;
		selectedFile = name;
		try {
			const rawContent = await adapter.readTextFile(`.quill.md/adr/${name}`);
			const doc = await parseDocumentFile(rawContent);
			fileContent = doc.content;
			originalContent = doc.content;
			documentId = doc.id;
			isImmutable = doc.immutable;
			integrityWarning = doc.integrityWarning;
			activeTab = 'preview';
			error = null;
		} catch {
			error = `Failed to read file ${name}`;
		}
	}

	function exportCurrent() {
		if (!selectedFile) return;
		ui.openExport({
			type: 'documents',
			data: [{ title: selectedFile.replace(/\.md$/, ''), markdown: fileContent }]
		});
	}

	async function save() {
		if (!adapter || !selectedFile || !canEdit) return;
		try {
			// Type casting to access writeTextFile
			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.writeTextFile === 'function') {
				const doc = await saveDocument(
					w,
					'.quill.md/adr',
					selectedFile,
					documentId,
					isImmutable,
					fileContent
				);
				fileContent = doc.content;
				originalContent = doc.content;
				documentId = doc.id;
				isImmutable = doc.immutable;
				integrityWarning = doc.integrityWarning;
				error = null;
			}
		} catch {
			error = `Failed to save file ${selectedFile}`;
		}
	}

	async function lockDocument() {
		if (!adapter || !selectedFile || !canEdit) return;
		if (
			!confirm(
				t('common.lockConfirm', {
					default:
						'Are you sure you want to lock this document? It will become permanently immutable.'
				})
			)
		)
			return;
		try {
			const w = adapter as unknown as WritableDirectoryAdapter;
			if (typeof w.writeTextFile === 'function') {
				const doc = await saveDocument(
					w,
					'.quill.md/adr',
					selectedFile,
					documentId,
					true,
					fileContent
				);
				fileContent = doc.content;
				originalContent = doc.content;
				documentId = doc.id;
				isImmutable = doc.immutable;
				integrityWarning = doc.integrityWarning;
				error = null;
			}
		} catch {
			error = `Failed to lock file ${selectedFile}`;
		}
	}

	async function createNewFile() {
		const name = prompt('Enter new ADR name (without .md). You can use slashes for subfolders:');
		if (name && name.trim()) {
			const filename = `${name.trim().replace(new RegExp('[^a-zA-Z0-9_/-]', 'g'), '_')}.md`;
			if (files.includes(filename)) {
				alert('File already exists.');
				return;
			}
			try {
				const w = adapter as unknown as WritableDirectoryAdapter;
				if (typeof w.writeTextFile === 'function') {
					const id = crypto.randomUUID();
					await saveDocument(
						w,
						'.quill.md/adr',
						filename,
						id,
						false,
						`# ${name.split('/').pop()}\n\n## Status\nProposed\n\n## Context\n...\n\n## Decision\n...\n\n## Consequences\n...`
					);
					await loadFiles();
					await selectFile(filename);
					activeTab = 'write';
				}
			} catch {
				error = `Failed to create file ${filename}`;
			}
		}
	}

	async function exportFolder(folderPath: string) {
		if (!adapter || files.length === 0) return;
		try {
			const folderFiles = files.filter((f) => f.startsWith(`${folderPath}/`));
			if (folderFiles.length === 0) return;
			const docs = await Promise.all(
				folderFiles.map(async (name) => {
					const rawContent = await adapter.readTextFile(`.quill.md/adr/${name}`);
					const doc = await parseDocumentFile(rawContent);
					return { title: name.replace(/\.md$/, ''), markdown: doc.content };
				})
			);
			ui.openExport({
				type: 'documents',
				data: docs
			});
		} catch {
			error = 'Failed to export folder files';
		}
	}

	async function exportAll() {
		if (!adapter || files.length === 0) return;
		try {
			const docs = await Promise.all(
				files.map(async (name) => {
					const rawContent = await adapter.readTextFile(`.quill.md/adr/${name}`);
					const doc = await parseDocumentFile(rawContent);
					return { title: name.replace(/\.md$/, ''), markdown: doc.content };
				})
			);
			ui.openExport({
				type: 'documents',
				data: docs
			});
		} catch {
			error = 'Failed to export all files';
		}
	}

	$effect(() => {
		if (adapter) {
			untrack(() => loadFiles());
		}
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-6 p-6 md:flex-row">
	<!-- Left Sidebar: File List -->
	<div class="flex w-full shrink-0 flex-col gap-4 overflow-y-auto pr-2 md:w-64">
		<div class="flex items-center justify-between border-b border-border pb-3">
			<h3 class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
				{t('leftrail.view.adr', { default: 'ADRs' })}
			</h3>
			<div class="flex items-center gap-2">
				{#if files.length > 0}
					<button
						class="text-primary hover:text-primary/80"
						title={t('common.exportAll', { default: 'Export All' }) ?? 'Export All'}
						onclick={exportAll}
					>
						<Download class="h-4 w-4" />
					</button>
				{/if}
				{#if !isReadOnly}
					<button
						class="text-primary hover:text-primary/80"
						title={t('adr.new', { default: 'New ADR' })}
						onclick={createNewFile}
					>
						<Edit2 class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>
		<div class="flex flex-col gap-1">
			{#snippet nodeAction(node: TreeNode)}
				{#if node.type === 'folder'}
					<button
						class="p-1 text-muted-foreground transition-colors hover:text-primary"
						title={t('common.exportFolder', { default: 'Export Folder' })}
						onclick={(e) => {
							e.stopPropagation();
							exportFolder(node.path);
						}}
					>
						<Download class="h-3.5 w-3.5" />
					</button>
				{/if}
			{/snippet}
			<FileTree paths={files} selected={selectedFile} onselect={selectFile} {nodeAction} />
			{#if files.length === 0}
				<p class="p-2 text-xs text-muted-foreground italic">
					{t('adr.empty', { default: 'No ADRs found.' })}
				</p>
			{/if}
		</div>
	</div>

	<!-- Right Workspace: Editor / Preview -->
	<div class="flex flex-1 flex-col gap-4 overflow-y-auto border-border pl-2 md:border-l md:pl-6">
		{#if selectedFile}
			<div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
				<div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
					<h2 class="flex items-center gap-3 font-display text-xl font-bold text-foreground">
						{selectedFile}
						{#if isImmutable}
							<span
								class="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
							>
								<Lock class="size-3" />
								{t('common.immutable', { default: 'Immutable' })}
							</span>
						{/if}
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
						<Button
							variant="outline"
							onclick={exportCurrent}
							class="flex items-center gap-2 border-primary/20 text-primary hover:bg-primary/10"
						>
							<Download class="h-4 w-4" />
							{t('common.export', { default: 'Exportar' })}
						</Button>
						{#if canEdit}
							<Button
								variant="outline"
								onclick={lockDocument}
								class="flex items-center gap-2 border-primary/20 text-primary hover:bg-primary/10"
							>
								<Lock class="h-4 w-4" />
								{t('common.lock', { default: 'Lock Document' })}
							</Button>
							<Button
								variant="primary"
								disabled={!isDirty}
								onclick={save}
								class="flex items-center gap-2"
							>
								<Check class="h-4 w-4" />
								{t('common.save', { default: 'Save' })}
							</Button>
						{/if}
					</div>
				</div>

				{#if integrityWarning}
					<div class="flex items-center gap-2 rounded-md bg-error/10 p-3 text-sm text-error">
						<AlertTriangle class="h-4 w-4 shrink-0" />
						{t('integrity.editorWarning')}
					</div>
				{/if}

				{#if error}
					<div class="rounded-md bg-error/10 p-3 text-sm text-error">{error}</div>
				{/if}

				<div class="min-h-[400px] flex-1">
					{#if activeTab === 'write'}
						<CodeMirrorEditor
							class="h-full min-h-[400px] w-full"
							value={fileContent}
							onchange={(newValue) => (fileContent = newValue)}
							readonly={!canEdit}
						/>
					{:else}
						<MarkdownPreview markdown={fileContent} class="prose-sm" />
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-center">
				<div class="flex flex-col items-center gap-2 opacity-50">
					<FileText class="h-12 w-12 text-muted-foreground" />
					<p class="text-sm font-medium">
						{t('adr.selectPage', { default: 'Select an ADR from the sidebar to view' })}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>
