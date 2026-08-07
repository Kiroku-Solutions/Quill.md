<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Modal, Checkbox } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { exportDocuments } from '$lib/services/exporter';
	import FileText from '@lucide/svelte/icons/file-text';
	import { getStores } from '$lib/state';
	import { buildExportDocuments } from '$lib/services/export-helper';
	import type { ExportPayload } from '$lib/state/ui.svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
		payload: ExportPayload | null;
		defaultFilename?: string;
	};

	let { open = $bindable(), onclose, payload, defaultFilename = 'export' }: Props = $props();

	const stores = getStores();
	let format = $state<'pdf' | 'docx'>('pdf');
	let exporting = $state(false);
	let exportError = $state<string | null>(null);
	let includeRelations = $state(true);

	const documents = $derived.by(() => {
		if (!payload) return [];
		if (payload.type === 'documents') return payload.data;
		return buildExportDocuments(
			payload.data,
			(id) => stores.issues.byId.get(id)?.issue.fields.title ?? null,
			{ includeRelations }
		);
	});

	let uncheckedTitles = new SvelteSet<string>();

	const selectedDocuments = $derived(documents.filter((doc) => !uncheckedTitles.has(doc.title)));

	$effect(() => {
		if (!open) {
			exportError = null;
			exporting = false;
			format = 'pdf';
			uncheckedTitles.clear();
		}
	});

	function toggleDocumentSelection(title: string) {
		if (uncheckedTitles.has(title)) {
			uncheckedTitles.delete(title);
		} else {
			uncheckedTitles.add(title);
		}
	}

	async function doExport(): Promise<void> {
		if (selectedDocuments.length === 0) return;
		exporting = true;
		exportError = null;

		try {
			await exportDocuments(selectedDocuments, {
				format,
				filename: `${defaultFilename}.${format}`
			});
			close();
		} catch (cause) {
			exportError = (cause as Error).message;
		} finally {
			exporting = false;
		}
	}

	function close(): void {
		open = false;
		onclose();
	}
</script>

<Modal bind:open onclose={close} class="export-modal">
	<div class="flex flex-col">
		<div class="mb-5 flex items-start justify-between gap-3">
			<h2 class="text-xl font-bold tracking-tight text-foreground">
				{t('exportModal.title') || 'Export Document'}
			</h2>
			<button
				type="button"
				class="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
				onclick={close}
				aria-label={t('exportModal.closeAria') || 'Close'}
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

		<p class="mb-4 text-sm text-muted-foreground">
			{t('exportModal.description', { count: selectedDocuments.length }) ||
				`You are about to export ${selectedDocuments.length} document(s). Select the output format below:`}
		</p>

		<div class="mb-6 grid grid-cols-2 gap-4">
			<button
				type="button"
				class="group flex flex-col items-center justify-center gap-3 rounded-lg border-2 p-4 transition-colors {format ===
				'pdf'
					? 'border-primary bg-primary/5 text-primary'
					: 'border-border bg-surface text-muted-foreground hover:border-muted hover:text-foreground'}"
				onclick={() => (format = 'pdf')}
			>
				<FileText class="h-8 w-8" />
				<span class="font-semibold">{t('exportModal.pdf')}</span>
			</button>

			<button
				type="button"
				class="group flex flex-col items-center justify-center gap-3 rounded-lg border-2 p-4 transition-colors {format ===
				'docx'
					? 'border-primary bg-primary/5 text-primary'
					: 'border-border bg-surface text-muted-foreground hover:border-muted hover:text-foreground'}"
				onclick={() => (format = 'docx')}
			>
				<FileText class="h-8 w-8" />
				<span class="font-semibold">{t('exportModal.docx')}</span>
			</button>
		</div>

		{#if payload?.type === 'issues'}
			<div class="mb-6 flex items-center justify-center">
				<Checkbox
					id="include-relations"
					label={t('exportModal.includeRelations', {
						default: 'Incluir contexto de relaciones (Sprints, Epicas)'
					}) ?? 'Incluir contexto'}
					checked={includeRelations}
					onchange={(e) => (includeRelations = e.currentTarget.checked)}
				/>
			</div>
		{/if}

		{#if documents.length > 1}
			<div class="mb-6 max-h-40 overflow-y-auto rounded-md border border-border p-2">
				<div class="mb-2 text-xs font-semibold text-muted-foreground uppercase">
					{t('exportModal.selectDocuments', { default: 'Documents to Export' })}
				</div>
				<div class="flex flex-col gap-2">
					{#each documents as doc (doc.title)}
						<label class="flex cursor-pointer items-center gap-2 text-sm text-foreground">
							<input
								type="checkbox"
								class="h-4 w-4 cursor-pointer rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-background"
								checked={!uncheckedTitles.has(doc.title)}
								onchange={() => toggleDocumentSelection(doc.title)}
							/>
							<span class="truncate">{doc.title}</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		{#if exportError}
			<p class="mt-3 text-xs text-error" role="alert">{exportError}</p>
		{/if}

		<footer class="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
			<button
				type="button"
				class="rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
				onclick={close}
			>
				{t('common.cancel') || 'Cancel'}
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				disabled={documents.length === 0 || exporting}
				aria-busy={exporting || undefined}
				onclick={() => void doExport()}
			>
				{#if exporting}
					<svg
						class="h-4 w-4 animate-spin text-current"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				{/if}
				{t('exportModal.export') || 'Export'}
			</button>
		</footer>
	</div>
</Modal>

<style>
	/* Bypass Tailwind HMR by using Svelte's native style compilation.
	   This guarantees the dialog gets its responsive dimensions even 
	   if the dev server hasn't rescanned the utility classes. */
	:global(dialog.export-modal) {
		width: 90vw !important;
		max-width: 28rem !important; /* 448px */
	}
</style>
