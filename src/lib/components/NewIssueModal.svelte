<!--
	NewIssueModal.svelte — type-picker modal for the toolbar's
	"New issue" button (sub-phase 6E, ERS FR-1).

	Mounted by `LocalToolbar.svelte` only in Local Edit Mode (the
	toolbar hides the trigger when `modeStore.mode === 'remote'`).

	Behaviour:
	  - 6B `Modal` with a title and a search input that filters by
	    template name (case-insensitive, partial match).
	  - Grid of type cards (3 columns on `md:`, 1 on `sm:`). Each card
	    shows the template's icon, name, field count, and section count.
	    Clicking anywhere on the card selects it; the type-id is held
	    in `selectedId`. The "Create" CTA at the bottom-right of the
	    modal confirms.
	  - Templates are read from `templatesStore.templates`; the icon
	    comes from `template.icon` (a lucide icon name). The mapping
	    from the template's string `icon` to a real lucide component
	    is a static table — unknown names fall back to a generic
	    `Tag` icon. The table is local to this file (per the brief's
	    "prefer to put the mapping in the component itself" note).

	On Create:
	  - Calls `issuesStore.create({ title: 'Untitled',
	    issueType: <id>, author: 'local-user' })` and `await`s the
	    new id. The store is the single point that brands the id and
	    pushes the new `LoadedIssue` into `issues.issues`.
	  - Closes the modal.
	  - Opens the new issue in the editor via `editorStore.open(newId)`.
	    The editor is already wired (6D) and immediately renders the
	    draft panel.
-->
<script lang="ts">
	import { Modal, Input } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import type { Template } from '$lib/types';
	import { getStores } from '$lib/state';
	import type { Component } from 'svelte';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Bug from '@lucide/svelte/icons/bug';
	import CheckSquare from '@lucide/svelte/icons/check-square';
	import FileText from '@lucide/svelte/icons/file-text';
	import Flag from '@lucide/svelte/icons/flag';
	import GitBranch from '@lucide/svelte/icons/git-branch';
	import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
	import Layers from '@lucide/svelte/icons/layers';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Package from '@lucide/svelte/icons/package';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Tag from '@lucide/svelte/icons/tag';
	import Wrench from '@lucide/svelte/icons/wrench';
	import Zap from '@lucide/svelte/icons/zap';

	type Props = {
		open: boolean;
		onclose: () => void;
	};

	let { open = $bindable(), onclose }: Props = $props();

	const stores = getStores();

	let search = $state('');
	let selectedId = $state<string | null>(null);
	let creating = $state(false);
	let createError = $state<string | null>(null);

	// Map lucide icon name → component. Unknown names fall back to Tag.
	// The table is small and stable; keep it local per the 6E brief
	// ("prefer to put the mapping in the component itself").
	const ICONS: Readonly<Record<string, Component>> = {
		bug: Bug,
		'check-square': CheckSquare,
		'file-text': FileText,
		flag: Flag,
		'git-branch': GitBranch,
		'git-pull-request': GitPullRequest,
		layers: Layers,
		'list-checks': ListChecks,
		package: Package,
		sparkles: Sparkles,
		tag: Tag,
		wrench: Wrench,
		zap: Zap
	};

	function iconFor(name: string): Component {
		return ICONS[name] ?? Tag;
	}

	const allTemplates = $derived(stores.templates.templates);

	const filtered = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return allTemplates;
		return allTemplates.filter((t) => t.name.toLowerCase().includes(needle));
	});

	$effect(() => {
		// When the template list changes (load completes), reset selection
		// if the previously-selected type is no longer present.
		if (selectedId !== null && !allTemplates.some((t) => t.id === selectedId)) {
			selectedId = null;
		}
		// Re-init on first open: keep selection cleared until user picks.
		if (!open) {
			search = '';
			selectedId = null;
			createError = null;
		}
	});

	function pick(tmpl: Template): void {
		selectedId = tmpl.id;
	}

	async function create(): Promise<void> {
		if (!selectedId) return;
		creating = true;
		createError = null;
		try {
			const newId = await stores.issues.create({
				title: 'Untitled',
				issueType: selectedId,
				author: 'local-user'
			});
			open = false;
			stores.editor.open(newId);
		} catch (cause) {
			createError = (cause as Error).message;
		} finally {
			creating = false;
		}
	}

	function close(): void {
		open = false;
		onclose();
	}
</script>

<Modal bind:open onclose={close} class="max-w-2xl">
	<div class="mb-3 flex items-start justify-between gap-3">
		<h2 class="text-lg font-semibold">{t('newIssueModal.title')}</h2>
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			onclick={close}
			aria-label={t('newIssueModal.closeAria')}>×</button
		>
	</div>

	<Input
		bind:value={search}
		placeholder={t('newIssueModal.searchPlaceholder')}
		type="search"
		class="mb-3"
	/>

	{#if filtered.length === 0}
		<div
			class="flex flex-col items-center gap-2 rounded-md border border-dashed border-base-300 p-6 text-center text-sm opacity-70"
		>
			<AlertTriangle class="h-6 w-6" aria-hidden="true" />
			<p>{t('newIssueModal.noMatch', { q: search })}</p>
		</div>
	{:else}
		<ul
			class="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-3"
			role="list"
			data-testid="new-issue-type-grid"
		>
			{#each filtered as tmpl (tmpl.id)}
				{@const Icon = iconFor(tmpl.icon)}
				{@const isSelected = selectedId === tmpl.id}
				<li>
					<button
						type="button"
						class="flex w-full flex-col items-start gap-2 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {isSelected
							? 'border-primary bg-primary/10'
							: 'border-base-300 hover:border-base-content/30 hover:bg-base-200'}"
						aria-pressed={isSelected}
						aria-label={t('newIssueModal.selectType', { name: tmpl.name })}
						data-testid="new-issue-type-card"
						data-type-id={tmpl.id}
						onclick={() => pick(tmpl)}
					>
						<Icon class="h-5 w-5" aria-hidden="true" />
						<div class="text-sm font-semibold">{tmpl.name}</div>
						<div class="text-xs opacity-70">
							{t('newIssueModal.fieldCount', { n: tmpl.fields.length })} ·
							{t('newIssueModal.sectionCount', { n: tmpl.sections.length })}
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if createError}
		<p class="text-error mt-3 text-xs" role="alert">{createError}</p>
	{/if}

	<footer class="mt-4 flex items-center justify-end gap-2">
		<button type="button" class="btn btn-ghost btn-sm" onclick={close}>{t('common.cancel')}</button>
		<button
			type="button"
			class="btn btn-primary btn-sm"
			disabled={!selectedId || creating}
			aria-busy={creating || undefined}
			onclick={() => void create()}
			data-testid="new-issue-create"
		>
			{#if creating}
				<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
			{/if}
			{t('newIssueModal.create')}
		</button>
	</footer>
</Modal>
