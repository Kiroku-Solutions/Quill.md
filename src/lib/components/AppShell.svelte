<!--
	AppShell.svelte — the three-region layout (sub-phase 6C, ERS §4.1.1).

	Structure:
	  [ TopBar ]
	  [ LeftRail? | main canvas ]

	The LeftRail is rendered for `local` and `remote` modes only. The
	home screen is a single column (`mode === 'home'`); the wizard is
	also a single column (`mode === 'wizard'`) because it is a
	step-driven setup flow that benefits from the full width.

	The main canvas wraps `{@render children()}`. The IntegrityWarningBanner
	is mounted at the top of the canvas when there are integrity warnings
	(see `IntegrityWarningBanner.svelte`). The `EditorPanel` lives at
	the page level (each route mounts it directly), so it overlays the
	canvas as before.

	Props:
	  mode: 'home' | 'local' | 'remote' | 'wizard'

	The store's `mode.mode` only exposes three of these values; the
	wizard detection is done in the caller (the layout passes `mode`
	based on the URL pathname). See `+layout.svelte`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import LeftRail from './LeftRail.svelte';
	import TopBar, { type ShellMode } from './TopBar.svelte';
	import IntegrityWarningBanner from './IntegrityWarningBanner.svelte';
	import { getStores } from '$lib/state';

	type Props = {
		mode: ShellMode;
		children?: Snippet;
	};

	let { mode, children }: Props = $props();

	const stores = getStores();
	const showLeftRail = $derived(mode === 'local' || mode === 'remote');
	const hasIntegrityWarnings = $derived(stores.issues.integrityWarnings.length > 0);
</script>

<div class="flex min-h-screen flex-col bg-base-100 text-base-content">
	<TopBar {mode} />

	{#if showLeftRail}
		<div class="flex flex-1">
			<LeftRail />
			<main id="main-canvas" data-testid="main-canvas" class="relative flex-1 overflow-y-auto">
				{#if hasIntegrityWarnings}
					<IntegrityWarningBanner />
				{/if}
				{#if children}{@render children()}{/if}
			</main>
		</div>
	{:else}
		<main id="main-canvas" data-testid="main-canvas" class="relative flex-1 overflow-y-auto">
			{#if hasIntegrityWarnings && (mode === 'local' || mode === 'remote')}
				<IntegrityWarningBanner />
			{/if}
			{#if children}{@render children()}{/if}
		</main>
	{/if}
</div>
