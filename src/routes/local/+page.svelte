<!--
	Local view (sub-phase 6E → Remote Edit Mode cut-over). The
	three-region chrome (TopBar + LeftRail + main canvas) is in
	`AppShell.svelte`. The page itself is a thin composition: the
	EditToolbar above the active view (List / Kanban / Gantt) — the
	view switcher lives in the LeftRail (6C). The EditorPanel mounts
	at the end of the canvas; its internal markup is a fixed-position
	aside that overlays the canvas.

	After the Remote Edit Mode cut-over, the toolbar is the unified
	`EditToolbar` for both Local and Remote modes. The toolbar branches
	on `mode.mode === 'remote'` internally — Local mode shows the
	trash affordance and skips the provider / branch pills; Remote
	mode shows the provider / branch pills and the pending-write
	badge. The toolbar file lives next to the layout; this page is
	a thin composition.

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
	import BacklogView from '$lib/components/BacklogView.svelte';
	import SprintView from '$lib/components/SprintView.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import TreeView from '$lib/components/TreeView.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import FilterUrlSync from '$lib/components/FilterUrlSync.svelte';
	import EditToolbar from '$lib/components/EditToolbar.svelte';

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
