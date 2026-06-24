<!--
	EmptyState.svelte — hero-surface empty state.

	Centred icon + title + body + optional action button. No daisyUI
	class — styled with the hero tokens from `src/lib/ui/tokens.css`.

	Props:
	  title:    string
	  body:     optional string
	  action:   optional { label: string; onselect: () => void }
	  class:    string    — extra utility classes
-->
<script lang="ts">
	type Action = { label: string; onselect: () => void };

	type Props = {
		title: string;
		body?: string;
		action?: Action;
		class?: string;
	};

	let { title, body = '', action, class: extraClass = '' }: Props = $props();
</script>

<div
	role="status"
	class="flex flex-col items-center justify-center gap-3 rounded-lg border border-base-300 bg-base-100 p-8 text-center {extraClass}"
>
	<svg
		aria-hidden="true"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		class="h-12 w-12 text-base-content/40"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"
		/>
	</svg>
	<h2 class="text-lg font-semibold">{title}</h2>
	{#if body}
		<p class="max-w-md text-sm text-base-content/70">{body}</p>
	{/if}
	{#if action}
		<button
			type="button"
			class="btn btn-primary mt-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			onclick={action.onselect}
		>
			{action.label}
		</button>
	{/if}
</div>
