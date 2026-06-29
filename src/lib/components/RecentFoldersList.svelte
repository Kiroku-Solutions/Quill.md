<!--
	RecentFoldersList.svelte — home-screen recent-folders list (sub-phase 6D,
	ERS §4.1.2, §5.5).

	Reads `modeStore.recentHandles` and renders one row per persisted folder:
	  [ folder icon ] [ folder name (truncated) ] [ relative timestamp ] [ Forget × ]

	Behaviour:
	  - Returns nothing when the list is empty. The parent `+page.svelte`
	    also guards on `recentHandles.length === 0`; this is belt-and-suspenders.
	  - Clicking anywhere on a row except the Forget button re-binds the
	    folder via `modeStore.openLocalFolder(record.handle)` and navigates
	    to `/local`.
	  - Clicking Forget calls `handleStore.removeRecent(id)` (the handle-store
	    contract: a Forgotten entry leaves both the active and the recent
	    lists). The component also tracks removed ids in a local $state set
	    so the list updates reactively even though the locked `ModeStore`
	    does not expose a recent-refresh method.

	Acceptance criterion §10: the relative-timestamp helper is a pure
	function that takes `addedAt` and `now` and returns a localised label.
	`Date.now()` is NOT called inside the function — the parent supplies
	the current time so the test can pin it. The helper lives in
	`$lib/ui/format.ts` (sub-phase 6F extraction) so the RemoteToolbar
	can reuse the exact same formatter for "Last fetched".

	ERS coverage: §4.1.2 (home screen Recent folders), §5.5 (Folder
	Handle Lifecycle — Forgotten path).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import Folder from '@lucide/svelte/icons/folder';
	import X from '@lucide/svelte/icons/x';
	import { IconButton } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { formatRelative } from '$lib/ui/format';
	import { handleStore } from '$lib/adapters';
	import { getStores } from '$lib/state';
	import type { HandleRecord } from '$lib/adapters';

	type RecentId = HandleRecord['id'] & string;

	const stores = getStores();

	// `mode.recentHandles` is a $state.raw array; treat it as a derived
	// read. The component layers a local "removed" set on top so the UI
	// updates immediately when a Forget click persists the removal.
	// `SvelteSet` is the reactive Set from `svelte/reactivity` — the
	// standard `Set` does not notify Svelte on `.add()` / `.delete()`.
	const recent = $derived(stores.mode.recentHandles);
	const forgotten = new SvelteSet<RecentId>();
	const visible = $derived(recent.filter((r) => !forgotten.has(r.id)));

	// `now` is captured once at component init. The relative-timestamp
	// helper itself takes `now` as a parameter, which is what the test
	// pins; this local binding is purely for live-render performance.
	const now = Date.now();

	async function forget(record: HandleRecord): Promise<void> {
		// Optimistic UI update first so the row disappears even if the
		// persistence call (microtask boundary) is slow. `SvelteSet.add`
		// is reactive, so the `visible` derived re-evaluates immediately.
		forgotten.add(record.id);
		// `removeRecent` only accepts the `recent-1`..`recent-5` ids; the
		// `active` id is intentionally not removable from this surface
		// (the row is the user's currently-open folder, not a recent).
		if (record.id.startsWith('recent-')) {
			await handleStore.removeRecent(record.id as `recent-${1 | 2 | 3 | 4 | 5}`);
		}
	}

	async function reBind(record: HandleRecord): Promise<void> {
		await stores.mode.openLocalFolder(record.handle);
		await goto(resolve('/local'));
	}
</script>

{#if visible.length > 0}
	<section data-testid="recent-folders" class="flex flex-col gap-2">
		<h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/70">
			{t('home.recentFolders.title')}
		</h2>
		<ul class="flex flex-col gap-1" role="list">
			{#each visible as record (record.id)}
				{@const label = formatRelative(record.addedAt, now)}
				<li
					data-testid="recent-folder-row"
					data-record-id={record.id}
					class="flex items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-base-200 focus-within:border-base-300"
				>
					<Folder class="h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />
					<button
						type="button"
						data-testid="recent-folder-open"
						class="flex-1 truncate text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
						title={record.name}
						onclick={() => void reBind(record)}
					>
						{record.name}
					</button>
					<span
						class="shrink-0 text-xs opacity-60"
						aria-label={t('home.recentFolders.lastOpenedAgo', { label })}
					>
						{label}
					</span>
					<IconButton
						label={t('home.recentFolders.forgetLabel', { name: record.name })}
						data-testid="recent-folder-forget"
						onclick={() => void forget(record)}
					>
						<X class="h-4 w-4" aria-hidden="true" />
					</IconButton>
				</li>
			{/each}
		</ul>
	</section>
{/if}
