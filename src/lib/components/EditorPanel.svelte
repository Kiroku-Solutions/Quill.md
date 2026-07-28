<!--
	EditorPanel.svelte — the editor side drawer (sub-phase 6G,
	Remote Edit Mode cut-over).

	Layout: header (id + title + close ×) → integrity warning →
	conflict Alert (when the remote commit queue reports a failure) →
	Tabs (Form / Write / Preview) → footer (Save / Discard / close).
	ESC closes the panel while it is open. The active section lives
	in local `$state`; `editor.patchSection` is the only write path.

	Remote Edit Mode (FR-5): the Save / Discard / Delete actions work
	in both Local and Remote Mode. The Save button commits through the
	same writable adapter as the issues store — Local Mode writes
	through `LocalFsAdapter`, Remote Mode queues a write against the
	commit queue via `RemoteWritableAdapter`. A conflict from the
	remote commit queue surfaces inline as an Alert so the user does
	not have to close the panel to learn the save failed.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { isAnyRemoteError } from '$lib/adapters/feature-detect';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Tabs from '$lib/ui/Tabs.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import X from '@lucide/svelte/icons/x';
	import FormFields from './FormFields.svelte';
	import MarkdownPreview from './MarkdownPreview.svelte';

	const { editor, mode, templates, issues } = getStores();

	type TabId = 'form' | 'write' | 'preview';

	let activeTab = $state<TabId>('form');
	let _userSection = $state<string | null>(null);

	const active = $derived(editor.activeId !== null ? editor.draft : null);

	const template = $derived(
		active ? (templates.byType.get(active.issue.fields.issueType) ?? null) : null
	);

	/** The header suppresses its own title input when the template declares one. */
	const templateHasTitleField = $derived(
		template ? template.fields.some((f) => f.key === 'title') : false
	);

	const idBadge = $derived(active ? String(active.issue.id).padStart(4, '0') : '');

	const sections = $derived(active ? active.issue.sections : []);

	const activeSectionName = $derived(
		_userSection && sections.some((s) => s.name === _userSection)
			? _userSection
			: (sections[0]?.name ?? null)
	);

	const activeSection = $derived(
		sections.find((s) => s.name === activeSectionName) ?? sections[0] ?? null
	);

	const sectionNav = $derived(sections.map((s) => ({ id: s.name, label: s.name })));

	const isRemote = $derived(mode.mode === 'remote');
	/**
	 * The remote commit queue surfaces deferred conflicts as `lastError`.
	 * Render an Alert inside the panel so the user does not have to
	 * close the editor and look at the toolbar to learn the save
	 * failed. The toolbar also renders the same error.
	 */
	const queueError = $derived(isRemote ? mode.commitQueue.lastError : null);
	const isRemoteError = $derived(queueError !== null && isAnyRemoteError(queueError));

	const tabList = $derived([
		{ id: 'form' as TabId, label: t('editor.tabs.form') },
		{ id: 'write' as TabId, label: t('editor.tabs.write') },
		{ id: 'preview' as TabId, label: t('editor.tabs.preview') }
	]);

	const canSave = $derived(editor.isDirty && editor.errors.length === 0);
	const canDiscard = $derived(editor.isDirty);

	function setTab(id: string): void {
		activeTab = id as TabId;
	}
	function setActiveSection(id: string): void {
		_userSection = id;
	}
	function save(): void {
		void editor.save();
	}
	function discard(): void {
		editor.discard();
	}
	function close(): void {
		editor.close();
	}
	async function pullToRefresh(): Promise<void> {
		// Open the PAT prompt via a "soft" refresh: we re-trigger the
		// toolbar's Refresh handler by navigating away and back, but the
		// simpler path is to just show the alert and let the user click
		// Refresh in the toolbar (which mounts the PAT prompt). Keep
		// this stub for future expansion (e.g. an inline PAT input).
		void close();
	}

	/** ESC closes the panel while it is open. */
	$effect(() => {
		if (editor.activeId === null) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.preventDefault();
				editor.close();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if active}
	<aside
		class="fixed inset-y-0 right-0 z-40 flex w-[40rem] max-w-full flex-col border-l border-border bg-background"
		data-testid="editor-panel"
	>
		<div
			class="flex items-center gap-3 border-b border-border px-6 py-4"
			data-testid="editor-panel-header"
		>
			<span class="font-mono text-xs opacity-60">{idBadge}</span>
			{#if !templateHasTitleField}
				<Input
					value={active.issue.fields.title}
					oninput={(e) => editor.patchField('title', (e.currentTarget as HTMLInputElement).value)}
					class="flex-1"
				/>
			{:else}
				<div class="flex-1 text-sm font-semibold">{active.issue.fields.title}</div>
			{/if}
			<IconButton label={t('editor.closeAria')} onclick={close} data-testid="editor-panel-close">
				<X class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		{#if editor.integrityWarning}
			<div class="px-2 pt-2" data-testid="editor-panel-integrity-warning">
				<Alert variant="warning">
					{t('integrity.editorWarning')}
				</Alert>
			</div>
		{/if}

		{#if isRemoteError && queueError}
			<div class="px-2 pt-2" data-testid="editor-panel-remote-conflict">
				<Alert variant="error">
					{queueError.message}
					<Button variant="secondary" size="sm" class="ml-2" onclick={pullToRefresh}>
						{t('common.refresh')}
					</Button>
				</Alert>
			</div>
		{/if}

		<div class="px-2 pt-2">
			<Tabs tabs={tabList} value={activeTab} onchange={setTab} />
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-3">
			{#if activeTab === 'form'}
				<FormFields />
			{:else}
				{#if sectionNav.length > 0}
					<div
						class="mb-4 flex flex-wrap gap-1 border-b border-border pb-2"
						role="tablist"
						aria-label={t('editor.sectionsAria')}
						data-testid="editor-section-nav"
					>
						{#each sectionNav as sec (sec.id)}
							{@const isOn = sec.id === activeSectionName}
							<button
								type="button"
								role="tab"
								aria-selected={isOn}
								class="rounded-md px-3 py-1.5 text-xs font-semibold tracking-wider uppercase transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset {isOn
									? 'bg-foreground text-background'
									: 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'}"
								onclick={() => setActiveSection(sec.id)}
							>
								{sec.label}
							</button>
						{/each}
					</div>
				{/if}

				{#if activeTab === 'write'}
					{#if activeSection}
						<Textarea
							value={activeSection.markdown}
							oninput={(e) =>
								editor.patchSection(
									activeSection.name,
									(e.currentTarget as HTMLTextAreaElement).value
								)}
							rows={14}
							class="font-mono text-sm"
							data-testid="editor-section-textarea"
						/>
					{:else}
						<p class="text-sm opacity-60">{t('editor.noSectionsEdit')}</p>
					{/if}
				{:else}
					{#if activeSection}
						<MarkdownPreview markdown={activeSection.markdown} />
					{:else}
						<p class="text-sm opacity-60">{t('editor.noSectionsPreview')}</p>
					{/if}
				{/if}
			{/if}
		</div>

		<footer
			class="flex items-center gap-3 border-t border-border bg-surface px-6 py-4"
			data-testid="editor-panel-footer"
		>
			<Tooltip text={t('editor.deleteTooltip') ?? 'Delete this issue'} position="top">
				<Button
					variant="ghost"
					size="sm"
					class="text-error hover:bg-error/10 hover:text-error"
					onclick={() => {
						if (editor.activeId !== null) {
							const id = editor.activeId;
							editor.close();
							void issues.remove(id);
						}
					}}
					data-testid="editor-panel-delete"
				>
					{t('common.delete') ?? 'Delete'}
				</Button>
			</Tooltip>
			<Button
				variant="primary"
				size="sm"
				disabled={!canSave}
				onclick={save}
				data-testid="editor-panel-save"
			>
				{t('common.save')}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={!canDiscard}
				onclick={discard}
				data-testid="editor-panel-discard"
			>
				{t('common.discard')}
			</Button>

			{#if editor.errors.length > 0}
				<Tooltip
					text={editor.errors.map((e) => e.message).join('\n')}
					position="top"
					class="ml-auto"
				>
					<span class="cursor-help text-xs text-error" data-testid="editor-panel-error-count">
						{t('common.validationErrors', { n: editor.errors.length })}
					</span>
				</Tooltip>
			{:else if editor.isDirty}
				<span class="ml-auto text-xs opacity-60">{t('editor.unsaved')}</span>
			{/if}

			<Button variant="ghost" size="sm" onclick={close} data-testid="editor-panel-footer-close">
				{t('editor.footerClose')}
			</Button>
		</footer>
	</aside>
{/if}
