<script lang="ts">
	import { getStores } from '$lib/state';
	import { isFsaAvailable } from '$lib/adapters/feature-detect';
	import { LocalFsAdapter } from '$lib/adapters';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	const stores = getStores();

	let pat = $state('');
	let repoUrl = $state('');
	let repoBranch = $state('main');
	let openError = $state<string | null>(null);
	let remoteError = $state<string | null>(null);

	const canOpenLocal = $derived(stores.mode.mode === 'home' || stores.mode.mode === 'local');

	async function openLocalFolder(): Promise<void> {
		openError = null;
		if (!isFsaAvailable()) {
			openError =
				'Your browser does not support the File System Access API. ' +
				'Use Chrome, Edge, Brave, Arc, Opera, or Vivaldi for Local Edit Mode.';
			return;
		}
		try {
			const adapter = await LocalFsAdapter.pick();
			await stores.mode.openLocalFolder(adapter.directoryHandle);
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/local'));
		} catch (cause) {
			openError = (cause as Error).message;
		}
	}

	async function openRemoteRepo(): Promise<void> {
		remoteError = null;
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
		}
	}
</script>

<div class="min-h-screen flex flex-col bg-base-100 text-base-content">
	<header class="navbar bg-base-200 shadow-sm px-6">
		<div class="flex-1">
			<h1 class="text-2xl font-bold tracking-tight">nomad.md</h1>
			<span class="ml-3 text-sm opacity-60">issues that travel with your repo</span>
		</div>
		<div class="flex-none">
			<ThemeToggle />
		</div>
	</header>

	<main class="flex-1 flex items-center justify-center px-6 py-12">
		<div class="w-full max-w-3xl space-y-10">
			<section>
				<h2 class="text-lg font-semibold mb-4">Open a folder</h2>
				<div class="card bg-base-200">
					<div class="card-body">
						<p class="opacity-80">
							Pick a folder on your machine to edit issues stored under
							<code>.nomad.md/</code>. Requires a Chromium-based browser.
						</p>
						<div class="card-actions justify-end mt-4">
							<button
								type="button"
								class="btn btn-primary"
								onclick={openLocalFolder}
								disabled={!canOpenLocal}
							>
								Open local folder
							</button>
						</div>
						{#if openError}
							<div role="alert" class="alert alert-error mt-4">
								<span>{openError}</span>
							</div>
						{/if}
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold mb-4">Browse a remote repository (read-only)</h2>
				<div class="card bg-base-200">
					<div class="card-body">
						<form
							class="space-y-3"
							onsubmit={(e) => {
								e.preventDefault();
								openRemoteRepo();
							}}
						>
							<label class="form-control w-full">
								<div class="label"><span class="label-text">Repository URL</span></div>
								<input
									type="url"
									class="input input-bordered w-full"
									placeholder="https://github.com/owner/repo"
									bind:value={repoUrl}
									required
								/>
							</label>
							<label class="form-control w-full">
								<div class="label"><span class="label-text">Branch</span></div>
								<input
									type="text"
									class="input input-bordered w-full"
									placeholder="main"
									bind:value={repoBranch}
									required
								/>
							</label>
							<label class="form-control w-full">
								<div class="label">
									<span class="label-text">Personal Access Token (optional for public repos)</span>
								</div>
								<input
									type="password"
									class="input input-bordered w-full"
									placeholder="ghp_…"
									autocomplete="off"
									bind:value={pat}
								/>
								<div class="label">
									<span class="label-text-alt opacity-60">
										Stored in memory only for the duration of the session — never on disk, never in
										URLs.
									</span>
								</div>
							</label>
							{#if remoteError}
								<div role="alert" class="alert alert-error">
									<span>{remoteError}</span>
								</div>
							{/if}
							<div class="card-actions justify-end">
								<button type="submit" class="btn btn-secondary">Open remote</button>
							</div>
						</form>
					</div>
				</div>
			</section>
		</div>
	</main>
</div>
