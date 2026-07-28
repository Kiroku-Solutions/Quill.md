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
	import Button from './Button.svelte';

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
	class="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-background p-12 text-center {extraClass}"
>
	<svg
		aria-hidden="true"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		class="h-12 w-12 text-muted-foreground"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"
		/>
	</svg>
	<h2 class="mt-2 font-display text-xl text-foreground">{title}</h2>
	{#if body}
		<p class="max-w-md text-base text-muted-foreground">{body}</p>
	{/if}
	{#if action}
		<Button class="mt-4" onclick={action.onselect}>
			{action.label}
		</Button>
	{/if}
</div>
