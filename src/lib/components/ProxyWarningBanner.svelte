<!--
	ProxyWarningBanner — surfaces the CORS proxy warning text returned by
	the most recent `openRemote` call (FR-12).

	Behaviour:
	 - Renders nothing when `mode.proxyWarning` is null.
	 - Renders a `role="alert"` div with the warning text and a Dismiss
	   button. Dismissal is per-mount, not persisted to the store, so a
	   subsequent route navigation that re-creates this component will
	   show the warning again. (The store is the source of truth — the
	   banner is just a consumer; resetting the store via `signOut`
	   clears the warning fully.)

	NFR-2: the warning text is host-only (the CORS proxy host) and never
	contains the PAT or the Authorization header. We do not transform it
	before rendering.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';

	const { mode } = getStores();

	let acknowledged = $state(false);

	function dismiss(): void {
		acknowledged = true;
	}
</script>

{#if mode.proxyWarning !== null && !acknowledged}
	<div
		role="alert"
		class="flex items-start gap-4 border-b border-[var(--color-cb-yellow)] bg-[var(--color-cb-yellow)]/10 px-6 py-4 text-foreground"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 shrink-0 text-[var(--color-cb-yellow)]"
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.85-2.75L13.85 4.92a2 2 0 00-3.7 0L3.15 16.25A2 2 0 005 19z"
			/>
		</svg>
		<span class="mt-0.5 flex-1 font-sans text-sm">{mode.proxyWarning}</span>
		<button
			type="button"
			class="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
			aria-label={t('proxy.dismissAria')}
			onclick={dismiss}
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				></path></svg
			>
		</button>
	</div>
{/if}
