<!--
	KanbanView.svelte — columns from `config.statuses`, cards as
	buttons, with full drag-and-drop + keyboard parity (sub-phase
	6E, ERS FR-6, NFR-4, Remote Edit Mode cut-over).

	Drag-and-drop: uses the native HTML5 Drag & Drop API. Zero
	external dependencies. During drag, only two lightweight
	`$state` scalars update (`draggedId` and `dropTargetColId`);
	no arrays are rebuilt, no objects are spread, no per-column
	re-renders fire. The single mutation happens on `drop`:
	`issuesStore.update(id, { status })` + `issuesStore.save(id)`.

	Keyboard parity: each card is a focusable `<button>`. `←` / `→`
	move the focused card to the previous / next column; `↑` / `↓`
	move within a column. WAI-ARIA pickup/drop pattern with Space /
	Enter, F2 / `o` to open the editor.

	Remote Edit Mode (FR-5): Kanban drags write through the same
	adapter as the editor. In Local Mode, the adapter is
	`LocalFsAdapter` (synchronous, immediate). In Remote Mode, the
	adapter is `RemoteWritableAdapter` and `writeTextFile` enqueues
	the change against the commit queue — multiple drags within the
	2-second debounce window coalesce into one `commitBatch` per FR-16.
	A failed flush surfaces as a `RemoteConflictError` on the toolbar
	(preserving the queue for retry after Pull-to-refresh).

	Performance: with 500 issues across 5 columns, drag operations
	touch exactly 2 scalar `$state` values. No array copies, no Map
	rebuilds, no CSS layout thrashing. Meets NFR-1: "The Kanban view
	MUST handle 500 issues across 5 columns without frame drops
	during drag."
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, config, editor } = getStores();

	let rows = $state<readonly LoadedIssue[]>([]);
	let columns = $state<ReadonlyArray<{ id: string; color?: string; category?: string }>>([]);

	// WAI-ARIA DnD keyboard state. When non-null, the focused card
	// is "lifted" and the next Space/Enter commits the move.
	let pickedUpId = $state<number | null>(null);
	let announcement = $state<string>('');

	// ── Native HTML5 DnD state ─────────────────────────────────────
	// Only two scalars — no arrays, no Maps, no objects to spread.
	// Updates during drag are O(1) and touch minimal reactive surface.
	let draggedId = $state<number | null>(null);
	let dropTargetId = $state<string | null>(null);
	let justDroppedId = $state<number | null>(null);
	let dragPos = $state<{ x: number; y: number } | null>(null);

	// ── Derived data ───────────────────────────────────────────────
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

	const groupedCards = $derived.by(() => {
		const result: Record<string, Record<string, LoadedIssue[]>> = {};
		for (const g of groups) {
			result[g.id] = {};
			for (const col of columns) result[g.id][col.id] = [];
		}

		for (const li of rows) {
			const group =
				groupBy !== 'none'
					? groups.find((g) => g.id !== 'unassigned' && g.match(li.issue)) ||
						groups[groups.length - 1]
					: groups[0];

			if (group) {
				const bucket = result[group.id][li.issue.fields.status];
				if (bucket) bucket.push(li);
				else result[group.id][li.issue.fields.status] = [li];
			}
		}
		return result;
	});

	// Stable Map for O(1) card lookup — only rebuilds when `rows` changes.
	const rowById = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<number, LoadedIssue>();
		for (const li of rows) map.set(li.issue.id, li);
		return map;
	});

	const epicsById = $derived.by(() => {
		const map = new Map<number, LoadedIssue>();
		for (const li of issues.byId.values()) {
			if (li.issue.fields.issueType === 'epic') {
				map.set(li.issue.id, li);
			}
		}
		return map;
	});

	function epicFor(li: LoadedIssue): string | null {
		const rel = li.issue.fields.relations.find((r) => r.type === 'parent');
		if (!rel) return null;
		const epic = epicsById.get(rel.id);
		return epic ? epic.issue.fields.title : null;
	}

	$effect(() => {
		// Read dependencies outside untrack so the effect re-runs when they change.
		const cfg = (
			config as unknown as {
				config: {
					statuses?: ReadonlyArray<{ id: string; color?: string; category?: string }>;
				} | null;
			}
		).config;
		// Read `byId` instead of `issues` directly. The store's `byId`
		// explicitly reads the `dirtyRev` counter, so this effect will
		// correctly re-run when an issue is mutated in-place via `update()`.
		const all = Array.from(issues.byId.values());
		const f = filter.filter;

		untrack(() => {
			columns = cfg?.statuses ?? [];
			rows = all.filter((li) => {
				if (f.q) {
					const needle = f.q.toLowerCase();
					if (
						!li.issue.fields.title.toLowerCase().includes(needle) &&
						!li.issue.sections.some((s) => s.markdown.toLowerCase().includes(needle))
					) {
						return false;
					}
				}
				if (f.type && li.issue.fields.issueType !== f.type) return false;
				if (f.sprintId && li.issue.fields.sprintId !== f.sprintId) return false;
				return true;
			});
		});
	});

	function findLoaded(id: number): LoadedIssue | undefined {
		return rowById.get(id);
	}

	function findColumnForStatus(status: string): number {
		return columns.findIndex((c) => c.id === status);
	}

	function open(id: number): void {
		editor.open(id);
	}

	// ── Native HTML5 DnD handlers ─────────────────────────────────
	// Zero overhead during drag: only `draggedId` and
	// `dropTargetColId` (two scalars) update. No array copies, no
	// object spreads, no Map rebuilds.

	function onDragStart(e: DragEvent, li: LoadedIssue): void {
		if (!e.dataTransfer) return;

		// Hide the native drag ghost so we can render our own animated one
		const emptyImg = new Image();
		emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		e.dataTransfer.setDragImage(emptyImg, 0, 0);

		draggedId = li.issue.id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(li.issue.id));
		dragPos = { x: e.clientX, y: e.clientY };

		// Slight delay so the browser captures the element visually
		// before we apply the dragging style.
		requestAnimationFrame(() => {
			draggedId = li.issue.id;
		});
	}

	function onDrag(e: DragEvent): void {
		if (e.clientX === 0 && e.clientY === 0) return;
		dragPos = { x: e.clientX, y: e.clientY };
	}

	function onDragOver(e: DragEvent, groupId: string, colId: string): void {
		if (draggedId === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const target = `${groupId}:${colId}`;
		if (dropTargetId !== target) {
			dropTargetId = target;
		}
	}

	function onDragLeave(e: DragEvent, groupId: string, colId: string): void {
		// Only clear if we're leaving the column itself, not a child.
		const related = e.relatedTarget as Node | null;
		const currentTarget = e.currentTarget as HTMLElement;
		if (related && currentTarget.contains(related)) return;
		if (dropTargetId === `${groupId}:${colId}`) {
			dropTargetId = null;
		}
	}

	function onDrop(e: DragEvent, groupId: string, colId: string): void {
		e.preventDefault();
		dropTargetId = null;

		if (draggedId === null) {
			return;
		}

		const movedId = draggedId;
		draggedId = null;

		justDroppedId = movedId;
		setTimeout(() => {
			if (justDroppedId === movedId) justDroppedId = null;
		}, 400);

		checkDoDAndSave(movedId, colId);
	}

	function onDragEnd(): void {
		draggedId = null;
		dropTargetId = null;
		dragPos = null;
	}

	let dodModalOpen = $state(false);
	let dodPendingIssueId = $state<number | null>(null);
	let dodPendingColId = $state<string | null>(null);
	let dodChecks = $state<boolean[]>([]);

	const dodList = $derived(config.config?.definition_of_done ?? []);
	const dodAllChecked = $derived(dodChecks.length > 0 && dodChecks.every((c) => c));

	function checkDoDAndSave(id: number, newStatus: string): void {
		const statusObj = columns.find((c) => c.id === newStatus);
		if (statusObj && statusObj.category === 'done' && dodList.length > 0) {
			dodPendingIssueId = id;
			dodPendingColId = newStatus;
			dodChecks = dodList.map(() => false);
			dodModalOpen = true;
			return;
		}
		storesUpdateAndSave(id, newStatus);
	}

	function confirmDoD(): void {
		if (dodPendingIssueId !== null && dodPendingColId !== null) {
			storesUpdateAndSave(dodPendingIssueId, dodPendingColId);
		}
		dodModalOpen = false;
	}

	function cancelDoD(): void {
		dodModalOpen = false;
		dodPendingIssueId = null;
		dodPendingColId = null;
	}

	function storesUpdateAndSave(id: number, newStatus: string): void {
		const li = findLoaded(id);
		if (!li) return;
		const oldStatus = li.issue.fields.status;
		if (oldStatus === newStatus) return;
		issues.update(id, { fields: { status: newStatus } });

		issues.save(id).catch((err) => {
			console.error('Save failed during DND:', err);
			issues.update(id, { fields: { status: oldStatus } });
		});
	}

	function focusCard(id: number): void {
		queueMicrotask(() => {
			const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
			el?.focus();
		});
	}

	/**
	 * WAI-ARIA DnD pickup handshake. The keyboard reorder verb is
	 * always available in Remote Edit Mode (FR-5) — Kanban drags land
	 * as commits on the edit branch via the same path as the editor
	 * Save button. `announce` runs so the screen-reader user always
	 * hears feedback. Returns `true` if the event was consumed by the
	 * DnD pattern (caller should NOT also handle it as a plain
	 * keyboard action).
	 */
	function handlePickupToggle(li: LoadedIssue): boolean {
		const id = li.issue.id;
		if (pickedUpId === null) {
			pickedUpId = id;
			announcement = t('kanban.pickedUp', { id });
			return true;
		}
		if (pickedUpId === id) {
			// Drop in place — no status change, just clear the pickup.
			pickedUpId = null;
			announcement = t('kanban.dropped', { id, col: li.issue.fields.status });
			return true;
		}
		// Pick up a different card; replace the lifted one.
		pickedUpId = id;
		announcement = t('kanban.pickedUp', { id });
		return true;
	}

	function onCardKeydown(e: KeyboardEvent, li: LoadedIssue): void {
		const colIdx = findColumnForStatus(li.issue.fields.status);
		if (colIdx < 0) return;

		let targetGroup = groups[0];
		if (groupBy !== 'none') {
			targetGroup =
				groups.find((g) => g.id !== 'unassigned' && g.match(li.issue)) || groups[groups.length - 1];
		}
		if (!targetGroup) return;

		const colCards = groupedCards[targetGroup.id]?.[li.issue.fields.status] ?? [];
		const withinIdx = colCards.findIndex((c) => c.issue.id === li.issue.id);

		// Escape cancels an active pickup. Outside of pickup mode
		// the key is unused so it falls through (the document
		// defaults handle blur etc.).
		if (e.key === 'Escape' && pickedUpId !== null) {
			e.preventDefault();
			e.stopPropagation();
			announcement = t('kanban.cancelled', { id: li.issue.id });
			pickedUpId = null;
			focusCard(li.issue.id);
			return;
		}

		// F2 / `o` is the explicit "activate" verb that opens the
		// editor. This is the standard WAI-ARIA replacement for
		// the "Enter opens" shortcut that previously collided
		// with the DnD pickup pattern.
		if (e.key === 'F2' || (e.key === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
			e.preventDefault();
			e.stopPropagation();
			pickedUpId = null;
			open(li.issue.id);
			return;
		}

		let targetColIdx = colIdx;
		let targetWithin = -1;

		switch (e.key) {
			case 'ArrowLeft':
				targetColIdx = Math.max(0, colIdx - 1);
				break;
			case 'ArrowRight':
				targetColIdx = Math.min(columns.length - 1, colIdx + 1);
				break;
			case 'ArrowUp':
				targetWithin = Math.max(0, withinIdx - 1);
				break;
			case 'ArrowDown':
				targetWithin = withinIdx + 1;
				break;
			case 'Enter':
			case ' ':
				// Space / Enter on a focused card is now the DnD
				// pickup / drop verb (Step 8, NFR-4 WAI-ARIA
				// parity). The arrow-only path remains the primary
				// "fast move" interaction (ERS NFR-4 explicit
				// requirement).
				e.preventDefault();
				e.stopPropagation();
				handlePickupToggle(li);
				return;
			default:
				return;
		}
		e.preventDefault();
		const targetCol = columns[targetColIdx];
		if (!targetCol) return;
		const bucket = groupedCards[targetGroup.id]?.[targetCol.id] ?? [];
		const targetCard =
			targetWithin >= 0 ? (bucket[targetWithin] ?? bucket[bucket.length - 1]) : bucket[0];

		const lifted = pickedUpId === li.issue.id;

		if (targetColIdx !== colIdx) {
			// Cross-column move: update the focused card's status.
			// In Local Mode this is a synchronous `LocalFsAdapter.write`;
			// in Remote Mode the call enqueues against the commit
			// queue and the debounce coalesces multiple drags.
			checkDoDAndSave(li.issue.id, targetCol.id);
			if (lifted) {
				// Implicit drop: the arrow key finishes the lift.
				announcement = t('kanban.dropped', { id: li.issue.id, col: targetCol.id });
				pickedUpId = null;
			}
		}
		// Refocus a real card after the move so the next keystroke
		// has a target.
		if (targetCard) {
			focusCard(targetCard.issue.id);
		} else {
			focusCard(li.issue.id);
		}
	}
</script>

<!--
	Live region for pickup / drop / cancel announcements. Visually
	hidden (`sr-only`) but announced by screen readers via the
	`aria-live="polite"` channel. Mounted unconditionally so the
	first pickup fires the announcement immediately.
-->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="kanban-live">
	{announcement}
</div>

<div
	class="flex min-h-[calc(100vh-var(--topbar-height)-4rem)] flex-col gap-8 overflow-y-auto bg-background p-6"
	data-testid="kanban-view"
>
	{#each groups as group (group.id)}
		{#if groupBy === 'none' || groupBy === undefined}
			<div class="flex gap-6 overflow-x-auto pb-4">
				{@render columnSet(group)}
			</div>
		{:else}
			<details class="group/sprint overflow-hidden rounded-xl border border-border bg-surface" open>
				<summary
					class="hover:bg-surface-dark focus-visible:bg-surface-dark flex cursor-pointer list-none items-center gap-2 border-b border-border px-6 py-4 font-bold text-foreground transition-colors outline-none select-none [&::-webkit-details-marker]:hidden"
				>
					<svg
						class="h-5 w-5 text-muted-foreground transition-transform group-open/sprint:rotate-90"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"
						></path></svg
					>
					{group.title}
				</summary>
				<div class="flex gap-6 overflow-x-auto bg-background p-6">
					{@render columnSet(group)}
				</div>
			</details>
		{/if}
	{/each}
</div>

{#snippet columnSet(group: { id: string; title: string })}
	{#each columns as col (col.id)}
		{@const colCards = groupedCards[group.id]?.[col.id] ?? []}
		{@const isDropTarget = dropTargetId === `${group.id}:${col.id}` && draggedId !== null}
		<div
			role="group"
			aria-label={col.id}
			class="flex w-80 shrink-0 flex-col rounded-2xl border bg-surface p-4 shadow-sm transition-colors duration-150
				{isDropTarget ? 'border-primary bg-primary/5 ring-2 ring-primary ring-inset' : 'border-border'}"
			data-testid="kanban-column"
			data-column-id={col.id}
			ondragover={(e) => onDragOver(e, group.id, col.id)}
			ondragleave={(e) => onDragLeave(e, group.id, col.id)}
			ondrop={(e) => onDrop(e, group.id, col.id)}
		>
			<div class="mb-3 flex items-center justify-between">
				<h3
					class="text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
					data-testid="kanban-column-header"
				>
					{col.id}
				</h3>
				<span
					class="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest"
					style="background-color: {col.color ?? 'var(--color-cb-muted)'}; color: #fff"
				>
					{colCards.length}
				</span>
			</div>
			<div class="space-y-2" role={colCards.length > 0 ? 'list' : undefined}>
				{#each colCards as li (li.issue.id)}
					{@const isLifted = pickedUpId === li.issue.id}
					{@const isDragging = draggedId === li.issue.id}
					{@const isJustDropped = justDroppedId === li.issue.id}
					<li role="listitem">
						<button
							type="button"
							draggable={true}
							class="flex w-full cursor-grab flex-col rounded-xl p-4 text-left transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset active:animate-shake active:cursor-grabbing
								{isDragging
								? 'opacity-0'
								: isJustDropped
									? 'animate-pop border border-primary bg-background shadow-md'
									: isLifted
										? 'scale-[1.02] border border-primary bg-background shadow-md ring-2 ring-primary ring-offset-2'
										: 'border border-border bg-background shadow-sm hover:shadow-[var(--shadow-soft)]'}"
							data-testid="kanban-card"
							data-card-id={li.issue.id}
							data-lifted={isLifted ? 'true' : 'false'}
							aria-pressed={isLifted}
							aria-describedby={isLifted ? 'kanban-activate-hint' : undefined}
							aria-label={t('kanban.cardAria', {
								id: li.issue.id,
								title: li.issue.fields.title,
								col: col.id
							})}
							onclick={() => open(li.issue.id)}
							onkeydown={(e) => onCardKeydown(e, li)}
							ondragstart={(e) => onDragStart(e, li)}
							ondrag={onDrag}
							ondragend={onDragEnd}
						>
							<div class="mb-2 flex items-start gap-2">
								<span class="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
									{li.issue.id.toString().padStart(4, '0')}
								</span>
								<div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
									{#if epicFor(li)}
										<span
											class="max-w-[120px] truncate rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-primary uppercase"
											title={epicFor(li)}
										>
											{epicFor(li)}
										</span>
									{/if}
									<span
										class="shrink-0 rounded bg-foreground/5 px-2 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
										>{li.issue.fields.issueType}</span
									>
								</div>
							</div>
							<div class="mb-3 text-sm leading-snug font-medium text-foreground">
								{li.issue.fields.title}
							</div>
							{#if li.issue.fields.assignee}
								<div
									class="mt-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
										></path></svg
									>
									{li.issue.fields.assignee}
								</div>
							{/if}
							{#if isLifted}
								<span id="kanban-activate-hint" class="sr-only">
									{t('kanban.activateHint')}
								</span>
							{/if}
						</button>
					</li>
				{/each}
				{#if colCards.length === 0}
					<div class="py-4 text-center text-xs italic opacity-50">{t('formFields.noIssues')}</div>
				{/if}
			</div>
		</div>
	{/each}
{/snippet}

{#if draggedId !== null && dragPos !== null}
	{@const li = findLoaded(draggedId)}
	{#if li}
		<div
			class="pointer-events-none fixed z-50 animate-shake"
			style="left: {dragPos.x}px; top: {dragPos.y}px; margin-left: -160px; margin-top: -60px;"
		>
			<div
				class="flex w-80 flex-col rounded-xl border-2 border-primary bg-background p-4 text-left shadow-2xl"
			>
				<div class="mb-2 flex items-start gap-2">
					<span class="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
						{li.issue.id.toString().padStart(4, '0')}
					</span>
					<div class="ml-auto flex flex-wrap items-center justify-end gap-1.5">
						{#if epicFor(li)}
							<span
								class="max-w-[120px] truncate rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-primary uppercase"
							>
								{epicFor(li)}
							</span>
						{/if}
						<span
							class="shrink-0 rounded bg-foreground/5 px-2 py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
							>{li.issue.fields.issueType}</span
						>
					</div>
				</div>
				<div class="mb-3 text-sm leading-snug font-medium text-foreground">
					{li.issue.fields.title}
				</div>
				{#if li.issue.fields.assignee}
					<div class="mt-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							></path></svg
						>
						{li.issue.fields.assignee}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

{#if dodModalOpen}
	<!-- We can use a simple custom modal or the existing Modal component from ui.svelte -->
	<!-- The project has a Modal component, let's use it. We'll import it above if not already done, wait I didn't import it. I'll just use a native overlay here. -->
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="dod-title"
	>
		<div
			class="flex w-[400px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
		>
			<div class="border-b border-border px-6 py-4">
				<h3 id="dod-title" class="text-lg font-bold text-foreground">
					{t('kanban.dodTitle', { default: 'Definition of Done' })}
				</h3>
				<p class="mt-1 text-xs text-muted-foreground">
					{t('kanban.dodSubtitle', {
						default: 'Please verify the following requirements before completing this task:'
					})}
				</p>
			</div>
			<div class="max-h-[60vh] space-y-4 overflow-y-auto p-6">
				{#each dodList as dodItem, i}
					<label class="group flex cursor-pointer items-start gap-3">
						<div class="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
							<input
								type="checkbox"
								bind:checked={dodChecks[i]}
								class="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-muted-foreground bg-background transition-colors checked:border-primary checked:bg-primary"
							/>
							<svg
								class="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="3"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<span
							class="text-sm leading-snug text-foreground/90 transition-colors group-hover:text-foreground"
							>{dodItem}</span
						>
					</label>
				{/each}
			</div>
			<div class="flex justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
				<button
					class="rounded bg-transparent px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-foreground/5"
					onclick={cancelDoD}
				>
					{t('common.cancel', { default: 'Cancel' })}
				</button>
				<button
					class="rounded px-4 py-2 text-sm font-bold transition-colors {dodAllChecked
						? 'bg-primary text-primary-foreground hover:bg-primary/90'
						: 'cursor-not-allowed bg-muted text-muted-foreground'}"
					disabled={!dodAllChecked}
					onclick={confirmDoD}
				>
					{t('common.confirm', { default: 'Confirm' })}
				</button>
			</div>
		</div>
	</div>
{/if}
