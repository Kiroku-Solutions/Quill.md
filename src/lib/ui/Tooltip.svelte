<!--
	Tooltip.svelte — daisyUI `.tooltip` wrapper.

	Wraps an element in a daisyUI tooltip. The wrapped element gets
	`data-tip={text}` and the position class. The child element needs
	to be focusable (e.g. a button) for keyboard users to read the
	tooltip; the parent component is responsible for that.

	Props:
	  text:     string   — the tooltip text
	  position: 'top' | 'bottom' | 'left' | 'right' (default 'top')
	  class:    string   — extra utility classes
	  children: Snippet  — the trigger element
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Position = 'top' | 'bottom' | 'left' | 'right';

	type Props = {
		text: string;
		position?: Position;
		class?: string;
		children?: Snippet;
	};

	let { text, position = 'top', class: extraClass = '', children }: Props = $props();

	const positionClass = $derived(`tooltip-${position}`);
</script>

<span class="tooltip {positionClass} {extraClass}" data-tip={text}>
	{#if children}{@render children()}{/if}
</span>
