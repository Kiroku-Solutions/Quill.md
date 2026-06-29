<!--
	Wizard — first-run template setup (FR-11 / UC-5).

	Triggered when the home page's "Open local folder" flow detects a
	missing `.nomad.md/config.json` — see `+page.svelte`. The route is
	also reachable directly via `/wizard` for users who want to
	re-run the wizard over an existing project (the route is tolerant
	of an already-set-up repo and offers to leave existing files in
	place; see `wizard.ts:writeWizardSetup`).

	Paths:
	  - "Use built-in templates" → checklist of the four built-in
	    templates (Epic / User Story / Task / Bug). At least one
	    must be selected to enable the Apply button.
	  - "Create your own" → the future in-app template editor. The
	    button is disabled with a tooltip "Coming soon"; FR-11 only
	    requires the built-in path to be functional.

	On Apply:
	  1. `writeWizardSetup(adapter, selectedIds, { overwriteConfig: true })`
	  2. Re-load config + templates through the stores
	  3. `goto('/local')` — the user is now on the main surface.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { BUILT_IN_TEMPLATES } from '$lib/services/built-in-templates';
	import { writeWizardSetup } from '$lib/services/wizard';

	const stores = getStores();

	type Path = 'builtin' | 'custom';
	let path = $state<Path>('builtin');
	let selected = $state<ReadonlySet<string>>(new Set());
	let isApplying = $state(false);
	let applyError = $state<string | null>(null);

	const canApply = $derived(path === 'builtin' && selected.size > 0 && !isApplying);

	function toggle(id: string): void {
		// `selected` is reassigned wholesale on every change (immutable-set
		// pattern), so the Svelte 5 reactivity fires on the assignment, not
		// on the inner add/delete. The local `new Set(selected)` is just a
		// shallow copy used to derive the next snapshot; it never escapes
		// this function, so a plain `Set` is correct here.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	onMount(() => {
		// If the wizard is opened without a bound local adapter, send
		// the user back home — the wizard cannot write anywhere.
		if (stores.mode.localAdapter === null) {
			void goto(resolve('/'));
		}
	});

	async function apply(): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			applyError = 'No local folder is open. Use "Open local folder" on the home page.';
			return;
		}
		isApplying = true;
		applyError = null;
		try {
			await writeWizardSetup(adapter, [...selected], { overwriteConfig: true });
			// Re-load the affected stores so the UI reflects the new files.
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/local'));
		} catch (cause) {
			applyError = (cause as Error).message;
		} finally {
			isApplying = false;
		}
	}

	function cancel(): void {
		void goto(resolve('/'));
	}
</script>

<div class="min-h-screen flex flex-col bg-base-100 text-base-content">
	<header class="navbar bg-base-200 shadow-sm px-6">
		<a href={resolve('/')} class="text-lg font-bold tracking-tight">nomad.md</a>
		<span class="badge badge-info badge-sm ml-3">First-run setup</span>
		<div class="flex-1"></div>
		<button type="button" class="btn btn-ghost btn-sm" onclick={cancel}>Cancel</button>
	</header>

	<main class="flex-1 px-6 py-10">
		<div class="max-w-3xl mx-auto space-y-8">
			<section>
				<h1 class="text-2xl font-semibold">Set up your issue tracker</h1>
				<p class="opacity-80 mt-2">
					Your folder does not have a <code>.nomad.md/</code> configuration yet. Pick a path below to
					get started. You can edit or add templates later from the Settings panel.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-lg font-semibold">1. Choose how to set up templates</h2>
				<label
					class="card bg-base-200 cursor-pointer"
					class:ring-2={path === 'builtin'}
					class:ring-primary={path === 'builtin'}
				>
					<div class="card-body">
						<div class="flex items-start gap-3">
							<input
								type="radio"
								class="radio radio-primary mt-1"
								checked={path === 'builtin'}
								onchange={() => (path = 'builtin')}
							/>
							<div>
								<div class="font-medium">Use built-in templates</div>
								<div class="text-sm opacity-70">
									Pick from the four bundled issue types: Epic, User Story, Task, Bug. Recommended
									for most projects.
								</div>
							</div>
						</div>
					</div>
				</label>

				<label
					class="card bg-base-200 cursor-not-allowed opacity-60"
					title="Coming soon — the in-app template editor is a future step"
				>
					<div class="card-body">
						<div class="flex items-start gap-3">
							<input
								type="radio"
								class="radio radio-primary mt-1"
								checked={path === 'custom'}
								onchange={() => (path = 'custom')}
								disabled
							/>
							<div>
								<div class="font-medium">Create your own</div>
								<div class="text-sm opacity-70">
									Author one or more templates from scratch (coming soon). You can also add
									templates later from Settings.
								</div>
							</div>
						</div>
					</div>
				</label>
			</section>

			{#if path === 'builtin'}
				<section class="space-y-3">
					<h2 class="text-lg font-semibold">2. Pick the templates you need</h2>
					<p class="text-sm opacity-70">
						Select at least one. Selected templates are written to
						<code>.nomad.md/templates/</code> verbatim.
					</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{#each BUILT_IN_TEMPLATES as t (t.id)}
							<label
								class="card bg-base-200 cursor-pointer"
								class:ring-2={selected.has(t.id)}
								class:ring-primary={selected.has(t.id)}
							>
								<div class="card-body p-4">
									<div class="flex items-start gap-3">
										<input
											type="checkbox"
											class="checkbox checkbox-primary mt-1"
											checked={selected.has(t.id)}
											onchange={() => toggle(t.id)}
										/>
										<div>
											<div class="font-medium flex items-center gap-2">
												<span
													class="inline-block w-3 h-3 rounded-full"
													style="background-color: {t.color}"
												></span>
												{t.name}
											</div>
											<div class="text-xs opacity-70 mt-1">
												{t.fields.length} fields · {t.sections.length} sections
											</div>
										</div>
									</div>
								</div>
							</label>
						{/each}
					</div>
				</section>
			{/if}

			{#if applyError}
				<div role="alert" class="alert alert-error">
					<span>Failed to write the wizard setup: {applyError}</span>
				</div>
			{/if}

			<div class="flex items-center gap-3">
				<button
					type="button"
					class="btn btn-primary"
					disabled={!canApply}
					title={canApply
						? 'Write the selected templates to .nomad.md/'
						: 'Select at least one template to continue'}
					onclick={apply}
				>
					{isApplying ? 'Applying…' : 'Apply and continue'}
				</button>
				<button type="button" class="btn btn-ghost" onclick={cancel}>Cancel</button>
				<span class="ml-auto text-xs opacity-60">
					Selected: {selected.size} · Required: ≥1
				</span>
			</div>
		</div>
	</main>
</div>
