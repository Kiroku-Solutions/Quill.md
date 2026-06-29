<!--
	ListView.svelte — sortable table of issues (sub-phase 6E polish).

	Behaviours inherited from 6C:
	  - Inline filter logic (search / status / type) is unchanged; the
	    6C tests cover it. The `rows` derived array is the source of
	    truth for the table body.

	Behaviours added in 6E:
	  - Sort indicator chevron (▲/▼) next to the active sort column.
	    The chevron is `aria-hidden="true"`; the active sort direction
	    is communicated via `aria-sort` on the `<th>`.
	  - "X of Y issues" header above the table — X is the filtered
	    count, Y is the total.
	  - Full keyboard nav: ↓ / ↑ move the focused row, Enter / Space
	    open the editor. Each row is `tabindex="0"` with `role="button"`
	    and an `aria-label` like "Open issue N: <title>". The first
	    row is auto-focused on mount.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, editor } = getStores();

	type SortKey = 'id' | 'title' | 'updated_date' | 'status';
	type SortDir = 'asc' | 'desc';

	let rows = $state<readonly LoadedIssue[]>([]);
	let sortKey = $state<SortKey>('updated_date');
	let sortDir = $state<SortDir>('desc');

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

	const total = $derived(issues.issues.length);
	const filteredCount = $derived(rows.length);

	function toggleSort(k: SortKey): void {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = k;
			sortDir = 'asc';
		}
	}

	function open(id: number): void {
		editor.open(id);
	}

	function ariaSortFor(k: SortKey): 'ascending' | 'descending' | 'none' {
		if (sortKey !== k) return 'none';
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}

	function onRowKeydown(e: KeyboardEvent, idx: number): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const li = rows[idx];
			if (li) open(li.issue.id);
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const delta = e.key === 'ArrowDown' ? 1 : -1;
			const nextIdx = Math.max(0, Math.min(rows.length - 1, idx + delta));
			const next = rows[nextIdx];
			if (next) {
				void focusRow(next.issue.id);
			}
		}
	}

	async function focusRow(id: number): Promise<void> {
		await tick();
		const el = document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
		el?.focus();
	}

	onMount(() => {
		if (rows.length > 0) {
			void focusRow(rows[0].issue.id);
		}
	});
</script>

<div class="px-4 py-3" data-testid="list-view">
	<div class="mb-2 flex items-center justify-between text-xs opacity-70">
		<span data-testid="list-view-count">
			{t('list.countPill', { filtered: filteredCount, total: total })}
		</span>
		<span>{t('list.sortLabel', { key: sortKey, dir: sortDir })}</span>
	</div>

	<div class="overflow-x-auto">
		<table class="table table-zebra table-sm">
			<thead>
				<tr>
					<th aria-sort={ariaSortFor('id')}>
						<button
							type="button"
							class="btn btn-ghost btn-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							onclick={() => toggleSort('id')}
						>
							{t('list.headers.id')}
							{#if sortKey === 'id'}<span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span
								>{/if}
						</button>
					</th>
					<th aria-sort={ariaSortFor('title')}>
						<button
							type="button"
							class="btn btn-ghost btn-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							onclick={() => toggleSort('title')}
						>
							{t('list.headers.title')}
							{#if sortKey === 'title'}<span aria-hidden="true"
									>{sortDir === 'asc' ? '▲' : '▼'}</span
								>{/if}
						</button>
					</th>
					<th>{t('list.headers.type')}</th>
					<th aria-sort={ariaSortFor('status')}>
						<button
							type="button"
							class="btn btn-ghost btn-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							onclick={() => toggleSort('status')}
						>
							{t('list.headers.status')}
							{#if sortKey === 'status'}<span aria-hidden="true"
									>{sortDir === 'asc' ? '▲' : '▼'}</span
								>{/if}
						</button>
					</th>
					<th>{t('list.headers.assignee')}</th>
					<th>{t('list.headers.labels')}</th>
					<th aria-sort={ariaSortFor('updated_date')}>
						<button
							type="button"
							class="btn btn-ghost btn-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
							onclick={() => toggleSort('updated_date')}
						>
							{t('list.headers.updated')}
							{#if sortKey === 'updated_date'}<span aria-hidden="true"
									>{sortDir === 'asc' ? '▲' : '▼'}</span
								>{/if}
						</button>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as li, idx (li.issue.id)}
					<tr
						class="hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
						tabindex="0"
						role="button"
						data-row-id={li.issue.id}
						aria-label={t('list.rowAria', { id: li.issue.id, title: li.issue.title })}
						onclick={() => open(li.issue.id)}
						onkeydown={(e) => onRowKeydown(e, idx)}
					>
						<td class="font-mono text-xs">{li.issue.id.toString().padStart(4, '0')}</td>
						<td class="font-medium">{li.issue.title}</td>
						<td><span class="badge badge-ghost badge-sm">{li.issue.issueType}</span></td>
						<td>
							<span
								class="badge badge-sm"
								style="background-color: var(--status-color, transparent)"
							>
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
						<td colspan="7" class="py-8 text-center opacity-60">{t('list.empty')}</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
