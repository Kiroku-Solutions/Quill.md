<!--
	Remote view (sub-phase 6F → Remote Edit Mode cut-over). Same
	three-region chrome as the local view (AppShell → TopBar + LeftRail
	+ main canvas), now write-capable. The EditToolbar (cut-over) sits
	at the top of the canvas and provides:
	  - "New issue" / "Import .md" / "Refresh" / "Push now" (when the
	    commit queue has pending writes)
	  - Provider pill, edit-branch label, pending-write badge
	  - "Sign out" affordance (modeStore.signOut + goto('/'))

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
	import BacklogView from '$lib/components/BacklogView.svelte';
	import SprintView from '$lib/components/SprintView.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import TreeView from '$lib/components/TreeView.svelte';
	import FilterUrlSync from '$lib/components/FilterUrlSync.svelte';
	import EditToolbar from '$lib/components/EditToolbar.svelte';

	const stores = getStores();

	onMount(async () => {
		if (stores.mode.mode !== 'remote') {
			await goto(resolve('/'));
		}
	});
</script>

<div class="flex h-full flex-col">
	<FilterUrlSync />
	<EditToolbar />

	<div class="flex-1 overflow-y-auto pb-12">
		{#if stores.view.view === 'list'}
			<ListView />
		{:else if stores.view.view === 'kanban'}
			<KanbanView />
		{:else if stores.view.view === 'graph'}
			<GraphView />
		{:else if stores.view.view === 'tree'}
			<TreeView />
		{:else if stores.view.view === 'gantt'}
			<GanttView />
		{:else if stores.view.view === 'backlog'}
			<BacklogView />
		{:else if stores.view.view === 'sprint'}
			<SprintView />
		{/if}
	</div>

	<EditorPanel />
</div>
