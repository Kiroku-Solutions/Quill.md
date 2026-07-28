<!--
	Card.svelte — S+ Tier Card container.

	Follows Coinbase brand system: rounded-xl, sharp borders or shadow, 
	no nested cards, flex layout base.

	Props:
	  compact:  boolean   — toggles padding for dense layouts
	  class:    string    — extra utility classes
	  children: Snippet
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		compact?: boolean;
		class?: string;
		children?: Snippet;
	};

	let { compact = false, class: extraClass = '', children }: Props = $props();
</script>

<div
	class="flex flex-col rounded-xl border border-border bg-surface shadow-sm transition-all duration-[var(--motion-fast)] ease-in-out {compact
		? 'p-4'
		: 'p-8'} {extraClass}"
>
	{#if children}{@render children()}{/if}
</div>
