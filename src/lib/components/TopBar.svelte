<!--
	TopBar.svelte — sticky top chrome for quill.md (sub-phase 6C,
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
	import { goto } from '$app/navigation';
	import Settings from '@lucide/svelte/icons/settings';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { Badge, IconButton, Tooltip, Button } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import ProxyWarningBanner from './ProxyWarningBanner.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { getStores } from '$lib/state';
	import Bird from '$lib/assets/Bird.svg';

	export type ShellMode = 'home' | 'local' | 'remote' | 'wizard' | 'editor';

	type Props = {
		mode: ShellMode;
		onCancel?: () => void;
	};

	let { mode, onCancel }: Props = $props();

	const stores = getStores();

	const folderName = $derived(mode === 'local' ? (stores.mode.activeHandle?.name ?? null) : null);

	function parseRepoName(url: string | null): string | null {
		if (!url) return null;
		try {
			const pathname = new URL(url).pathname;
			const parts = pathname.split('/').filter(Boolean);
			const last = parts.length > 0 ? parts[parts.length - 1] : null;
			return last ? last.replace(/\.git$/, '') : url;
		} catch {
			const match = url.match(/([^/:]+)(?:\.git)?$/);
			return match ? match[1] : url;
		}
	}

	const repoLabel = $derived(
		mode === 'remote'
			? (parseRepoName(stores.mode.remoteUrl) ?? t('topbar.remoteRepository'))
			: null
	);

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
			case 'editor':
				return { label: t('settings.newTemplate'), variant: 'primary' as const };
			default:
				return { label: t('modeBadge.home'), variant: 'ghost' as const };
		}
	});

	const indicatorText = $derived(folderName ?? repoLabel ?? null);
	const productGoal = $derived(stores.config.config?.product_goal ?? null);

	function toggleSettings(): void {
		stores.ui.toggleSettings();
	}

	function handleCancel(): void {
		if (onCancel) {
			onCancel();
		} else {
			void goto(resolve('/'));
		}
	}
</script>

<header
	data-testid="topbar"
	aria-label={t('topbar.ariaLabel')}
	class="sticky top-0 z-30 flex h-[var(--topbar-height)] w-full items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md transition-colors duration-[var(--motion-slow)] md:px-6"
>
	{#if mode === 'local' || mode === 'remote'}
		<div class="mr-1 -ml-2 flex-shrink-0 md:hidden">
			<IconButton label={t('topbar.toggleMobileNav')} onclick={() => stores.ui.toggleMobileNav()}>
				<MenuIcon class="h-6 w-6" aria-hidden="true" />
			</IconButton>
		</div>
	{/if}

	<a
		href={resolve('/')}
		class="flex items-center gap-3 rounded font-display font-bold tracking-tight hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
		aria-label={t('app.homeAria')}
	>
		<img src={Bird} alt={t('app.logoAlt')} class="h-7 w-7" />
		<div class="flex items-baseline gap-2">
			<span class="text-xl text-foreground">{t('app.name')}</span>
			<span class="font-sans text-xs font-medium text-muted-foreground">{t('app.version')}</span>
		</div>
	</a>

	<Badge variant={badge.variant} size="sm">{badge.label}</Badge>

	{#if indicatorText && indicatorText !== 'null'}
		<div class="mx-4 hidden min-w-0 flex-1 items-center justify-center md:flex">
			<span
				class="truncate text-base font-semibold text-foreground"
				title={indicatorText}
				data-testid="topbar-project-name"
			>
				{indicatorText}
			</span>
		</div>
	{:else}
		<div class="flex-1"></div>
	{/if}

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

	{#if mode === 'wizard'}
		<Button variant="ghost" size="sm" onclick={handleCancel} data-testid="topbar-wizard-cancel">
			{t('common.cancel')}
		</Button>
	{/if}
</header>

{#if stores.mode.proxyWarning}
	<ProxyWarningBanner />
{/if}

<!-- 6H Settings Panel -->
<SettingsPanel />
