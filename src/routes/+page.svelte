<!--
	Home screen (sub-phase 6D — ERS §4.1.2).

	Three regions, top to bottom:
	  1. Hero — app name + tagline + two equal-weight action cards
	     (open local / browse remote).
	  2. Recent folders list — only when `mode.recentHandles` is non-empty.
	  3. "How it works" onboarding strip — only when there are no recent
	     folders (first-time user copy).

	The chrome (TopBar + theme toggle) lives in `AppShell.svelte`. The
	page itself is a centred column; the layout widens on `md:`.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Globe from '@lucide/svelte/icons/globe';
	import Lock from '@lucide/svelte/icons/lock';
	import { Alert, Button, Card, Input } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { isFsaAvailable } from '$lib/adapters/feature-detect';
	import { LocalFsAdapter } from '$lib/adapters';
	import { getStores } from '$lib/state';
	import HowItWorksStrip from '$lib/components/HowItWorksStrip.svelte';
	import RecentFoldersList from '$lib/components/RecentFoldersList.svelte';

	const stores = getStores();

	let pat = $state('');
	let repoUrl = $state('');
	let repoBranch = $state('main');
	let openError = $state<string | null>(null);
	let remoteError = $state<string | null>(null);
	let localLoading = $state(false);
	let remoteLoading = $state(false);

	const fsaSupported = $derived(isFsaAvailable());
	const recentCount = $derived(stores.mode.recentHandles.length);

	async function openLocalFolder(): Promise<void> {
		openError = null;
		if (!fsaSupported) {
			openError = t('home.fsaUnavailable');
			return;
		}
		localLoading = true;
		try {
			const adapter = await LocalFsAdapter.pick();
			await stores.mode.openLocalFolder(adapter.directoryHandle);
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/local'));
		} catch (cause) {
			openError = (cause as Error).message;
		} finally {
			localLoading = false;
		}
	}

	async function openRemoteRepo(): Promise<void> {
		remoteError = null;
		remoteLoading = true;
		try {
			const url = repoUrl.trim() as unknown as Parameters<typeof stores.mode.openRemote>[0]['url'];
			const branch = repoBranch.trim() as unknown as Parameters<
				typeof stores.mode.openRemote
			>[0]['branch'];
			await stores.mode.openRemote({ url, branch }, pat.trim());
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/remote'));
		} catch (cause) {
			remoteError = (cause as Error).message;
		} finally {
			remoteLoading = false;
		}
	}
</script>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
	<section aria-labelledby="home-hero-title" class="flex flex-col gap-2 text-center">
		<h1 id="home-hero-title" class="text-3xl font-bold tracking-tight">{t('home.heroTitle')}</h1>
		<p class="text-sm opacity-70">{t('home.heroSubtitle')}</p>
	</section>

	<section aria-label={t('home.chooseModeAria')} class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<Card>
			<div class="flex h-full flex-col gap-3">
				<FolderOpen class="h-7 w-7 text-primary" aria-hidden="true" />
				<h2 class="text-lg font-semibold">{t('home.openLocalTitle')}</h2>
				<p class="text-sm opacity-80">{t('home.openLocalBody')}</p>
				{#if !fsaSupported}
					<Alert variant="warning">{t('home.fsaUnavailable')}</Alert>
				{/if}
				{#if openError}
					<Alert variant="error">{openError}</Alert>
				{/if}
				<div class="mt-auto flex justify-end pt-2">
					<Button
						variant="primary"
						onclick={openLocalFolder}
						disabled={!fsaSupported}
						loading={localLoading}
					>
						{t('home.openLocalButton')}
					</Button>
				</div>
			</div>
		</Card>

		<Card>
			<form
				class="flex h-full flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					openRemoteRepo();
				}}
			>
				<Globe class="h-7 w-7 text-primary" aria-hidden="true" />
				<h2 class="text-lg font-semibold">{t('home.openRemoteTitle')}</h2>
				<p class="text-sm opacity-80">{t('home.openRemoteBody')}</p>
				<div class="flex flex-col gap-2">
					<Input
						bind:value={repoUrl}
						type="url"
						placeholder={t('home.remoteUrlPlaceholder')}
						required
					/>
					<Input
						bind:value={repoBranch}
						type="text"
						placeholder={t('home.remoteBranchPlaceholder')}
						required
					/>
					<Input
						bind:value={pat}
						type="password"
						placeholder={t('home.remotePatLabel')}
						autocomplete="off"
					/>
					<p class="flex items-start gap-1 text-xs opacity-60">
						<Lock class="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
						<span>{t('home.remotePatHelp')}</span>
					</p>
				</div>
				{#if remoteError}
					<Alert variant="error">{remoteError}</Alert>
				{/if}
				<div class="mt-auto flex justify-end pt-2">
					<Button
						type="submit"
						variant="secondary"
						disabled={!repoUrl.trim() || !repoBranch.trim()}
						loading={remoteLoading}
					>
						{t('home.openRemoteButton')}
					</Button>
				</div>
			</form>
		</Card>
	</section>

	{#if recentCount > 0}
		<RecentFoldersList />
	{:else}
		<HowItWorksStrip />
	{/if}
</div>
