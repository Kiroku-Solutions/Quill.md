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
	import Download from '@lucide/svelte/icons/download';

	const { issues, filter, editor, config, ui } = getStores();

	type SortKey = 'id' | 'title' | 'updated_date' | 'status';
	type SortDir = 'asc' | 'desc';

	let sortKey = $state<SortKey>('title');
	let sortDir = $state<SortDir>('asc');

	const sortedRows = $derived(
		Array.from(issues.byId.values())
			.filter((li) => {
				const f = filter.filter;
				if (f.statusCategory && f.statusCategory !== 'all') {
					const cfg = config.config;
					if (cfg) {
						const statusDef = cfg.statuses.find((s) => s.id === li.issue.fields.status);
						const isClosed = statusDef?.category === 'done' || statusDef?.category === 'cancelled';
						if (f.statusCategory === 'open' && isClosed) return false;
						if (f.statusCategory === 'closed' && !isClosed) return false;
					}
				}
				if (f.status && li.issue.fields.status !== f.status) return false;
				if (f.type && li.issue.fields.issueType !== f.type) return false;
				if (f.sprintId) {
					const inSprint =
						li.issue.fields.sprintId === f.sprintId ||
						li.issue.fields.relations.some((r) => r.id === f.sprintId);
					if (!inSprint) return false;
				}
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
						return a.issue.id.localeCompare(b.issue.id, undefined, { numeric: true }) * dir;
					case 'title':
						return (
							a.issue.fields.title.localeCompare(b.issue.fields.title, undefined, {
								numeric: true
							}) * dir
						);
					case 'status':
						return (
							a.issue.fields.status.localeCompare(b.issue.fields.status, undefined, {
								numeric: true
							}) * dir
						);
					case 'updated_date':
						return (
							a.issue.fields.updatedDate.localeCompare(b.issue.fields.updatedDate, undefined, {
								numeric: true
							}) * dir
						);
				}
			})
	);

	const groupBy = $derived(filter.filter.groupBy ?? 'none');

	const groups = $derived.by(() => {
		if (groupBy === 'sprint') {
			const sprintIssues = Array.from(issues.byId.values()).filter(
				(li) => li.issue.fields.issueType === 'sprint'
			);
			const definedGroups = sprintIssues
				.sort((a, b) =>
					a.issue.fields.title.localeCompare(b.issue.fields.title, undefined, { numeric: true })
				)
				.map((s) => ({
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
			const definedGroups = epicIssues
				.sort((a, b) =>
					a.issue.fields.title.localeCompare(b.issue.fields.title, undefined, { numeric: true })
				)
				.map((e) => ({
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

	let currentPage = $state(1);
	const pageSize = 50;

	import { untrack } from 'svelte';
	$effect(() => {
		// Reset page to 1 when filter changes
		void filter.filter;
		untrack(() => {
			currentPage = 1;
		});
	});

	const total = $derived(issues.issues.length);
	const filteredCount = $derived(rows.length);
	const totalPages = $derived(Math.max(1, Math.ceil(filteredCount / pageSize)));

	const paginatedRows = $derived(rows.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	const paginatedGroupedRows = $derived.by(() => {
		const result: Record<string, typeof sortedRows> = {};
		for (const g of groups) {
			result[g.id] = [];
		}
		for (const li of paginatedRows) {
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

	function toggleSort(k: SortKey): void {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortKey = k;
			sortDir = 'asc';
		}
	}

	function open(id: string): void {
		editor.open(id);
	}

	function exportGroup(groupId: string): void {
		const gRows = groupedRows[groupId] ?? [];
		if (gRows.length === 0) return;
		const issuesToExport = gRows.map((li) => li.issue);
		ui.openExport({ type: 'issues', data: issuesToExport });
	}

	function ariaSortFor(k: SortKey): 'ascending' | 'descending' | 'none' {
		if (sortKey !== k) return 'none';
		return sortDir === 'asc' ? 'ascending' : 'descending';
	}

	function onRowKeydown(e: KeyboardEvent, globalIdx: number): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const li = paginatedRows[globalIdx];
			if (li) open(li.issue.id);
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const delta = e.key === 'ArrowDown' ? 1 : -1;
			const nextIdx = Math.max(0, Math.min(paginatedRows.length - 1, globalIdx + delta));
			const next = paginatedRows[nextIdx];
			if (next) {
				void focusRow(next.issue.id);
			}
		}
	}

	async function focusRow(id: string): Promise<void> {
		await tick();
		const el = document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
		el?.focus();
	}

	onMount(() => {
		if (paginatedRows.length > 0) {
			void focusRow(paginatedRows[0].issue.id);
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
				{@const groupRows = paginatedGroupedRows[group.id] ?? []}
				{#if groupBy !== 'none' && (groupRows.length > 0 || (group.id !== 'unassigned' && (groupedRows[group.id]?.length ?? 0) > 0))}
					<tbody class="bg-surface-dark border-b border-border">
						<tr>
							<td colspan="7" class="px-4 py-2 text-sm font-bold text-foreground">
								<div class="flex items-center justify-between">
									<div>
										{group.title}
										<span class="ml-2 text-xs font-normal text-muted-foreground opacity-70"
											>({groupRows.length})</span
										>
									</div>
									<button
										type="button"
										class="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
										onclick={() => exportGroup(group.id)}
										aria-label={t('common.exportGroup', { default: 'Exportar grupo' }) ??
											'Exportar grupo'}
									>
										<Download class="h-3 w-3" aria-hidden="true" />
										{t('common.export', { default: 'Exportar' }) ?? 'Exportar'}
									</button>
								</div>
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
									paginatedRows.findIndex((r) => r.issue.id === li.issue.id)
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

	{#if totalPages > 1}
		<div class="mt-4 flex items-center justify-between text-sm">
			<span class="text-muted-foreground">
				Page {currentPage} of {totalPages}
			</span>
			<div class="flex items-center gap-2">
				<button
					class="rounded-md border border-border bg-background px-3 py-1 text-foreground transition-colors hover:bg-surface disabled:opacity-50 disabled:hover:bg-background"
					disabled={currentPage <= 1}
					onclick={() => currentPage--}
				>
					{t('common.previous', { default: 'Previous' })}
				</button>
				<button
					class="rounded-md border border-border bg-background px-3 py-1 text-foreground transition-colors hover:bg-surface disabled:opacity-50 disabled:hover:bg-background"
					disabled={currentPage >= totalPages}
					onclick={() => currentPage++}
				>
					{t('common.next', { default: 'Next' })}
				</button>
			</div>
		</div>
	{/if}
</div>
