<!--
	TopBar.svelte — sticky top chrome for nomad.md (sub-phase 6C,
	ERS §4.1.1 item 1).

	Behaviour:
	  - Sticky at the top, full width, `--topbar-height` high. Subtle
	    bottom border (`border-base-300`) on a `bg-base-200` surface.
	  - Shows app name + version, a mode badge, the current folder name
	    (local) or "Remote repository" (remote), the ThemeToggle, and
	    the settings-panel trigger.
	  - When `mode.proxyWarning` is non-null, mounts the
	    `ProxyWarningBanner` directly below the bar so the CORS-proxy
	    warning is impossible to miss.
	  - Sub-phase 6H wires the settings-icon button to open the
	    `<SettingsPanel />` (slide-in from the right). The "Sign out"
	    action moves into the panel (it's a destructive command that
	    belongs alongside the other settings actions).

	Mode prop:
	  The store exposes only `'home' | 'local' | 'remote'`; the wizard
	  has its own standalone layout and never reaches this component
	  through `AppShell`. The prop type is widened to include `'wizard'`
	  so the `AppShell` API is forward-compatible with sub-phase 6H, but
	  when `mode === 'wizard'` the TopBar simply renders without the
	  left rail (the wizard is a single-column flow).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Settings from '@lucide/svelte/icons/settings';
	import { Badge, IconButton, Tooltip } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import ProxyWarningBanner from './ProxyWarningBanner.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { getStores } from '$lib/state';

	export type ShellMode = 'home' | 'local' | 'remote' | 'wizard';

	type Props = {
		mode: ShellMode;
	};

	let { mode }: Props = $props();

	const stores = getStores();

	const folderName = $derived(mode === 'local' ? (stores.mode.activeHandle?.name ?? null) : null);
	const repoLabel = $derived(mode === 'remote' ? t('topbar.remoteRepository') : null);

	const badge = $derived.by(() => {
		switch (mode) {
			case 'local':
				return { label: t('modeBadge.local'), variant: 'success' as const };
			case 'remote':
				return { label: t('modeBadge.remote'), variant: 'warning' as const };
			case 'wizard':
				// The 6B Badge primitive does not ship an `info` variant;
				// the closest semantic match is `primary` (active flow).
				return { label: t('modeBadge.setup'), variant: 'primary' as const };
			default:
				return { label: t('modeBadge.home'), variant: 'ghost' as const };
		}
	});

	const indicatorText = $derived(folderName ?? repoLabel ?? null);

	let settingsOpen = $state(false);

	function toggleSettings(): void {
		settingsOpen = !settingsOpen;
	}

	function closeSettings(): void {
		settingsOpen = false;
	}
</script>

<header
	data-testid="topbar"
	aria-label={t('topbar.ariaLabel')}
	class="sticky top-0 z-30 flex h-[var(--topbar-height)] w-full items-center gap-3 border-b border-base-300 bg-base-200 px-4"
>
	<a
		href={resolve('/')}
		class="flex items-baseline gap-2 font-bold tracking-tight hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
		aria-label={t('app.homeAria')}
	>
		<span class="text-lg">{t('app.name')}</span>
		<span class="text-xs opacity-60">{t('app.version')}</span>
	</a>

	<Badge variant={badge.variant} size="sm">{badge.label}</Badge>

	{#if indicatorText}
		<span
			class="ml-2 max-w-xs truncate text-sm opacity-80"
			title={indicatorText}
			data-testid="topbar-indicator"
		>
			{indicatorText}
		</span>
	{/if}

	<div class="flex-1"></div>

	<ThemeToggle />

	<Tooltip text={t('topbar.settingsTooltip')} position="bottom">
		<IconButton
			label={t('topbar.openSettings')}
			onclick={toggleSettings}
			data-testid="topbar-settings"
		>
			<Settings class="h-5 w-5" aria-hidden="true" />
		</IconButton>
	</Tooltip>
</header>

{#if stores.mode.proxyWarning}
	<ProxyWarningBanner />
{/if}

<SettingsPanel open={settingsOpen} onclose={closeSettings} />
