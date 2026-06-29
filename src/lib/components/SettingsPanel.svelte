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
	import Trash from '@lucide/svelte/icons/trash-2';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import { TRASH_DIRECTORY } from '$lib/adapters';
	import type { Theme } from '$lib/state/theme.svelte';
	import EmptyTrashModal from './EmptyTrashModal.svelte';
	import RecentFoldersList from './RecentFoldersList.svelte';

	type Props = { open: boolean; onclose: () => void };
	let { open, onclose }: Props = $props();
	const stores = getStores();

	const themeOptions: ReadonlyArray<{ id: Theme; label: string; icon: typeof Sun }> = [
		{ id: 'light', label: t('settings.themeLight'), icon: Sun },
		{ id: 'dark', label: t('settings.themeDark'), icon: Moon },
		{ id: 'system', label: t('settings.themeSystem'), icon: Monitor }
	];

	const corsProxy = $derived(stores.config.config?.remote.cors_proxy ?? '');
	const localAdapter = $derived(stores.mode.localAdapter);
	const canClearCache = $derived(stores.mode.mode === 'remote');

	let trashCount = $state(0);
	let emptyTrashOpen = $state(false);

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
				onclose();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function onEmptied(): void {
		trashCount = 0;
		void readTrashCount();
	}
</script>

{#if open}
	<button
		type="button"
		class="fixed inset-0 z-40 cursor-default bg-black/40"
		aria-label={t('settings.backdropAria')}
		onclick={onclose}
		data-testid="settings-backdrop"
	></button>

	<div
		class="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l border-base-300 bg-base-100 shadow-2xl"
		data-testid="settings-panel"
		role="dialog"
		aria-modal="true"
		aria-label={t('settings.title')}
	>
		<div
			class="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
			data-testid="settings-header"
		>
			<h2 class="text-lg font-semibold">{t('settings.title')}</h2>
			<IconButton label={t('settings.closeAria')} onclick={onclose} data-testid="settings-close">
				<X class="h-4 w-4" aria-hidden="true" />
			</IconButton>
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-4">
			<section class="flex flex-col gap-2" data-testid="settings-theme">
				<h3 class="text-xs font-semibold uppercase tracking-wide opacity-70">
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

			<section class="mt-6 flex flex-col gap-2" data-testid="settings-cors">
				<h3 class="text-xs font-semibold uppercase tracking-wide opacity-70">
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
				<h3 class="text-xs font-semibold uppercase tracking-wide opacity-70">
					{t('settings.recentHeading')}
				</h3>
				<Card compact>
					<RecentFoldersList />
				</Card>
			</section>

			<section class="mt-6 flex flex-col gap-3" data-testid="settings-commands">
				<h3 class="text-xs font-semibold uppercase tracking-wide opacity-70">
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
							disabled={!canClearCache}
							data-testid="settings-clear-cache"
						>
							<RefreshCw class="h-4 w-4" aria-hidden="true" />
							<span>{t('settings.clearCache')}</span>
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
