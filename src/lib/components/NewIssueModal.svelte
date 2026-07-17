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
	import Milestone from '@lucide/svelte/icons/milestone';
	import Flame from '@lucide/svelte/icons/flame';
	import BookOpen from '@lucide/svelte/icons/book-open';

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
		flame: Flame,
		'book-open': BookOpen,
		milestone: Milestone,
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
			const template = allTemplates.find((t) => t.id === selectedId);
			const customFields: Record<string, unknown> = {};
			const sections = template
				? template.sections.map((s) => ({ name: s.name, markdown: s.default ?? '' }))
				: [];

			if (template) {
				for (const field of template.fields) {
					// Don't set a default for obligatory fields unless they have one?
					// Wait, we don't have default values in the TemplateField type!
					// Wait, if it's a multi-select or relations, default is []
					if (field.type === 'multi-select' || field.type === 'relations') {
						customFields[field.key] = [];
					}
				}
			}

			const newId = await stores.issues.create({
				title: 'Untitled',
				issueType: selectedId,
				author: 'local-user',
				customFields,
				sections
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
	<div class="mb-5 flex items-start justify-between gap-3">
		<h2 class="text-xl font-bold tracking-tight text-foreground">{t('newIssueModal.title')}</h2>
		<button
			type="button"
			class="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
			onclick={close}
			aria-label={t('newIssueModal.closeAria')}
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				></path></svg
			>
		</button>
	</div>

	<Input
		bind:value={search}
		placeholder={t('newIssueModal.searchPlaceholder')}
		type="search"
		class="mb-3"
	/>

	{#if filtered.length === 0}
		<div
			class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground"
		>
			<AlertTriangle class="h-6 w-6" aria-hidden="true" />
			<p>{t('newIssueModal.noMatch', { q: search })}</p>
		</div>
	{:else}
		<ul
			class="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1"
			role="list"
			data-testid="new-issue-type-grid"
		>
			{#each filtered as tmpl (tmpl.id)}
				{@const Icon = iconFor(tmpl.icon)}
				{@const isSelected = selectedId === tmpl.id}
				<li>
					<button
						type="button"
						class="group flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors duration-[var(--motion-base)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset {isSelected
							? 'border-primary bg-primary/5 ring-1 ring-primary'
							: 'border-border hover:border-muted hover:bg-surface'}"
						aria-pressed={isSelected}
						aria-label={t('newIssueModal.selectType', { name: tmpl.name })}
						data-testid="new-issue-type-card"
						data-type-id={tmpl.id}
						onclick={() => pick(tmpl)}
					>
						<div class="flex items-center gap-4">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md {isSelected
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground transition-colors group-hover:text-foreground'}"
							>
								<Icon class="h-5 w-5" aria-hidden="true" />
							</div>
							<div class="flex flex-col">
								<span class="text-sm font-bold text-foreground">{tmpl.name}</span>
								<span class="text-xs text-muted-foreground opacity-70">
									{t('newIssueModal.fieldCount', { n: tmpl.fields.length })} ·
									{t('newIssueModal.sectionCount', { n: tmpl.sections.length })}
								</span>
							</div>
						</div>
						<div
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors {isSelected
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-border bg-transparent'}"
						>
							{#if isSelected}
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="3"
										d="M5 13l4 4L19 7"
									></path></svg
								>
							{/if}
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if createError}
		<p class="mt-3 text-xs text-error" role="alert">{createError}</p>
	{/if}

	<footer class="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
		<button
			type="button"
			class="rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
			onclick={close}
		>
			{t('common.cancel')}
		</button>
		<button
			type="button"
			class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			disabled={!selectedId || creating}
			aria-busy={creating || undefined}
			onclick={() => void create()}
			data-testid="new-issue-create"
		>
			{#if creating}
				<svg
					class="h-4 w-4 animate-spin text-current"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle><path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path></svg
				>
			{/if}
			{t('newIssueModal.create')}
		</button>
	</footer>
</Modal>
