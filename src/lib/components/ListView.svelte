<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount } from 'svelte';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, config, editor } = getStores();

	// Re-read the reactive fields each tick.
	let rows = $state<readonly LoadedIssue[]>([]);
	let sortKey = $state<'id' | 'title' | 'updated_date' | 'status'>('updated_date');
	let sortDir = $state<'asc' | 'desc'>('desc');

	$effect(() => {
		const all = issues.issues;
		const f = filter.filter;
		rows = all
			.filter((li) => {
				if (f.status && li.issue.status !== f.status) return false;
				if (f.type && li.issue.issueType !== f.type) return false;
				if (f.q) {
					const needle = f.q.toLowerCase();
					if (
						!li.issue.title.toLowerCase().includes(needle) &&
						!li.issue.sections.some((s) => s.markdown.toLowerCase().includes(needle))
					) {
						return false;
					}
				}
				return true;
			})
			.slice()
			.sort((a, b) => {
				const dir = sortDir === 'asc' ? 1 : -1;
				switch (sortKey) {
					case 'id':
						return (a.issue.id - b.issue.id) * dir;
					case 'title':
						return a.issue.title.localeCompare(b.issue.title) * dir;
					case 'status':
						return a.issue.status.localeCompare(b.issue.status) * dir;
					case 'updated_date':
						return a.issue.updatedDate.localeCompare(b.issue.updatedDate) * dir;
				}
			});
	});

	function toggleSort(k: typeof sortKey): void {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = k;
			sortDir = 'asc';
		}
	}

	function open(id: number): void {
		editor.open(id);
	}

	void config; // silence unused
	onMount(() => {
		/* no-op */
	});
</script>

<div class="overflow-x-auto">
	<table class="table table-zebra table-sm">
		<thead>
			<tr>
				<th
					><button type="button" class="btn btn-ghost btn-xs" onclick={() => toggleSort('id')}
						>id</button
					></th
				>
				<th
					><button type="button" class="btn btn-ghost btn-xs" onclick={() => toggleSort('title')}
						>title</button
					></th
				>
				<th>type</th>
				<th
					><button type="button" class="btn btn-ghost btn-xs" onclick={() => toggleSort('status')}
						>status</button
					></th
				>
				<th>assignee</th>
				<th>labels</th>
				<th
					><button
						type="button"
						class="btn btn-ghost btn-xs"
						onclick={() => toggleSort('updated_date')}>updated</button
					></th
				>
			</tr>
		</thead>
		<tbody>
			{#each rows as li (li.issue.id)}
				<tr class="hover cursor-pointer" onclick={() => open(li.issue.id)}>
					<td class="font-mono text-xs">{li.issue.id.toString().padStart(4, '0')}</td>
					<td class="font-medium">{li.issue.title}</td>
					<td><span class="badge badge-ghost badge-sm">{li.issue.issueType}</span></td>
					<td>
						<span class="badge badge-sm" style="background-color: var(--status-color, transparent)">
							{li.issue.status}
						</span>
					</td>
					<td>{li.issue.assignee ?? '—'}</td>
					<td>
						{#each li.issue.labels as l (l)}
							<span class="badge badge-outline badge-xs mr-1">{l}</span>
						{/each}
					</td>
					<td class="text-xs opacity-70">{li.issue.updatedDate}</td>
				</tr>
			{/each}
			{#if rows.length === 0}
				<tr>
					<td colspan="7" class="text-center opacity-60 py-8"
						>No issues match the current filter.</td
					>
				</tr>
			{/if}
		</tbody>
	</table>
</div>
