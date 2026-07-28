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
		'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'outline';
	type Size = 'sm' | 'md' | 'lg';

	type Props = {
		variant?: Variant;
		size?: Size;
		class?: string;
		children?: Snippet;
	};

	let { variant = 'neutral', size = 'md', class: extraClass = '', children }: Props = $props();

	const variantClass = $derived(
		variant === 'primary'
			? 'bg-primary text-primary-foreground'
			: variant === 'secondary'
				? 'bg-secondary text-secondary-foreground'
				: variant === 'success'
					? 'bg-success/10 text-success'
					: variant === 'warning'
						? 'bg-warning/10 text-warning'
						: variant === 'error'
							? 'bg-error/10 text-error'
							: variant === 'outline'
								? 'bg-transparent border border-border text-foreground'
								: variant === 'ghost'
									? 'bg-transparent text-foreground'
									: 'bg-muted text-foreground'
	);
	const sizeClass = $derived(
		size === 'sm'
			? 'px-2 py-0.5 text-[10px]'
			: size === 'lg'
				? 'px-4 py-1.5 text-sm'
				: 'px-3 py-1 text-xs'
	);
</script>

<span
	class="inline-flex items-center justify-center rounded-pill font-sans font-semibold tracking-wider uppercase {variantClass} {sizeClass} {extraClass}"
>
	{#if children}{@render children()}{/if}
</span>
