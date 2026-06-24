<!--
	Badge.svelte — daisyUI `.badge` wrapper.

	Props:
	  variant: 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'outline'
	  size:    'sm' | 'md' | 'lg' (default 'md')
	  class:   string  — extra utility classes
	  children: Snippet
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant =
		| 'neutral'
		| 'primary'
		| 'secondary'
		| 'success'
		| 'warning'
		| 'error'
		| 'ghost'
		| 'outline';
	type Size = 'sm' | 'md' | 'lg';

	type Props = {
		variant?: Variant;
		size?: Size;
		class?: string;
		children?: Snippet;
	};

	let { variant = 'neutral', size = 'md', class: extraClass = '', children }: Props = $props();

	const variantClass = $derived(`badge-${variant}`);
	const sizeClass = $derived(size === 'sm' ? 'badge-sm' : size === 'lg' ? 'badge-lg' : 'badge-md');
</script>

<span class="badge {variantClass} {sizeClass} {extraClass}">
	{#if children}{@render children()}{/if}
</span>
