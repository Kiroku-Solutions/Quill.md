<script lang="ts">
	import { getStores } from '$lib/state';

	const { filter } = getStores();

	const statuses = $derived(stores_filter_statuses());

	// Re-export: use a helper so we can read stores.config reactively.
	function stores_filter_statuses(): readonly string[] {
		// Read the active config — fall back to [] when not yet loaded.
		const cfg = (getStores() as unknown as { config: { config: unknown } }).config.config as {
			statuses?: ReadonlyArray<{ id: string }>;
		} | null;
		return cfg?.statuses?.map((s) => s.id) ?? [];
	}

	let q = $state(filter.filter.q ?? '');
	let status = $state(filter.filter.status ?? '');
	let type = $state(filter.filter.type ?? '');

	$effect(() => {
		filter.set({
			q: q || undefined,
			status: status || undefined,
			type: type || undefined
		});
	});

	function clear(): void {
		q = '';
		status = '';
		type = '';
		filter.clear();
	}
</script>

<div class="flex flex-wrap items-center gap-3 p-3 bg-base-200 rounded-md">
	<label class="form-control">
		<div class="label py-0">
			<span class="label-text text-xs opacity-70">Search</span>
		</div>
		<input
			type="search"
			class="input input-bordered input-sm w-56"
			placeholder="title or section body…"
			bind:value={q}
		/>
	</label>

	<label class="form-control">
		<div class="label py-0">
			<span class="label-text text-xs opacity-70">Status</span>
		</div>
		<select class="select select-bordered select-sm w-40" bind:value={status}>
			<option value="">All</option>
			{#each statuses as id (id)}
				<option value={id}>{id}</option>
			{/each}
		</select>
	</label>

	<label class="form-control">
		<div class="label py-0">
			<span class="label-text text-xs opacity-70">Type</span>
		</div>
		<input
			type="text"
			class="input input-bordered input-sm w-32"
			placeholder="bug, task…"
			bind:value={type}
		/>
	</label>

	<button type="button" class="btn btn-ghost btn-sm ml-auto" onclick={clear}>Clear</button>
</div>
