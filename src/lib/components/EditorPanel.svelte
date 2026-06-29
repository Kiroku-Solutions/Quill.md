<!--
	EditorPanel.svelte — the editor side drawer (sub-phase 6G).

	Layout: header (id + title + close ×) → integrity warning →
	Tabs (Form / Write / Preview) → footer (Save / Discard / close).
	ESC closes the panel while it is open. The active section lives
	in local `$state`; `editor.patchSection` is the only write path.

	Read-only guard: in Remote Mode the Save / Discard buttons are
	disabled with tooltips (6F inheritance).
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
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

	const { editor, mode, templates } = getStores();

	type TabId = 'form' | 'write' | 'preview';

	let activeTab = $state<TabId>('form');
	let activeSectionName = $state<string | null>(null);

	const active = $derived(editor.activeId !== null ? editor.draft : null);

	const template = $derived(active ? (templates.byType.get(active.issue.issueType) ?? null) : null);

	/** The header suppresses its own title input when the template declares one. */
	const templateHasTitleField = $derived(
		template ? template.fields.some((f) => f.key === 'title') : false
	);

	const idBadge = $derived(active ? String(active.issue.id).padStart(4, '0') : '');

	const sections = $derived(active ? active.issue.sections : []);

	/**
	 * Reset the active section when the editor opens or the section
	 * list changes (e.g. after a template-driven save).
	 */
	$effect(() => {
		if (active) {
			const first = sections[0]?.name ?? null;
			if (activeSectionName === null || !sections.some((s) => s.name === activeSectionName)) {
				activeSectionName = first;
			}
		} else {
			activeSectionName = null;
		}
	});

	const activeSection = $derived(
		sections.find((s) => s.name === activeSectionName) ?? sections[0] ?? null
	);

	const sectionNav = $derived(sections.map((s) => ({ id: s.name, label: s.name })));

	const isReadOnly = $derived(mode.mode === 'remote');

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
		activeSectionName = id;
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
		class="fixed inset-y-0 right-0 z-40 flex w-[40rem] max-w-full flex-col border-l border-base-300 bg-base-100 shadow-xl"
		data-testid="editor-panel"
	>
		<div
			class="flex items-center gap-3 border-b border-base-300 px-4 py-3"
			data-testid="editor-panel-header"
		>
			<span class="font-mono text-xs opacity-60">{idBadge}</span>
			{#if !templateHasTitleField}
				<Input
					value={active.issue.title}
					oninput={(e) => editor.patchField('title', (e.currentTarget as HTMLInputElement).value)}
					class="flex-1"
				/>
			{:else}
				<div class="flex-1 text-sm font-semibold">{active.issue.title}</div>
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

		<div class="px-2 pt-2">
			<Tabs tabs={tabList} value={activeTab} onchange={setTab} />
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-3">
			{#if activeTab === 'form'}
				<FormFields />
			{:else}
				{#if sectionNav.length > 0}
					<div
						class="mb-3 flex flex-wrap gap-1 border-b border-base-300 pb-2"
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
								class="rounded px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {isOn
									? 'bg-primary text-primary-content'
									: 'bg-base-200 hover:bg-base-300'}"
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
			class="flex items-center gap-2 border-t border-base-300 px-4 py-3"
			data-testid="editor-panel-footer"
		>
			{#if isReadOnly}
				<Tooltip text={t('editor.readOnlySaveTooltip')} position="top">
					<Button variant="primary" size="sm" disabled>{t('common.save')}</Button>
				</Tooltip>
				<Tooltip text={t('editor.readOnlyDiscardTooltip')} position="top">
					<Button variant="ghost" size="sm" disabled>{t('common.discard')}</Button>
				</Tooltip>
			{:else}
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
			{/if}

			{#if editor.errors.length > 0}
				<span class="ml-auto text-xs text-error" data-testid="editor-panel-error-count">
					{t('common.validationErrors', { n: editor.errors.length })}
				</span>
			{:else if editor.isDirty}
				<span class="ml-auto text-xs opacity-60">{t('editor.unsaved')}</span>
			{/if}

			<Button variant="ghost" size="sm" onclick={close} data-testid="editor-panel-footer-close">
				{t('editor.footerClose')}
			</Button>
		</footer>
	</aside>
{/if}
