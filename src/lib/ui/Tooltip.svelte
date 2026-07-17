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

	const positionClass = $derived(
		position === 'top'
			? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
			: position === 'bottom'
				? 'top-full left-1/2 -translate-x-1/2 mt-2'
				: position === 'left'
					? 'right-full top-1/2 -translate-y-1/2 mr-2'
					: 'left-full top-1/2 -translate-y-1/2 ml-2'
	);
</script>

<span class="group relative inline-block {extraClass}">
	{#if children}{@render children()}{/if}
	<span
		class="bg-surface-dark text-on-dark pointer-events-none absolute z-50 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100 {positionClass}"
	>
		{text}
	</span>
</span>
