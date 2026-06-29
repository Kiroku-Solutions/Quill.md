<!--
	Remote view (sub-phase 6F). Same three-region chrome as the local
	view (AppShell → TopBar + LeftRail + main canvas), read-only.
	The RemoteToolbar (6F) sits at the top of the canvas and provides:
	  - "Refresh" (calls modeStore.refreshRemote via the RefreshPatPrompt)
	  - "Last fetched: N min ago" indicator
	  - View label + "X issues (read-only)" status
	  - "Sign out" affordance (modeStore.signOut + goto('/'))
	The sign-out action ALSO lives in the TopBar settings menu; the
	toolbar copy is the second affordance called out by the brief.

	The onMount guard ensures we redirect to `/` if the user lands on
	the remote route without an active remote session (e.g. deep link
	with the session already signed out). The guard is non-blocking
	during SSR (`goto` from `$app/navigation` is browser-only).
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ListView from '$lib/components/ListView.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import GanttView from '$lib/components/GanttView.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import FilterUrlSync from '$lib/components/FilterUrlSync.svelte';
	import RemoteToolbar from '$lib/components/RemoteToolbar.svelte';

	const stores = getStores();

	onMount(async () => {
		if (stores.mode.mode !== 'remote') {
			await goto(resolve('/'));
		}
	});
</script>

<div class="flex h-full flex-col">
	<FilterUrlSync />
	<RemoteToolbar />

	<div class="flex-1 overflow-y-auto pb-12">
		{#if stores.view.view === 'list'}
			<ListView />
		{:else if stores.view.view === 'kanban'}
			<KanbanView />
		{:else if stores.view.view === 'gantt'}
			<GanttView />
		{/if}
	</div>

	<EditorPanel />
</div>
