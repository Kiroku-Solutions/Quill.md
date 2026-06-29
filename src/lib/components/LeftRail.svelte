<!--
	LeftRail.svelte — sticky left sidebar for nomad.md (sub-phase 6C,
	ERS §4.1.1 item 2).

	Behaviour:
	  - Sticky below the TopBar, `--leftrail-width` wide. Subtle right
	    border (`border-base-300`) on a `bg-base-200` surface.
	  - Contains the view switcher (List / Kanban / Gantt — built on the
	    `Tabs` 6B primitive, wired to `viewStore.view`).
	  - Embeds the existing `FilterBar` component inside a collapsible
	    panel. Collapse state is local (`$state`), starts expanded, not
	    persisted.
	  - Shows the integrity warning count as a clickable Badge when
	    `issuesStore.integrityWarnings.length > 0`. Click opens the
	    first affected issue in the editor.
	  - A "Collapse" toggle in the rail header flips the rail between
	    `--leftrail-width` and `--leftrail-width-collapsed`. When
	    collapsed, only the icons (no labels) are visible.

	Why this is the only place the view switcher lives in v0:
	the ERS calls for a "view switcher (List / Kanban / Gantt)" in the
	left rail (item 2 of §4.1.1). 6C ships the rail; 6E refines the
	view components and wires the rest of the toolbar (new issue,
	refresh, etc.).
-->
<script lang="ts">
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import { IconButton, Tabs } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import FilterBar from './FilterBar.svelte';
	import { getStores } from '$lib/state';

	let collapsed = $state(false);

	const stores = getStores();

	const viewTabs = $derived([
		{ id: 'list', label: t('leftrail.view.list') },
		{ id: 'kanban', label: t('leftrail.view.kanban') },
		{ id: 'gantt', label: t('leftrail.view.gantt') }
	] as const);

	const warningCount = $derived(stores.issues.integrityWarnings.length);
	const firstWarningId = $derived(
		warningCount > 0 ? (stores.issues.integrityWarnings[0]?.issue.id ?? null) : null
	);

	function onViewChange(id: string): void {
		if (id === 'list' || id === 'kanban' || id === 'gantt') {
			stores.view.setView(id);
		}
	}

	function reviewFirstWarning(): void {
		if (firstWarningId !== null) {
			stores.editor.open(firstWarningId);
		}
	}
</script>

{#if collapsed}
	<aside
		data-testid="leftrail"
		data-collapsed="true"
		aria-label={t('leftrail.ariaLabel')}
		class="sticky top-[var(--topbar-height)] z-20 hidden h-[calc(100vh-var(--topbar-height))] w-[var(--leftrail-width-collapsed)] flex-col items-center gap-3 border-r border-base-300 bg-base-200 py-3 md:flex"
	>
		<IconButton label={t('leftrail.expandNav')} onclick={() => (collapsed = false)}>
			<PanelLeftOpen class="h-5 w-5" aria-hidden="true" />
		</IconButton>
		{#if warningCount > 0 && firstWarningId !== null}
			<IconButton
				label={t('leftrail.integrityAria', { n: warningCount })}
				onclick={reviewFirstWarning}
			>
				<AlertTriangle class="h-5 w-5 text-warning" aria-hidden="true" />
			</IconButton>
		{/if}
	</aside>
{:else}
	<aside
		data-testid="leftrail"
		data-collapsed="false"
		aria-label={t('leftrail.ariaLabel')}
		class="sticky top-[var(--topbar-height)] z-20 hidden h-[calc(100vh-var(--topbar-height))] w-[var(--leftrail-width)] shrink-0 flex-col gap-3 border-r border-base-300 bg-base-200 p-3 md:flex"
	>
		<div class="flex items-center gap-2">
			<h2 class="flex-1 text-xs font-semibold uppercase tracking-wide opacity-70">
				{t('leftrail.viewsHeading')}
			</h2>
			<IconButton label={t('leftrail.collapseNav')} onclick={() => (collapsed = true)}>
				<PanelLeftClose class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		<Tabs tabs={viewTabs} value={stores.view.view} onchange={onViewChange} class="w-full" />

		{#if warningCount > 0 && firstWarningId !== null}
			<button
				type="button"
				class="badge badge-warning w-full cursor-pointer justify-start gap-2 py-3 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
				onclick={reviewFirstWarning}
				aria-label={t('leftrail.integrityReview', { n: warningCount })}
			>
				<AlertTriangle class="h-4 w-4 shrink-0" aria-hidden="true" />
				<span>
					{t('leftrail.integrityBadge', { n: warningCount })}
				</span>
			</button>
		{/if}

		<h2 class="mt-2 text-xs font-semibold uppercase tracking-wide opacity-70">
			{t('leftrail.filtersHeading')}
		</h2>
		<FilterBar />
	</aside>
{/if}
