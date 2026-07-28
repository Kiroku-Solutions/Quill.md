<!--
	EmptyTrashModal.svelte — confirm modal for the toolbar's
	"Empty trash" affordance (sub-phase 6E, ERS FR-4).

	Mounted by `LocalToolbar.svelte` only in Local Edit Mode (the
	toolbar hides the trigger when `modeStore.mode === 'remote'`).

	Behaviour:
	  - Shows the count of files in `.quill.md/.trash/`. The count is
	    passed in as a prop (the toolbar reads it via the active local
	    adapter's `listDirectory` and re-reads after every `remove`).
	  - The confirm button calls `emptyTrash(adapter)` from
	    `$lib/adapters/trash`; the toolbar passes the resolved local
	    adapter in so the modal does not need to know about the
	    mode store. The callback fires on success and the modal
	    closes.

	The adapter is typed as `DirectoryAdapter` (`WritableDirectoryAdapter`
	alias per `directory-adapter.ts`) because the read-only surface
	is the only thing `emptyTrash` actually uses.
-->
<script lang="ts">
	import { Modal } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { emptyTrash } from '$lib/adapters';
	import type { DirectoryAdapter } from '$lib/adapters';

	type Props = {
		open: boolean;
		adapter: DirectoryAdapter | null;
		count: number;
		onclose: () => void;
		onemptied?: (removed: number) => void;
	};

	let { open = $bindable(), adapter, count, onclose, onemptied }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	function close(): void {
		open = false;
		onclose();
	}

	async function confirm(): Promise<void> {
		if (!adapter || busy) return;
		busy = true;
		error = null;
		try {
			const removed = await emptyTrash(adapter);
			onemptied?.(removed);
			close();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open onclose={close} class="max-w-md">
	<div class="mb-2 flex items-start justify-between gap-3">
		<h2 class="text-lg font-semibold">{t('emptyTrashModal.title')}</h2>
		<button
			type="button"
			class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
			onclick={close}
			aria-label={t('emptyTrashModal.closeAria')}
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				></path></svg
			>
		</button>
	</div>

	<p class="text-sm">
		{#if count === 0}
			{t('emptyTrashModal.alreadyEmpty')}
		{:else}
			{t('emptyTrashModal.confirmBody', { n: count })}
		{/if}
	</p>

	{#if error}
		<p class="mt-3 text-xs font-medium text-error" role="alert">{error}</p>
	{/if}

	<footer class="mt-4 flex items-center justify-end gap-2">
		<button
			type="button"
			class="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50"
			onclick={close}
			disabled={busy}
		>
			{t('common.cancel')}
		</button>
		<button
			type="button"
			class="flex items-center gap-2 rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			disabled={count === 0 || busy || !adapter}
			aria-busy={busy || undefined}
			onclick={() => void confirm()}
			data-testid="empty-trash-confirm"
		>
			{#if busy}
				<svg
					class="h-3.5 w-3.5 animate-spin text-current"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle><path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path></svg
				>
			{/if}
			{t('emptyTrashModal.confirm')}
		</button>
	</footer>
</Modal>
