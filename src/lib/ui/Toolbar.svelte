<!--
	Toolbar.svelte — a flex row with consistent gap.

	Not a daisyUI class — pure Tailwind. This is the small wrapper
	every screen uses to lay out its action group (search + filter +
	new issue button + refresh + …).

	Props:
	  class:    string    — extra utility classes
	  children: Snippet
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		class?: string;
		children?: Snippet;
	};

	let { class: extraClass = '', children }: Props = $props();
</script>

<div class="flex items-center gap-2 {extraClass}">
	{#if children}{@render children()}{/if}
</div>
