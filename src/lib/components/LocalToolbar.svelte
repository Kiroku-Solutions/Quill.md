<!--
	LocalToolbar.svelte — toolbar above the active view on the
	local-edit page (sub-phase 6E, ERS FR-4 / FR-6 / NFR-1).

	Layout: a `flex` row sticky to the top of the canvas (just below
	the TopBar / LeftRail). Action buttons cluster on the left, the
	"X issues · Y dirty" status on the right.

	Surfaces:
	  - "New issue" → opens `NewIssueModal`. Hidden in Remote Mode
	    (read-only guard wired here for 6F to inherit).
	  - "Refresh" → calls `issuesStore.load()`. The Button's `loading`
	    flag flips to `true` while the promise is pending. Disabled in
	    Remote Mode with a tooltip explaining the guard.
	  - View label — small text reflecting `viewStore.view`.
	  - "Trash (N) · Empty" affordance — shows the count of files in
	    `.nomad.md/.trash/` (read from the active local adapter's
	    `listDirectory`). The "Empty" half of the label opens
	    `EmptyTrashModal`. The count re-fetches after every
	    `issuesStore.remove()` (we read it again on the toolbar's
	    `$effect` whenever `stores.issues.issues.length` changes).
	  - "X issues · Y dirty" status — same data the previous
	    `+page.svelte` rendered, moved here for the 6E toolbar polish.

	Read-only guard (6F inheritance):
	  The brief says: "In read-only mode (detected via the active
	  adapter being a `ReadOnlyDirectoryAdapter` — the locked
	  `ModeStore` does not currently expose this directly; you'll
	  need to derive it from `modeStore.mode === 'remote'` for v0)".
	  We use `modeStore.mode === 'remote'` as the read-only signal.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { Button, Tooltip } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { TRASH_DIRECTORY } from '$lib/adapters';
	import NewIssueModal from './NewIssueModal.svelte';
	import EmptyTrashModal from './EmptyTrashModal.svelte';

	const stores = getStores();

	const isReadOnly = $derived(stores.mode.mode === 'remote');
	const viewLabel = $derived(stores.view.view);

	let newIssueOpen = $state(false);
	let emptyTrashOpen = $state(false);

	let refreshing = $state(false);
	let refreshError = $state<string | null>(null);

	// Trash count is read from the local adapter; the toolbar holds
	// the value in a $state cell and re-reads on every issues mutation
	// and on focus. The remote mode does not have a writable adapter,
	// so the count stays at 0 there.
	let trashCount = $state(0);

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
		// Re-read whenever the issue list changes (an issue was just
		// soft-deleted into the trash) or when the active adapter flips.
		void stores.issues.issues.length;
		void stores.mode.localAdapter;
		void readTrashCount();
	});

	async function refresh(): Promise<void> {
		refreshing = true;
		refreshError = null;
		try {
			await stores.issues.load();
		} catch (cause) {
			refreshError = (cause as Error).message;
		} finally {
			refreshing = false;
		}
	}

	function openNewIssue(): void {
		newIssueOpen = true;
	}
	function openEmptyTrash(): void {
		emptyTrashOpen = true;
	}
	function onEmptied(): void {
		// Optimistic: zero the count; the next effect tick will re-read.
		trashCount = 0;
		void readTrashCount();
	}

	const issueCount = $derived(stores.issues.issues.length);
	const dirtyCount = $derived(stores.issues.dirty.size);
</script>

<div
	data-testid="local-toolbar"
	class="sticky top-[var(--topbar-height)] z-10 flex flex-wrap items-center gap-2 border-b border-base-300 bg-base-200 px-4 py-2"
>
	{#if !isReadOnly}
		<Button variant="primary" size="sm" onclick={openNewIssue} data-testid="toolbar-new-issue">
			{t('localToolbar.newIssue')}
		</Button>
	{/if}

	{#if isReadOnly}
		<Tooltip text={t('localToolbar.refreshReadOnlyTooltip')} position="bottom">
			<Button variant="ghost" size="sm" loading={refreshing} disabled data-testid="toolbar-refresh">
				{t('localToolbar.refresh')}
			</Button>
		</Tooltip>
	{:else}
		<Button
			variant="ghost"
			size="sm"
			loading={refreshing}
			onclick={() => void refresh()}
			data-testid="toolbar-refresh"
		>
			{t('localToolbar.refresh')}
		</Button>
	{/if}

	<span class="badge badge-ghost badge-sm uppercase tracking-wide" data-testid="toolbar-view-label">
		{viewLabel}
	</span>

	<button
		type="button"
		class="btn btn-ghost btn-sm ml-auto"
		disabled={isReadOnly}
		onclick={openEmptyTrash}
		data-testid="toolbar-trash"
		aria-label={t('localToolbar.trashAria', { n: trashCount })}
	>
		🗑 {t('localToolbar.trashButton', { n: trashCount })}
		<span class="opacity-60">·</span>
		<span>{t('localToolbar.trashEmptyLabel')}</span>
	</button>

	<span class="text-xs opacity-60" data-testid="toolbar-status">
		{t('common.issueCount', { n: issueCount })} ·
		{t('common.dirtyCount', { n: dirtyCount })}
	</span>

	{#if refreshError}
		<span class="text-error text-xs" role="alert">{refreshError}</span>
	{/if}
</div>

<NewIssueModal bind:open={newIssueOpen} onclose={() => (newIssueOpen = false)} />

<EmptyTrashModal
	bind:open={emptyTrashOpen}
	adapter={stores.mode.localAdapter}
	count={trashCount}
	onclose={() => (emptyTrashOpen = false)}
	onemptied={onEmptied}
/>
