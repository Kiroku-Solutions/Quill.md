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
	import { LocalFsAdapter, type HandleRecord } from '$lib/adapters';
	import { detectProvider } from '$lib/adapters/providers/detect';
	import { getStores } from '$lib/state';
	import HowItWorksStrip from '$lib/components/HowItWorksStrip.svelte';
	import RecentFoldersList from '$lib/components/RecentFoldersList.svelte';
	import Bird from '$lib/assets/Bird.svg';

	const stores = getStores();

	let pat = $state('');
	let repoUrl = $state('');
	let repoBranch = $state('quill-md');
	let openError = $state<string | null>(null);
	let remoteError = $state<string | null>(null);
	let localLoading = $state(false);
	let remoteLoading = $state(false);
	let isPublicRepo = $state<boolean | null>(null);
	let wantsToEdit = $state(false);
	let isCheckingAccess = $state(false);

	const fsaSupported = $derived(isFsaAvailable());
	const recentCount = $derived(stores.mode.recentHandles.length);
	const lastFolder = $derived(stores.mode.lastActiveFolder);

	$effect(() => {
		const url = repoUrl.trim();
		if (!url) {
			isPublicRepo = null;
			isCheckingAccess = false;
			return;
		}

		isCheckingAccess = true;
		const check = async () => {
			try {
				const parsedUrl = new URL(url);
				const provider = detectProvider(parsedUrl);
				if (provider?.isPublic) {
					const parsed = provider.parseUrl(parsedUrl);
					isPublicRepo = await provider.isPublic(parsed);
				} else {
					isPublicRepo = false;
				}
			} catch {
				isPublicRepo = false;
			} finally {
				isCheckingAccess = false;
			}
		};
		const timer = setTimeout(check, 500);
		return () => {
			clearTimeout(timer);
			isCheckingAccess = false;
		};
	});

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

			if (stores.config.config === null) {
				await goto(resolve('/wizard'));
			} else {
				await goto(resolve('/local'));
			}
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
			await stores.mode.openRemote(
				{ url, branch, editBranch: branch, readOnly: !wantsToEdit },
				pat.trim()
			);
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			if (stores.mode.isReadOnly && stores.config.config === null) {
				await stores.mode.signOut();
				throw new Error(
					'Quill.md is not initialized on this repository. A PAT is required to initialize it.'
				);
			}
			await goto(resolve('/remote'));
		} catch (cause) {
			remoteError = (cause as Error).message;
		} finally {
			remoteLoading = false;
		}
	}

	async function restoreFolder(record: HandleRecord): Promise<void> {
		openError = null;
		localLoading = true;
		try {
			await stores.mode.openLocalFolder(record.handle);
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			if (stores.config.config === null) {
				await goto(resolve('/wizard'));
			} else {
				await goto(resolve('/local'));
			}
		} catch (cause) {
			openError = (cause as Error).message;
		} finally {
			localLoading = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
			e.preventDefault();
			if (fsaSupported) openLocalFolder();
		}
	}}
/>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-20">
	{#if lastFolder}
		{@const record = stores.mode.recentHandles.find((r) => r.name === lastFolder)}
		{#if record}
			<section class="mx-auto w-full max-w-2xl">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={(e) => {
						e.stopPropagation();
						restoreFolder(record);
					}}
					class="cursor-pointer"
				>
					<Card
						class="border-warning/50 bg-warning/10 transition-all hover:border-warning/80 hover:shadow-md"
					>
						<div class="flex items-center gap-4 p-4">
							<div class="rounded-full bg-warning/20 p-3 text-warning">
								<FolderOpen class="h-6 w-6" />
							</div>
							<div class="flex flex-col">
								<h3 class="font-semibold text-foreground">
									{t('home.restoreSessionTitle', { folder: lastFolder })}
								</h3>
								<p class="text-sm text-muted-foreground">{t('home.restoreSessionBody')}</p>
							</div>
						</div>
					</Card>
				</div>
			</section>
		{/if}
	{/if}

	<section
		aria-labelledby="home-hero-title"
		class="mb-6 flex flex-col items-center justify-center gap-4 text-center"
	>
		<img src={Bird} alt={t('app.logoAlt')} class="mb-2 h-16 w-16" />
		<h1 id="home-hero-title" class="font-display text-5xl font-bold tracking-tight text-foreground">
			{t('home.heroTitle')}
		</h1>
		<p class="max-w-2xl text-lg text-muted-foreground">{t('home.heroSubtitle')}</p>
	</section>

	<section aria-label={t('home.chooseModeAria')} class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onclick={openLocalFolder} class="group cursor-pointer">
			<Card
				class="h-full transition-all duration-[var(--motion-base)] ease-in-out hover:border-primary/50 hover:shadow-soft"
			>
				<div class="flex h-full flex-col gap-3">
					<div
						class="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary transition-transform duration-[var(--motion-fast)] ease-out group-hover:scale-110"
					>
						<FolderOpen class="h-6 w-6" aria-hidden="true" />
					</div>
					<h2 class="font-display text-xl font-semibold text-foreground">
						{t('home.openLocalTitle')}
					</h2>
					<p class="text-sm text-muted-foreground">{t('home.openLocalBody')}</p>
					{#if !fsaSupported}
						<Alert variant="warning">{t('home.fsaUnavailable')}</Alert>
					{/if}
					{#if openError}
						<Alert variant="error">{openError}</Alert>
					{/if}
					<div class="mt-auto flex justify-end pt-2">
						<Button
							variant="primary"
							onclick={(e: MouseEvent) => {
								e.stopPropagation();
								openLocalFolder();
							}}
							disabled={!fsaSupported}
							loading={localLoading}
						>
							{t('home.openLocalButton')}
						</Button>
					</div>
				</div>
			</Card>
		</div>

		<Card
			class="transition-all duration-[var(--motion-base)] ease-in-out focus-within:border-primary/50 focus-within:shadow-soft hover:border-primary/50 hover:shadow-soft"
		>
			<form
				class="group flex h-full flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					openRemoteRepo();
				}}
			>
				<div
					class="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary transition-transform duration-[var(--motion-fast)] ease-out group-focus-within:scale-110"
				>
					<Globe class="h-6 w-6" aria-hidden="true" />
				</div>
				<h2 class="font-display text-xl font-semibold text-foreground">
					{t('home.openRemoteTitle')}
				</h2>
				<p class="text-sm text-muted-foreground">{t('home.openRemoteBody')}</p>
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

					{#if isCheckingAccess}
						<div class="mt-1 flex animate-pulse items-center gap-2 text-xs text-muted-foreground">
							<span
								class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
							></span>
							{t('common.loading')}
						</div>
					{:else if repoUrl.trim()}
						{#if isPublicRepo === true}
							<label class="mt-2 flex flex-col gap-1.5">
								<span class="text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
									>{t('home.accessModeLabel')}</span
								>
								<div class="relative w-full">
									<select
										bind:value={wantsToEdit}
										class="w-full appearance-none rounded-md border border-border bg-background py-2 pr-10 pl-3 text-sm text-foreground transition-shadow focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none"
									>
										<option value={false}>{t('home.modeReadOnly')}</option>
										<option value={true}>{t('home.modeEdit')}</option>
									</select>
									<div
										class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											></path></svg
										>
									</div>
								</div>
							</label>
						{:else if isPublicRepo === false}
							<div class="mt-1 flex items-center gap-1 text-xs font-medium text-error">
								<Lock class="h-3 w-3" />
								<span>{t('home.modeEdit')}</span>
							</div>
						{/if}
					{/if}

					<div class="mt-2">
						<Input
							bind:value={pat}
							type="password"
							placeholder={t('home.remotePatLabel')}
							autocomplete="off"
							required={isPublicRepo === false || wantsToEdit}
						/>
					</div>

					<div class="flex flex-col gap-1.5 text-xs">
						<p class="flex items-start gap-1 opacity-60">
							<Lock class="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
							<span>
								{#if isPublicRepo === true && !wantsToEdit}
									{t('home.remotePatOptional')}
								{:else}
									{t('home.remotePatHelp')}
								{/if}
							</span>
						</p>
						{#if isPublicRepo === true && !wantsToEdit && !pat.trim()}
							<p class="font-medium text-warning opacity-90">
								{t('home.remotePatWarning')}
							</p>
						{/if}
					</div>
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
