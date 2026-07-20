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

	const { issues, filter, editor } = getStores();

	type SortKey = 'id' | 'title' | 'updated_date' | 'status';
	type SortDir = 'asc' | 'desc';

	let sortKey = $state<SortKey>('updated_date');
	let sortDir = $state<SortDir>('desc');

	const sortedRows = $derived(
		Array.from(issues.byId.values())
			.filter((li) => {
				const f = filter.filter;
				if (f.status && li.issue.fields.status !== f.status) return false;
				if (f.type && li.issue.fields.issueType !== f.type) return false;
				if (f.q) {
					const needle = f.q.toLowerCase();
					if (
						!li.issue.fields.title.toLowerCase().includes(needle) &&
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
						return a.issue.fields.title.localeCompare(b.issue.fields.title) * dir;
					case 'status':
						return a.issue.fields.status.localeCompare(b.issue.fields.status) * dir;
					case 'updated_date':
						return a.issue.fields.updatedDate.localeCompare(b.issue.fields.updatedDate) * dir;
				}
			})
	);

	const groupBy = $derived(filter.filter.groupBy ?? 'none');

	const groups = $derived.by(() => {
		if (groupBy === 'sprint') {
			const sprintIssues = Array.from(issues.byId.values()).filter(
				(li) => li.issue.fields.issueType === 'sprint'
			);
			const definedGroups = sprintIssues.map((s) => ({
				id: `sprint-${s.issue.id}`,
				title: s.issue.fields.title,
				match: (issue: import('$lib/types').Issue) =>
					issue.fields.relations.some((r) => r.id === s.issue.id) ||
					s.issue.fields.relations.some((r) => r.id === issue.id)
			}));
			return [...definedGroups, { id: 'unassigned', title: 'Sin Asignar', match: () => true }];
		}
		if (groupBy === 'epic') {
			const epicIssues = Array.from(issues.byId.values()).filter(
				(li) => li.issue.fields.issueType === 'epic'
			);
			const definedGroups = epicIssues.map((e) => ({
				id: `epic-${e.issue.id}`,
				title: e.issue.fields.title,
				match: (issue: import('$lib/types').Issue) =>
					issue.fields.relations.some((r) => r.id === e.issue.id) ||
					e.issue.fields.relations.some((r) => r.id === issue.id)
			}));
			return [...definedGroups, { id: 'unassigned', title: 'Sin Asignar', match: () => true }];
		}
		return [{ id: 'all', title: 'Todos los Problemas', match: () => true }];
	});

	const groupedRows = $derived.by(() => {
		const result: Record<string, typeof sortedRows> = {};
		for (const g of groups) {
			result[g.id] = [];
		}

		for (const li of sortedRows) {
			const group =
				groupBy !== 'none'
					? groups.find((g) => g.id !== 'unassigned' && g.match(li.issue)) ||
						groups[groups.length - 1]
					: groups[0];

			if (group) {
				result[group.id].push(li);
			}
		}
		return result;
	});

	const rows = $derived.by(() => {
		const result: typeof sortedRows = [];
		for (const g of groups) {
			const gRows = groupedRows[g.id] ?? [];
			result.push(...gRows);
		}
		return result;
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

<div class="px-6 py-4" data-testid="list-view">
	<div
		class="mb-4 flex items-center justify-between text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
	>
		<span data-testid="list-view-count">
			{t('list.countPill', { filtered: filteredCount, total: total })}
		</span>
		<span>{t('list.sortLabel', { key: sortKey, dir: sortDir })}</span>
	</div>

	<div class="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
		<table class="w-full text-left text-sm whitespace-nowrap">
			<thead
				class="border-b border-border bg-surface text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
			>
				<tr>
					<th aria-sort={ariaSortFor('id')} class="px-4 py-3 font-semibold">
						<button
							type="button"
							class="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
							class="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
							class="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
							class="flex items-center gap-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
			{#each groups as group (group.id)}
				{@const groupRows = groupedRows[group.id] ?? []}
				{#if groupBy !== 'none' && (groupRows.length > 0 || group.id !== 'unassigned')}
					<tbody class="bg-surface-dark border-b border-border">
						<tr>
							<td colspan="7" class="px-4 py-2 text-sm font-bold text-foreground">
								{group.title}
								<span class="ml-2 text-xs font-normal text-muted-foreground opacity-70"
									>({groupRows.length})</span
								>
							</td>
						</tr>
					</tbody>
				{/if}
				<tbody class="divide-hairline divide-y">
					{#each groupRows as li (li.issue.id)}
						<tr
							class="cursor-pointer text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
							tabindex="0"
							role="button"
							data-row-id={li.issue.id}
							aria-label={t('list.rowAria', { id: li.issue.id, title: li.issue.fields.title })}
							onclick={() => open(li.issue.id)}
							onkeydown={(e) =>
								onRowKeydown(
									e,
									rows.findIndex((r) => r.issue.id === li.issue.id)
								)}
						>
							<td class="px-4 py-3 font-mono text-xs text-muted-foreground"
								>{li.issue.id.toString().padStart(4, '0')}</td
							>
							<td class="min-w-[20rem] truncate px-4 py-3 font-medium">{li.issue.fields.title}</td>
							<td class="px-4 py-3"
								><span
									class="rounded bg-foreground/5 px-2 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
									>{li.issue.fields.issueType}</span
								></td
							>
							<td class="px-4 py-3">
								<span
									class="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest"
									style="background-color: var(--status-color, var(--color-cb-muted)); color: #fff"
								>
									{li.issue.fields.status}
								</span>
							</td>
							<td class="px-4 py-3">{li.issue.fields.assignee ?? '—'}</td>
							<td class="px-4 py-3">
								{#each li.issue.fields.labels as l (l)}
									<span
										class="mr-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
										>{l}</span
									>
								{/each}
							</td>
							<td class="px-4 py-3 text-xs text-muted-foreground">{li.issue.fields.updatedDate}</td>
						</tr>
					{/each}
					{#if groupRows.length === 0 && (groupBy === 'none' || group.id !== 'unassigned')}
						<tr>
							<td colspan="7" class="py-12 text-center font-medium text-muted-foreground italic"
								>{t('list.empty')}</td
							>
						</tr>
					{/if}
				</tbody>
			{/each}
		</table>
	</div>
</div>
