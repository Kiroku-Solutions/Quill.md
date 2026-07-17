<!--
	EditToolbar.svelte — unified toolbar for the active view (Local Mode
	OR Remote Edit Mode). Replaces the previous Local + Remote toolbar
	split once Remote Mode became write-capable.

	Local Mode:
	  - "New issue", "Import .md", "Refresh", trash count.
	  - All writes go through the local adapter synchronously.

	Remote Edit Mode (FR-5):
	  - "New issue", "Import .md", "Refresh", "Push now" (commit queue flush).
	  - The pending-write badge mirrors the CommitQueueStore.depth.
	  - Provider pill (GitHub / GitLab) and the edit-branch label.
	  - "Sign out" → clears PAT from sessionStorage.
	  - Conflict banner surfaces `RemoteConflictError` from the commit queue.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Tooltip, Alert } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { TRASH_DIRECTORY } from '$lib/adapters';
	import { isAnyRemoteError } from '$lib/adapters/feature-detect';
	import Globe from '@lucide/svelte/icons/globe';
	import GitBranch from '@lucide/svelte/icons/git-branch';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import Trash from '@lucide/svelte/icons/trash-2';
	import NewIssueModal from './NewIssueModal.svelte';
	import EmptyTrashModal from './EmptyTrashModal.svelte';
	import { getStores, createCommitQueueStore } from '$lib/state';

	const stores = getStores();
	const commitQueue = createCommitQueueStore();

	const isRemote = $derived(stores.mode.mode === 'remote');
	const viewLabel = $derived(stores.view.view);
	const issueCount = $derived(stores.issues.issues.length);
	const dirtyCount = $derived(stores.issues.dirty.size);
	const pendingDepth = $derived(commitQueue.depth);
	const queueError = $derived(commitQueue.lastError);
	const isFlushing = $derived(commitQueue.flushing);

	let newIssueOpen = $state(false);
	let emptyTrashOpen = $state(false);
	let refreshing = $state(false);
	let importing = $state(false);
	let refreshError = $state<string | null>(null);
	let trashCount = $state(0);
	let patPromptOpen = $state(false);
	let promptPat = $state('');

	async function readTrashCount(): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			trashCount = 0;
			return;
		}
		try {
			const entries = await adapter.listDirectory(TRASH_DIRECTORY);
			trashCount = entries.filter((e) => e.kind === 'file').length;
		} catch {
			trashCount = 0;
		}
	}

	$effect(() => {
		void stores.issues.issues.length;
		void stores.mode.localAdapter;
		void readTrashCount();
	});

	async function refresh(): Promise<void> {
		refreshing = true;
		refreshError = null;
		try {
			if (isRemote) {
				promptPat = '';
				patPromptOpen = true;
			} else {
				await stores.issues.load();
			}
		} catch (cause) {
			refreshError = (cause as Error).message;
		} finally {
			refreshing = false;
		}
	}

	async function submitRefreshPat(): Promise<void> {
		if (promptPat.trim() === '') return;
		patPromptOpen = false;
		refreshing = true;
		refreshError = null;
		try {
			await stores.mode.refreshRemote(promptPat.trim());
			await stores.issues.load();
		} catch (cause) {
			const name = (cause as { name?: string }).name;
			if (name === 'RemotePatRequiredError') {
				refreshError = t('common.remoteSessionExpired');
			} else {
				refreshError = (cause as Error).message;
			}
		} finally {
			refreshing = false;
		}
	}

	function cancelRefreshPat(): void {
		patPromptOpen = false;
		promptPat = '';
	}

	async function pushNow(): Promise<void> {
		await commitQueue.flushNow('chore(quill.md): push pending changes');
	}

	async function signOut(): Promise<void> {
		await stores.mode.signOut();
		await goto(resolve('/'));
	}

	async function handleImport(): Promise<void> {
		try {
			importing = true;
			refreshError = null;
			if (!('showOpenFilePicker' in window)) {
				refreshError = t('home.fsaUnavailable');
				return;
			}
			const [fileHandle] = await (
				window as unknown as {
					showOpenFilePicker: (opts: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
				}
			).showOpenFilePicker({
				types: [
					{
						description: 'Markdown Files',
						accept: { 'text/markdown': ['.md'] }
					}
				],
				excludeAcceptAllOption: true,
				multiple: false
			});
			const file = await fileHandle.getFile();
			const content = await file.text();
			const newId = await stores.issues.importIssue(content);
			stores.editor.open(newId);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			refreshError = t('localToolbar.importIssueFailed', { msg: (e as Error).message });
		} finally {
			importing = false;
		}
	}

	function openNewIssue(): void {
		newIssueOpen = true;
	}
	function openEmptyTrash(): void {
		emptyTrashOpen = true;
	}
	function onEmptied(): void {
		trashCount = 0;
		void readTrashCount();
	}

	const providerLabel = $derived(isRemote ? 'Remote (editable)' : 'Local');
</script>

<nav
	class="sticky top-[var(--topbar-height)] z-10 flex flex-wrap items-center gap-3 border-b border-border bg-surface/80 backdrop-blur-xl px-6 py-3 transition-colors duration-[var(--motion-slow)]"
	data-testid="edit-toolbar"
>
	<Button variant="primary" size="sm" onclick={openNewIssue} data-testid="toolbar-new-issue">
		{t('localToolbar.newIssue')}
	</Button>
	<Button
		variant="secondary"
		size="sm"
		loading={importing}
		onclick={handleImport}
		data-testid="toolbar-import-issue"
	>
		{t('localToolbar.importIssue')}
	</Button>

	<Button
		variant="ghost"
		size="sm"
		loading={refreshing}
		onclick={refresh}
		data-testid="toolbar-refresh"
	>
		<RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
		{t('common.refresh')}
	</Button>

	{#if isRemote && pendingDepth > 0}
		<Button
			variant="primary"
			size="sm"
			loading={isFlushing}
			onclick={pushNow}
			data-testid="toolbar-push-now"
		>
			<UploadCloud class="mr-1 h-4 w-4" aria-hidden="true" />
			Push now ({pendingDepth})
		</Button>
	{/if}

	<span
		class="px-2 py-1 bg-foreground/5 rounded-md text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
		data-testid="toolbar-view-label"
	>
		{viewLabel}
	</span>

	{#if isRemote}
		<span
			class="px-2 py-1 bg-primary/10 text-primary rounded-md text-[11px] font-bold uppercase tracking-widest inline-flex items-center gap-1"
			data-testid="toolbar-provider-pill"
		>
			<Globe class="h-3 w-3" aria-hidden="true" />
			{providerLabel}
		</span>
		<span
			class="px-2 py-1 bg-foreground/5 rounded-md text-[11px] font-bold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"
			data-testid="toolbar-branch-pill"
		>
			<GitBranch class="h-3 w-3" aria-hidden="true" />
			{stores.mode.editBranch ?? 'quill-md'}
		</span>
	{/if}

	<div class="ml-auto flex items-center gap-2">
		{#if !isRemote}
			<Tooltip text={t('localToolbar.trashAria', { n: trashCount })} position="bottom">
				<button
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					onclick={openEmptyTrash}
					data-testid="toolbar-trash"
				>
					<Trash class="h-4 w-4" aria-hidden="true" />
					<span>{t('localToolbar.trashButton', { n: trashCount })}</span>
					<span class="opacity-40">·</span>
					<span>{t('localToolbar.trashEmptyLabel')}</span>
				</button>
			</Tooltip>
		{/if}

		<span
			class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			data-testid="toolbar-status"
		>
			{t('common.issueCount', { n: issueCount })} ·
			{t('common.dirtyCount', { n: dirtyCount })}
		</span>

		{#if isRemote}
			<Button variant="ghost" size="sm" onclick={signOut} data-testid="toolbar-signout">
				<LogOut class="mr-1 h-4 w-4" aria-hidden="true" />
				{t('remoteToolbar.signOut')}
			</Button>
		{/if}
	</div>

	{#if refreshError}
		<span class="text-error text-xs font-medium" role="alert">{refreshError}</span>
	{/if}
	{#if queueError && isAnyRemoteError(queueError)}
		<div class="w-full mt-2">
			<Alert variant="error">
				{queueError.message}
				{#if queueError.name === 'RemoteConflictError'}
					<Button variant="secondary" size="sm" class="ml-2" onclick={refresh}
						>Pull to refresh</Button
					>
				{/if}
			</Alert>
		</div>
	{/if}
</nav>

<NewIssueModal bind:open={newIssueOpen} onclose={() => (newIssueOpen = false)} />

{#if !isRemote}
	<EmptyTrashModal
		bind:open={emptyTrashOpen}
		adapter={stores.mode.localAdapter}
		count={trashCount}
		onclose={() => (emptyTrashOpen = false)}
		onemptied={onEmptied}
	/>
{/if}

{#if patPromptOpen}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="bg-surface border border-border shadow-xl rounded-xl w-[28rem] max-w-full p-6 flex flex-col gap-4"
		>
			<h2 class="text-lg font-bold text-foreground">{t('refreshPatPrompt.title')}</h2>
			<p class="text-sm text-muted-foreground">{t('refreshPatPrompt.body')}</p>
			<input
				type="password"
				autocomplete="off"
				spellcheck="false"
				bind:value={promptPat}
				disabled={refreshing}
				placeholder={t('home.remotePatPlaceholder')}
				class="w-full bg-background text-foreground rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
				data-testid="edit-toolbar-pat-input"
			/>
			<div class="flex justify-end gap-3">
				<Button variant="ghost" size="sm" onclick={cancelRefreshPat}>
					{t('common.cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					disabled={promptPat.trim() === '' || refreshing}
					onclick={submitRefreshPat}
					data-testid="edit-toolbar-pat-submit"
				>
					{t('common.refresh')}
				</Button>
			</div>
		</div>
	</div>
{/if}
