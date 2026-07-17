<!--
	LeftRail.svelte — sticky left sidebar for quill.md (sub-phase 6C,
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
		{ id: 'gantt', label: t('leftrail.view.gantt') },
		{ id: 'graph', label: t('leftrail.view.graph') },
		{ id: 'tree', label: t('leftrail.view.tree') }
	] as const);

	const warningCount = $derived(stores.issues.integrityWarnings.length);
	const firstWarningId = $derived(
		warningCount > 0 ? (stores.issues.integrityWarnings[0]?.issue.id ?? null) : null
	);

	const mobileOpen = $derived(stores.ui.mobileNavOpen);
	function closeMobileNav() {
		stores.ui.closeMobileNav();
	}

	function onViewChange(id: string): void {
		if (id === 'list' || id === 'kanban' || id === 'gantt' || id === 'graph' || id === 'tree') {
			stores.view.setView(id as any);
			closeMobileNav();
		}
	}

	function reviewFirstWarning(): void {
		if (firstWarningId !== null) {
			stores.editor.open(firstWarningId);
			closeMobileNav();
		}
	}
</script>

{#if mobileOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
		onclick={closeMobileNav}
	></div>
{/if}

{#if collapsed}
	<aside
		data-testid="leftrail"
		data-collapsed="true"
		aria-label={t('leftrail.ariaLabel')}
		class="sticky top-[var(--topbar-height)] z-20 hidden h-[calc(100vh-var(--topbar-height))] w-[var(--leftrail-width-collapsed)] flex-col items-center gap-3 border-r border-border bg-surface py-4 transition-all duration-[var(--motion-base)] md:flex"
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
		class="fixed top-0 bottom-0 left-0 z-50 h-screen w-[var(--leftrail-width)] shrink-0 flex-col gap-4 border-r border-border bg-surface p-4 transition-transform duration-[var(--motion-base)] md:sticky md:top-[var(--topbar-height)] md:z-20 md:flex md:h-[calc(100vh-var(--topbar-height))] md:translate-x-0 {mobileOpen
			? 'flex translate-x-0 shadow-2xl'
			: 'hidden -translate-x-full md:flex md:shadow-none'}"
	>
		<div class="flex items-center gap-2 md:hidden">
			<h2 class="flex-1 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
				{t('leftrail.viewsHeading')}
			</h2>
			<IconButton label={t('common.close')} onclick={closeMobileNav}>
				<PanelLeftClose class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		<div class="hidden items-center gap-2 md:flex">
			<h2 class="flex-1 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
				{t('leftrail.viewsHeading')}
			</h2>
			<IconButton label={t('leftrail.collapseNav')} onclick={() => (collapsed = true)}>
				<PanelLeftClose class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		<Tabs tabs={viewTabs} value={stores.view.view} onchange={onViewChange} class="w-full" />

		{#if stores.templates.templates.length > 0}
			<h2 class="mt-4 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
				{t('leftrail.trackersHeading')}
			</h2>
			<div class="flex flex-col gap-1">
				{#each stores.templates.templates as tmpl (tmpl.id)}
					{@const active = stores.view.view === 'list' && stores.filter.filter.type === tmpl.id}
					<button
						type="button"
						class="flex cursor-pointer items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-[var(--motion-fast)] ease-out {active
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						onclick={() => {
							stores.view.setView('list');
							stores.filter.clear();
							stores.filter.set({ type: tmpl.id });
							closeMobileNav();
						}}
					>
						<span class="h-3 w-3 flex-shrink-0 rounded-full" style="background-color: {tmpl.color}"
						></span>
						<span class="truncate">{tmpl.name}</span>
					</button>
				{/each}
			</div>
		{/if}

		<h2 class="mt-4 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
			{t('leftrail.planningHeading')}
		</h2>
		<div class="flex flex-col gap-1">
			<button
				type="button"
				class="flex cursor-pointer items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-[var(--motion-fast)] ease-out {stores
					.view.view === 'backlog'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
				onclick={() => {
					stores.view.setView('backlog');
					closeMobileNav();
				}}
			>
				<span>{t('leftrail.view.backlog')}</span>
			</button>
			<button
				type="button"
				class="flex cursor-pointer items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-[var(--motion-fast)] ease-out {stores
					.view.view === 'sprint'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
				onclick={() => {
					stores.view.setView('sprint');
					closeMobileNav();
				}}
			>
				<span>{t('leftrail.view.sprint')}</span>
			</button>
		</div>

		{#if warningCount > 0 && firstWarningId !== null}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-start gap-2 rounded-md border border-[var(--color-cb-yellow)] bg-[var(--color-cb-yellow)]/10 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-[var(--color-cb-yellow)]/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
				onclick={reviewFirstWarning}
				aria-label={t('leftrail.integrityReview', { n: warningCount })}
			>
				<AlertTriangle class="h-4 w-4 shrink-0 text-[var(--color-cb-yellow)]" aria-hidden="true" />
				<span>
					{t('leftrail.integrityBadge', { n: warningCount })}
				</span>
			</button>
		{/if}

		<h2 class="mt-4 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
			{t('leftrail.filtersHeading')}
		</h2>
		<FilterBar />
	</aside>
{/if}
