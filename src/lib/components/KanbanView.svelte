<script lang="ts">
	import { getStores } from '$lib/state';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, config, editor } = getStores();

	let rows = $state<readonly LoadedIssue[]>([]);
	let columns = $state<ReadonlyArray<{ id: string; color?: string }>>([]);

	$effect(() => {
		const cfg = (
			config as unknown as {
				config: { statuses?: ReadonlyArray<{ id: string; color?: string }> } | null;
			}
		).config;
		columns = cfg?.statuses ?? [];
		const all = issues.issues;
		const f = filter.filter;
		rows = all.filter((li) => {
			if (f.q) {
				const needle = f.q.toLowerCase();
				if (
					!li.issue.title.toLowerCase().includes(needle) &&
					!li.issue.sections.some((s) => s.markdown.toLowerCase().includes(needle))
				) {
					return false;
				}
			}
			if (f.type && li.issue.issueType !== f.type) return false;
			return true;
		});
	});

	function cardsFor(status: string): LoadedIssue[] {
		return rows.filter((li) => li.issue.status === status);
	}

	function open(id: number): void {
		editor.open(id);
	}
</script>

<div class="flex gap-4 overflow-x-auto p-4 bg-base-100">
	{#each columns as col (col.id)}
		<div class="flex-shrink-0 w-72 bg-base-200 rounded-md p-3">
			<div class="flex items-center justify-between mb-3">
				<h3 class="font-semibold text-sm uppercase tracking-wide">{col.id}</h3>
				<span
					class="badge badge-sm"
					style="background-color: {col.color ?? 'transparent'}; color: #000"
				>
					{cardsFor(col.id).length}
				</span>
			</div>
			<div class="space-y-2">
				{#each cardsFor(col.id) as li (li.issue.id)}
					<button
						type="button"
						class="card bg-base-100 shadow-sm w-full text-left p-3 hover:shadow-md transition"
						onclick={() => open(li.issue.id)}
					>
						<div class="flex justify-between items-start mb-1">
							<span class="font-mono text-xs opacity-60">
								{li.issue.id.toString().padStart(4, '0')}
							</span>
							<span class="badge badge-ghost badge-xs">{li.issue.issueType}</span>
						</div>
						<div class="font-medium text-sm leading-tight">{li.issue.title}</div>
						{#if li.issue.assignee}
							<div class="text-xs opacity-70 mt-1">@{li.issue.assignee}</div>
						{/if}
					</button>
				{/each}
				{#if cardsFor(col.id).length === 0}
					<div class="text-xs opacity-50 italic text-center py-4">No issues</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
