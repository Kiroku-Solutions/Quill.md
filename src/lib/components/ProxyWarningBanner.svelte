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

	const { mode } = getStores();

	let acknowledged = $state(false);

	function dismiss(): void {
		acknowledged = true;
	}
</script>

{#if mode.proxyWarning !== null && !acknowledged}
	<div role="alert" class="alert alert-warning rounded-none border-b border-base-300">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 shrink-0 stroke-current"
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
		<span class="text-sm flex-1">{mode.proxyWarning}</span>
		<button
			type="button"
			class="btn btn-ghost btn-sm"
			aria-label="Dismiss proxy warning"
			onclick={dismiss}
		>
			Dismiss
		</button>
	</div>
{/if}
