<!--
	Card.svelte — daisyUI `.card .card-bordered` container.

	Props:
	  compact:  boolean   — toggles `card-compact` for dense layouts
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

<div class="card card-bordered bg-base-100 shadow-sm {compact ? 'card-compact' : ''} {extraClass}">
	<div class="card-body">
		{#if children}{@render children()}{/if}
	</div>
</div>
