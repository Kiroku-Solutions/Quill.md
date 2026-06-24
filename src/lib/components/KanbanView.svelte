<!--
	KanbanView.svelte — columns from `config.statuses`, cards as
	buttons, with full drag-and-drop + keyboard parity (sub-phase
	6E, ERS FR-6, NFR-4).

	Behaviours added in 6E:
	  - Drag-and-drop via `svelte-dnd-action`. The library's `dndzone`
	    action is wired to each column; on drop, the moved card's
	    `status` updates via `issuesStore.update(id, { status })` and
	    `issuesStore.save(id)`.
	  - Keyboard parity: each card is a focusable `<button>`. `←` / `→`
	    move the focused card to the previous / next column; `↑` / `↓`
	    move within a column; `Enter` / `Space` open the editor. The
	    reorders operate on the `rows` array — reorders that would
	    violate the current filter are no-ops.
	  - Read-only guard: in Remote Mode (`modeStore.mode === 'remote'`)
	    the drop handler is a no-op and the keyboard reorder is a
	    no-op. The card visually moves during drag (the library owns
	    the drop animation) but the store is not updated. The column
	    header carries a tooltip explaining the guard.

	Step 8 (NFR-4 — WAI-ARIA DnD keyboard parity):
	  - Adds the WAI-ARIA "pickup / drop" pattern as a *second* keyboard
	    path on top of the existing arrow-key commit (ERS NFR-4:
	    "arrow keys to move the focused card between columns").
	  - `Space` / `Enter` on a focused card = pickup (announces
	    `pickedUp`). A second `Space` / `Enter` = drop in place. While
	    picked up, `←` / `→` move the card to the adjacent column AND
	    commit (the same effect as the arrow-only path) and announce
	    `dropped`. `Escape` cancels (announces `cancelled`) and the
	    per-column arrays are rebuilt from the source-of-truth `rows`.
	  - `F2` is the standard "activate" verb and opens the editor;
	    `o` is offered as a mnemonic alias. Click continues to open the
	    editor.
	  - Pickup / drop are no-ops in Remote Mode (the read-only guard).

	Reactivity note:
	  The `cardsByStatus` map is the source of truth that
	  `svelte-dnd-action`'s `dndzone` reads (via its `items` option).
	  Making it a plain `Record<string, Card[]>` (not `$state`)
	  avoids the update-depth-exceeded loop that the dndzone's
	  internal `update()` call would otherwise create when the
	  effect re-derives the map from `rows`. The template reads
	  `cardsByStatus` directly; the dndzone action handles the
	  in-flight drag updates via its `consider` / `finalize`
	  events without going through the reactive graph.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import type { LoadedIssue } from '$lib/types';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	const { issues, filter, config, editor, mode } = getStores();

	const isReadOnly = $derived(mode.mode === 'remote');

	let rows = $state<readonly LoadedIssue[]>([]);
	let columns = $state<ReadonlyArray<{ id: string; color?: string }>>([]);

	type Card = { id: number; kind: 'card' };

	// Plain (non-reactive) `Record`; the dndzone action needs an
	// array reference per column and would otherwise trigger a
	// depth-exceeded loop when the effect re-derives the map.
	// The template reads through a `getColumnCards(colId)`
	// accessor; the action passes the array directly.
	const cardsByStatus: Record<string, Card[]> = {};

	// WAI-ARIA DnD keyboard state (Step 8). When non-null, the
	// focused card is "lifted" and the next Space/Enter commits
	// the move. The DnD action keeps the visual state in sync via
	// `cardsByStatus`; this slot only owns the keyboard handshake.
	let pickedUpId = $state<number | null>(null);
	let announcement = $state<string>('');

	function rebuildCardsByStatus(): void {
		for (const col of columns) cardsByStatus[col.id] = [];
		for (const li of rows) {
			const bucket = cardsByStatus[li.issue.status];
			if (bucket) bucket.push({ id: li.issue.id, kind: 'card' });
			else if (!cardsByStatus[li.issue.status]) cardsByStatus[li.issue.status] = [];
		}
	}

	$effect(() => {
		// `untrack` the writes to `columns` and `rows` and the read of
		// `rows` from `rebuildCardsByStatus` so the effect does not
		// re-run when those slots are re-assigned. The effect's
		// reactive surface is the upstream store reads
		// (`config.config`, `issues.issues`, `filter.filter`).
		untrack(() => {
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
			// Mutate the plain Record inside `untrack` so the reads of
			// `columns` and `rows` from `rebuildCardsByStatus` are not
			// tracked as effect dependencies.
			rebuildCardsByStatus();
		});
	});

	function findLoaded(id: number): LoadedIssue | undefined {
		return rows.find((li) => li.issue.id === id);
	}

	function findColumnForStatus(status: string): number {
		return columns.findIndex((c) => c.id === status);
	}

	function open(id: number): void {
		editor.open(id);
	}

	function onConsider(e: CustomEvent<DndEvent<Card>>, colId: string): void {
		// Mirror the dndzone's local array update so the visual state
		// matches what the user is dragging. The library requires this
		// during the `consider` phase; we persist on `finalize`.
		cardsByStatus[colId] = [...e.detail.items];
	}

	function onFinalize(e: CustomEvent<DndEvent<Card>>, colId: string): void {
		const next = e.detail.items;
		cardsByStatus[colId] = [...next];
		const previousIds = new Set((cardsByStatus[colId] ?? []).map((c) => c.id));
		const newIds = new Set(next.map((c) => c.id));
		const movedId = [...newIds].find((id) => !previousIds.has(id)) ?? null;
		if (movedId === null) {
			// Reorder within the same column — the library's visual
			// reordering is enough; we don't persist because the row
			// order isn't a first-class property of the `rows`
			// derived (it's a filtered, sorted view).
			return;
		}
		if (isReadOnly) {
			// Read-only: rebuild the per-column arrays from `rows`
			// so the next render is the un-mutated state.
			rebuildCardsByStatus();
			return;
		}
		const li = findLoaded(movedId);
		if (!li) return;
		storesUpdateAndSave(movedId, colId);
	}

	function storesUpdateAndSave(id: number, newStatus: string): void {
		const li = findLoaded(id);
		if (!li) return;
		if (li.issue.status === newStatus) return;
		issues.update(id, { status: newStatus });
		void issues.save(id);
	}

	function focusCard(id: number): void {
		queueMicrotask(() => {
			const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
			el?.focus();
		});
	}

	/**
	 * WAI-ARIA DnD pickup handshake. Idempotent in read-only mode
	 * (Remote): `announce` runs so the screen-reader user still
	 * hears feedback; the store update is the no-op the read-only
	 * guard already enforces. Returns `true` if the event was
	 * consumed by the DnD pattern (caller should NOT also handle
	 * it as a plain keyboard action).
	 */
	function handlePickupToggle(li: LoadedIssue): boolean {
		const id = li.issue.id;
		if (pickedUpId === null) {
			pickedUpId = id;
			announcement = t('kanban.pickedUp', { id });
			return true;
		}
		if (pickedUpId === id) {
			// Drop in place — no status change, just clear the
			// pickup. In read-only mode there is nothing to undo;
			// announce "dropped" so the user gets the same
			// feedback as a successful move.
			pickedUpId = null;
			announcement = t('kanban.dropped', { id, col: li.issue.status });
			return true;
		}
		// Pick up a different card; replace the lifted one.
		pickedUpId = id;
		announcement = t('kanban.pickedUp', { id });
		return true;
	}

	function onCardKeydown(e: KeyboardEvent, li: LoadedIssue): void {
		const colIdx = findColumnForStatus(li.issue.status);
		if (colIdx < 0) return;
		const colCards = cardsByStatus[li.issue.status] ?? [];
		const withinIdx = colCards.findIndex((c) => c.id === li.issue.id);

		// Escape cancels an active pickup. Outside of pickup mode
		// the key is unused so it falls through (the document
		// defaults handle blur etc.).
		if (e.key === 'Escape' && pickedUpId !== null) {
			e.preventDefault();
			e.stopPropagation();
			announcement = t('kanban.cancelled', { id: li.issue.id });
			pickedUpId = null;
			rebuildCardsByStatus();
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
		const bucket = cardsByStatus[targetCol.id] ?? [];
		const targetCard =
			targetWithin >= 0 ? (bucket[targetWithin] ?? bucket[bucket.length - 1]) : bucket[0];

		const lifted = pickedUpId === li.issue.id;

		if (isReadOnly) {
			// Read-only: move the visual focus only — no store update.
			if (targetCard) focusCard(targetCard.id);
			return;
		}
		if (targetColIdx !== colIdx) {
			// Cross-column move: update the focused card's status.
			storesUpdateAndSave(li.issue.id, targetCol.id);
			if (lifted) {
				// Implicit drop: the arrow key finishes the lift.
				announcement = t('kanban.dropped', { id: li.issue.id, col: targetCol.id });
				pickedUpId = null;
			}
		}
		// Refocus a real card after the move so the next keystroke
		// has a target.
		if (targetCard) {
			focusCard(targetCard.id);
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

<div class="flex gap-4 overflow-x-auto bg-base-100 p-4" data-testid="kanban-view">
	{#each columns as col (col.id)}
		{@const colCards = cardsByStatus[col.id] ?? []}
		<div
			class="bg-base-200 flex w-72 shrink-0 flex-col rounded-md p-3"
			data-testid="kanban-column"
			data-column-id={col.id}
		>
			{#if isReadOnly}
				<Tooltip text={t('kanban.readOnlyTooltip')} position="bottom">
					<div class="mb-3 flex items-center justify-between">
						<h3
							class="text-sm font-semibold uppercase tracking-wide"
							data-testid="kanban-column-header"
						>
							{col.id}
						</h3>
						<span
							class="badge badge-sm"
							style="background-color: {col.color ?? 'transparent'}; color: #000"
						>
							{colCards.length}
						</span>
					</div>
				</Tooltip>
			{:else}
				<div class="mb-3 flex items-center justify-between">
					<h3
						class="text-sm font-semibold uppercase tracking-wide"
						data-testid="kanban-column-header"
					>
						{col.id}
					</h3>
					<span
						class="badge badge-sm"
						style="background-color: {col.color ?? 'transparent'}; color: #000"
					>
						{colCards.length}
					</span>
				</div>
			{/if}
			<div
				class="space-y-2"
				use:dndzone={{
					items: colCards,
					flipDurationMs: 200,
					dragDisabled: isReadOnly,
					dropFromOthersDisabled: isReadOnly
				}}
				onconsider={isReadOnly
					? undefined
					: (e) => onConsider(e as CustomEvent<DndEvent<Card>>, col.id)}
				onfinalize={isReadOnly
					? undefined
					: (e) => onFinalize(e as CustomEvent<DndEvent<Card>>, col.id)}
			>
				{#each colCards as card (card.id)}
					{@const li = findLoaded(card.id)}
					{@const isLifted = pickedUpId === li?.issue.id}
					{#if li}
						<li role="listitem">
							<button
								type="button"
								class="card bg-base-100 w-full p-3 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
									{isLifted ? 'ring-primary scale-[1.02] shadow-md ring-2 ring-offset-2' : ''}"
								data-testid="kanban-card"
								data-card-id={li.issue.id}
								data-lifted={isLifted ? 'true' : 'false'}
								aria-pressed={isLifted}
								aria-describedby={isLifted ? 'kanban-activate-hint' : undefined}
								aria-label={t('kanban.cardAria', {
									id: li.issue.id,
									title: li.issue.title,
									col: col.id
								})}
								onclick={() => open(li.issue.id)}
								onkeydown={(e) => onCardKeydown(e, li)}
							>
								<div class="mb-1 flex items-start justify-between">
									<span class="font-mono text-xs opacity-60">
										{li.issue.id.toString().padStart(4, '0')}
									</span>
									<span class="badge badge-ghost badge-xs">{li.issue.issueType}</span>
								</div>
								<div class="text-sm font-medium leading-tight">{li.issue.title}</div>
								{#if li.issue.assignee}
									<div class="mt-1 text-xs opacity-70">@{li.issue.assignee}</div>
								{/if}
								{#if isLifted}
									<!--
										Hidden descriptor attached via aria-describedby
										above. Always mounted so the ID resolution is
										stable; the visual content is `sr-only`.
									-->
									<span id="kanban-activate-hint" class="sr-only">
										{t('kanban.activateHint')}
									</span>
								{/if}
							</button>
						</li>
					{/if}
				{/each}
				{#if colCards.length === 0}
					<div class="py-4 text-center text-xs italic opacity-50">{t('formFields.noIssues')}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
