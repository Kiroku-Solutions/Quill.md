<!--
	Local view (sub-phase 6E). The three-region chrome (TopBar +
	LeftRail + main canvas) is in `AppShell.svelte`. The page itself
	is a thin composition: the LocalToolbar above the active view
	(List / Kanban / Gantt) — the view switcher lives in the LeftRail
	(6C). The EditorPanel mounts at the end of the canvas; its
	internal markup is a fixed-position aside that overlays the canvas.

	The inline new-title / new-type inputs and the createIssue flow
	moved to the LocalToolbar in 6E; the toolbar opens a type-picker
	modal instead.

	The onMount guard ensures we redirect to `/` if the user lands on
	the local route without an active folder (e.g. deep link with
	the local session already signed out). The guard is non-blocking
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
	import LocalToolbar from '$lib/components/LocalToolbar.svelte';

	const stores = getStores();

	onMount(async () => {
		if (stores.mode.mode !== 'local') {
			await goto(resolve('/'));
		} else if (stores.config.config === null) {
			await goto(resolve('/wizard'));
		}
	});
</script>

<div class="flex h-full flex-col">
	<FilterUrlSync />
	<LocalToolbar />

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
