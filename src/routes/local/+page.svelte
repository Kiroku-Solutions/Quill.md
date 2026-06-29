<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ListView from '$lib/components/ListView.svelte';
	import KanbanView from '$lib/components/KanbanView.svelte';
	import EditorPanel from '$lib/components/EditorPanel.svelte';

	const stores = getStores();

	let newTitle = $state('');
	let newType = $state('task');
	let createError = $state<string | null>(null);

	onMount(async () => {
		if (stores.mode.mode !== 'local') {
			await goto(resolve('/'));
		}
	});

	async function createIssue(): Promise<void> {
		createError = null;
		try {
			const id = await stores.issues.create({
				title: newTitle.trim() || 'Untitled',
				issueType: newType.trim() || 'task',
				author: 'local-user'
			});
			newTitle = '';
			stores.editor.open(id);
		} catch (cause) {
			createError = (cause as Error).message;
		}
	}
</script>

<div class="min-h-screen flex flex-col bg-base-100 text-base-content">
	<header class="navbar bg-base-200 shadow-sm px-6 gap-4">
		<a href={resolve('/')} class="text-lg font-bold tracking-tight">nomad.md</a>
		<span class="badge badge-success badge-sm">Local</span>
		<div class="flex-1"></div>
		<div role="tablist" class="tabs tabs-bordered">
			<button
				role="tab"
				type="button"
				class="tab"
				class:tab-active={stores.view.view === 'list'}
				onclick={() => stores.view.setView('list')}>List</button
			>
			<button
				role="tab"
				type="button"
				class="tab"
				class:tab-active={stores.view.view === 'kanban'}
				onclick={() => stores.view.setView('kanban')}>Kanban</button
			>
		</div>
		<ThemeToggle />
	</header>

	<div class="px-6 pt-4">
		<FilterBar />
	</div>

	<div class="px-6 py-3 flex items-center gap-3">
		<input
			type="text"
			class="input input-bordered input-sm w-72"
			placeholder="New issue title…"
			bind:value={newTitle}
		/>
		<input
			type="text"
			class="input input-bordered input-sm w-32"
			placeholder="type"
			bind:value={newType}
		/>
		<button type="button" class="btn btn-primary btn-sm" onclick={createIssue}>+ New issue</button>
		{#if createError}
			<span class="text-error text-xs">{createError}</span>
		{/if}
		<span class="ml-auto text-xs opacity-60">
			{stores.issues.issues.length} issues · {stores.issues.dirty.size} dirty
		</span>
	</div>

	<main class="flex-1 overflow-y-auto pb-12">
		{#if stores.view.view === 'list'}
			<ListView />
		{:else if stores.view.view === 'kanban'}
			<KanbanView />
		{/if}
	</main>

	<EditorPanel />
</div>
