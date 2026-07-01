<!--
	SettingsPanel.svelte — hero Settings surface (sub-phase 6H, ERS §4.1.5).

	Slide-in side drawer from the right edge. ESC and × close. Re-uses the
	6D `<RecentFoldersList />` for the forget affordance and the
	6E `<EmptyTrashModal />` for the empty-trash command. The CORS proxy
	field is `readonly`; the writer is a follow-up.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { Button, Card, IconButton, Input, Tooltip } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Globe from '@lucide/svelte/icons/globe';
	import Trash from '@lucide/svelte/icons/trash-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import { TRASH_DIRECTORY } from '$lib/adapters';
	import type { Theme } from '$lib/state/theme.svelte';
	import EmptyTrashModal from './EmptyTrashModal.svelte';
	import RecentFoldersList from './RecentFoldersList.svelte';
	import TemplateEditor from './TemplateEditor.svelte';
	import TopBar from './TopBar.svelte';
	import { saveTemplate } from '$lib/services/template-writer';
	import type { Template } from '$lib/types/index';

	const stores = getStores();
	const open = $derived(stores.ui.settingsOpen);

	const themeOptions: ReadonlyArray<{ id: Theme; label: string; icon: typeof Sun }> = [
		{ id: 'light', label: t('settings.themeLight'), icon: Sun },
		{ id: 'dark', label: t('settings.themeDark'), icon: Moon },
		{ id: 'system', label: t('settings.themeSystem'), icon: Monitor }
	];

	import { i18n, type Locale } from '$lib/ui/i18n/store.svelte';
	const langOptions: ReadonlyArray<{ id: Locale; label: string }> = [
		{ id: 'en', label: t('settings.languageEn') },
		{ id: 'es', label: t('settings.languageEs') }
	];

	const corsProxy = $derived(stores.config.config?.remote.cors_proxy ?? '');
	const localAdapter = $derived(stores.mode.localAdapter);
	const canClearCache = $derived(stores.mode.mode === 'remote');

	let trashCount = $state(0);
	let emptyTrashOpen = $state(false);
	let clearCacheBusy = $state(false);
	let clearCacheStatus = $state<{ kind: 'success' | 'error'; message: string } | null>(null);
	let editorOpen = $state(false);

	async function readTrashCount(): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			trashCount = 0;
			return;
		}
		try {
			const entries = await adapter.listDirectory(TRASH_DIRECTORY);
			trashCount = entries.filter((e) => e.kind === 'file').length;
		} catch {
			trashCount = 0;
		}
	}

	$effect(() => {
		if (!open) return;
		void stores.mode.localAdapter;
		void readTrashCount();
	});

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.preventDefault();
				stores.ui.closeSettings();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function onEmptied(): void {
		trashCount = 0;
		void readTrashCount();
	}

	async function onClearCache(): Promise<void> {
		clearCacheBusy = true;
		clearCacheStatus = null;
		try {
			await stores.mode.clearRemoteCache();
			clearCacheStatus = {
				kind: 'success',
				message: 'Cache cleared. The next refresh will re-fetch the subtree.'
			};
		} catch (e) {
			clearCacheStatus = {
				kind: 'error',
				message: e instanceof Error ? e.message : String(e)
			};
		} finally {
			clearCacheBusy = false;
		}
	}

	async function onSaveTemplate(t: Template): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) return;
		try {
			await saveTemplate(adapter, t, true);
			await stores.templates.load();
			editorOpen = false;
		} catch (e) {
			console.error('Failed to save template', e);
		}
	}
</script>

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-40 cursor-default backdrop-blur-sm bg-black/40 transition-opacity duration-[var(--motion-base)]"
		aria-label={t('settings.backdropAria')}
		onclick={() => stores.ui.closeSettings()}
		data-testid="settings-backdrop"
	></button>

	<div
		class="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l border-border bg-background shadow-[0_0_40px_rgba(0,0,0,0.1)] transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)]"
		data-testid="settings-panel"
		role="dialog"
		aria-modal="true"
		aria-label={t('settings.title')}
	>
		<div
			class="flex items-center justify-between gap-3 border-b border-border px-6 py-4"
			data-testid="settings-header"
		>
			<h2 class="text-xl font-display font-semibold text-foreground">{t('settings.title')}</h2>
			<IconButton
				label={t('settings.closeAria')}
				onclick={() => stores.ui.closeSettings()}
				data-testid="settings-close"
			>
				<X class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-4">
			<section class="flex flex-col gap-2" data-testid="settings-theme">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					{t('settings.themeHeading')}
				</h3>
				<div class="flex gap-2">
					{#each themeOptions as opt (opt.id)}
						{@const Icon = opt.icon}
						{@const active = stores.theme.preference === opt.id}
						<Button
							variant={active ? 'primary' : 'secondary'}
							size="sm"
							onclick={() => stores.theme.setTheme(opt.id)}
							class="flex-1"
							data-testid="settings-theme-{opt.id}"
							aria-pressed={active}
						>
							<Icon class="h-4 w-4" aria-hidden="true" />
							<span>{opt.label}</span>
						</Button>
					{/each}
				</div>
				{#if stores.theme.preference === 'system'}
					<p class="text-xs opacity-60">
						{t('settings.themeSystemHint', {
							now: stores.theme.theme === 'dark' ? 'dark' : 'light'
						})}
					</p>
				{/if}
			</section>

			<section class="mt-6 flex flex-col gap-2" data-testid="settings-language">
				<h3
					class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"
				>
					<Globe class="h-3 w-3 inline-block" />
					{t('settings.languageHeading')}
				</h3>
				<div class="flex gap-2">
					{#each langOptions as opt (opt.id)}
						{@const active = i18n.locale === opt.id}
						<Button
							variant={active ? 'primary' : 'secondary'}
							size="sm"
							onclick={() => (i18n.locale = opt.id)}
							class="flex-1"
							data-testid="settings-lang-{opt.id}"
							aria-pressed={active}
						>
							<span>{opt.label}</span>
						</Button>
					{/each}
				</div>
			</section>

			<section class="mt-6 flex flex-col gap-2" data-testid="settings-cors">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					{t('settings.corsHeading')}
				</h3>
				<Input
					value={corsProxy}
					readonly
					placeholder={t('settings.corsPlaceholder')}
					data-testid="settings-cors-input"
				/>
				<p class="text-xs opacity-60" data-testid="settings-cors-note">
					{t('settings.corsNote')}
				</p>
			</section>

			<section class="mt-6 flex flex-col gap-2" data-testid="settings-recent">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					{t('settings.recentHeading')}
				</h3>
				<Card compact>
					<RecentFoldersList />
				</Card>
			</section>

			<section class="mt-6 flex flex-col gap-2" data-testid="settings-templates">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between">
					<span>{t('settings.templatesHeading')}</span>
					<Button variant="secondary" size="sm" class="h-6 text-xs px-2" onclick={() => (editorOpen = true)} disabled={!localAdapter}>
						{t('settings.newTemplate')}
					</Button>
				</h3>
				<div class="flex flex-col gap-2 mt-2">
					{#each stores.templates.templates as tmpl}
						<Card compact class="flex items-center gap-3 px-3 py-2">
							<span class="w-3 h-3 rounded-full" style="background-color: {tmpl.color}"></span>
							<span class="text-sm font-medium">{tmpl.name}</span>
						</Card>
					{/each}
				</div>
			</section>

			<section class="mt-6 flex flex-col gap-3" data-testid="settings-commands">
				<h3 class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					{t('settings.commandsHeading')}
				</h3>
				<div class="flex flex-wrap gap-2">
					<Tooltip
						text={canClearCache
							? t('settings.clearCacheRemoteTooltip')
							: t('settings.clearCacheSignInTooltip')}
						position="top"
					>
						<Button
							variant="ghost"
							size="sm"
							disabled={!canClearCache || clearCacheBusy}
							onclick={onClearCache}
							data-testid="settings-clear-cache"
						>
							<RefreshCw
								class="h-4 w-4 {clearCacheBusy ? 'animate-spin' : ''}"
								aria-hidden="true"
							/>
							<span>
								{clearCacheBusy ? t('settings.clearCacheBusy') : t('settings.clearCache')}
							</span>
						</Button>
					</Tooltip>
					<Tooltip
						text={localAdapter
							? t('settings.emptyTrashLocalTooltip')
							: t('settings.emptyTrashSignInTooltip')}
						position="top"
					>
						<Button
							variant="ghost"
							size="sm"
							disabled={!localAdapter}
							onclick={() => (emptyTrashOpen = true)}
							data-testid="settings-empty-trash"
						>
							<Trash class="h-4 w-4" aria-hidden="true" />
							<span>{t('settings.emptyTrash', { n: trashCount })}</span>
						</Button>
					</Tooltip>
				</div>
				{#if clearCacheStatus}
					<div
						role={clearCacheStatus.kind === 'error' ? 'alert' : 'status'}
						class="alert {clearCacheStatus.kind === 'error'
							? 'alert-error'
							: 'alert-success'} text-sm"
						data-testid="settings-clear-cache-status"
					>
						<span>{clearCacheStatus.message}</span>
					</div>
				{/if}
			</section>
		</div>
	</div>

	<EmptyTrashModal
		bind:open={emptyTrashOpen}
		adapter={localAdapter}
		count={trashCount}
		onclose={() => (emptyTrashOpen = false)}
		onemptied={onEmptied}
	/>
{/if}

{#if editorOpen}
	<div class="fixed inset-0 z-[100] bg-background flex flex-col">
		<TopBar mode="editor" onCancel={() => (editorOpen = false)} />
		
		<!-- Editor Body -->
		<div class="flex-1 p-4 sm:p-8 overflow-y-auto">
			<TemplateEditor onsave={onSaveTemplate} oncancel={() => (editorOpen = false)} />
		</div>
	</div>
{/if}
