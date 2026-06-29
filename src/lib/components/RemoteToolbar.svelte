<!--
	RemoteToolbar.svelte — toolbar above the active view on the remote
	read-only page (sub-phase 6F, ERS FR-5, FR-12, NFR-2, NFR-7).

	Layout: a `flex` row sticky to the top of the canvas (just below
	the TopBar / LeftRail). Symmetric with the local twin — same chrome
	dimensions, same sticky positioning, same bottom border. The
	read-only affordances are deliberate: a disabled Refresh with a
	tooltip would say "Read-only — sign out to edit locally", but on
	the actual remote view the Refresh MUST be live, so we render it
	as a primary button that calls `modeStore.refreshRemote(pat)`.

	Surfaces:
	  - "Refresh" → calls `modeStore.refreshRemote(pat)`. The PAT is
	    supplied through a tiny inline modal (`RefreshPatPrompt`) —
	    NFR-2 forbids persisting it. The Button's `loading` flag flips
	    to `true` while the promise is pending; on failure, a 6B Alert
	    is mounted beneath the toolbar.
	  - "Last fetched: N min ago" indicator — reads `modeStore.lastFetchedAt`
	    via the shared `formatRelative` helper (`$lib/ui/format`). Hidden
	    until the first successful fetch returns a non-null timestamp.
	  - View label — small text reflecting `viewStore.view`.
	  - "X issues (read-only)" status — mirrors the old 6C label; the
	    "(read-only)" qualifier is intentional and stays.
	  - "Sign out" button — calls `modeStore.signOut()` + `goto('/')`.
	    The TopBar settings menu already has a "Sign out" item; this is
	    the second affordance called out by the brief.

	Read-only guard (inherited from 6E):
	  - "New issue" is hidden entirely (LocalToolbar hides it behind the
	    `mode === 'remote'` check; we never render it here).
	  - "Trash (N) · Empty" affordance is hidden entirely — remote mode
	    has no writable adapter, so the trash count is always zero.
	  - The refresh button stays clickable (it's the primary value-add
	    of the remote view).

	The Refresh PAT prompt:
	  The brief offers two contracts: (a) accept a `requestPat` callback
	  on the mode store, or (b) `refreshRemote` re-prompts inline. We
	  went with (b) — the prompt lives in this component (no state-layer
	  change), and the user sees exactly the same input the home page
	  shows. `RemotePatRequiredError` from the store (raised when the
	  PAT is empty / the user signed out) lands in the alert.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { formatRelative } from '$lib/ui/format';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import LogOut from '@lucide/svelte/icons/log-out';
	import RefreshPatPrompt from './RefreshPatPrompt.svelte';
	import { getStores } from '$lib/state';

	const stores = getStores();

	const viewLabel = $derived(stores.view.view);
	const fetchedLabel = $derived(
		stores.mode.lastFetchedAt === null
			? null
			: formatRelative(stores.mode.lastFetchedAt, Date.now())
	);
	const issueCount = $derived(stores.issues.issues.length);

	let refreshing = $state(false);
	let refreshError = $state<string | null>(null);
	let promptOpen = $state(false);

	async function onPatSubmitted(pat: string): Promise<void> {
		promptOpen = false;
		refreshing = true;
		refreshError = null;
		try {
			await stores.mode.refreshRemote(pat);
		} catch (cause) {
			// RemotePatRequiredError is the "session gone" signal — fall
			// through to the alert copy; the user can re-prompt from there.
			const name = (cause as { name?: string }).name;
			if (name === 'RemotePatRequiredError') {
				refreshError = t('common.remoteSessionExpired');
			} else {
				refreshError = (cause as Error).message;
			}
		} finally {
			refreshing = false;
		}
	}

	function openPrompt(): void {
		if (refreshing) return;
		refreshError = null;
		promptOpen = true;
	}

	function cancelPrompt(): void {
		promptOpen = false;
	}

	async function signOut(): Promise<void> {
		await stores.mode.signOut();
		await goto(resolve('/'));
	}
</script>

<div
	data-testid="remote-toolbar"
	class="sticky top-[var(--topbar-height)] z-10 flex flex-wrap items-center gap-2 border-b border-base-300 bg-base-200 px-4 py-2"
>
	<Button
		variant="primary"
		size="sm"
		loading={refreshing}
		onclick={openPrompt}
		data-testid="remote-toolbar-refresh"
	>
		<RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
		{t('common.refresh')}
	</Button>

	<span
		class="badge badge-warning badge-sm uppercase tracking-wide"
		data-testid="remote-toolbar-view-label"
	>
		{viewLabel}
	</span>

	{#if fetchedLabel !== null}
		<span
			class="text-xs opacity-60"
			data-testid="remote-toolbar-last-fetched"
			aria-label={t('remoteToolbar.lastFetchedAria', { label: fetchedLabel })}
		>
			{t('remoteToolbar.lastFetched', { label: fetchedLabel })}
		</span>
	{:else}
		<span class="text-xs opacity-60" data-testid="remote-toolbar-last-fetched-pending">
			{t('remoteToolbar.notYetFetched')}
		</span>
	{/if}

	<div class="flex-1"></div>

	<span class="text-xs opacity-60" data-testid="remote-toolbar-status">
		{t('remoteToolbar.view', { n: issueCount })}
	</span>

	<Button
		variant="ghost"
		size="sm"
		onclick={() => void signOut()}
		data-testid="remote-toolbar-signout"
	>
		<LogOut class="mr-1 h-4 w-4" aria-hidden="true" />
		{t('remoteToolbar.signOut')}
	</Button>
</div>

{#if refreshError}
	<div class="border-b border-base-300 bg-base-200 px-4 py-2">
		<div role="alert" data-testid="remote-toolbar-error" class="alert alert-error text-sm">
			<span>{refreshError}</span>
			<button
				type="button"
				class="btn btn-sm btn-circle btn-ghost focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
				aria-label={t('remoteToolbar.dismissErrorAria')}
				onclick={() => (refreshError = null)}
			>
				✕
			</button>
		</div>
	</div>
{/if}

<RefreshPatPrompt
	open={promptOpen}
	loading={refreshing}
	oncancel={cancelPrompt}
	onsubmit={(pat) => void onPatSubmitted(pat)}
/>
