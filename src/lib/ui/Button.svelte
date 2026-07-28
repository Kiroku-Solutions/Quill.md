<!--
	Button.svelte — S+ Tier Button wrapper.

	Follows Coinbase brand system: pill geometry, primary action blue, 
	secondary strong-surface, and exact padding ratios.

	Props:
	  variant: 'primary' | 'secondary' | 'ghost' | 'outline' | 'error' | 'success' (default 'primary')
	  size:    'sm' | 'md' | 'lg' (default 'md')
	  loading: boolean
	  disabled: boolean
	  type:    'button' | 'submit' | 'reset' (default 'button')
	  class:   string   — extra utility classes
	  children: Snippet — button label / icon
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'error' | 'success';
	type Size = 'sm' | 'md' | 'lg';

	type Props = {
		variant?: Variant;
		size?: Size;
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	};

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		type = 'button',
		class: extraClass = '',
		children,
		...rest
	}: Props = $props();

	// Coinbase heuristics:
	// Primary: blue background, white text.
	// Secondary: soft strong surface, ink text.
	// Outline: hairline border, transparent bg.
	// Ghost: transparent bg, blue text.
	const variantClass = $derived(
		variant === 'primary'
			? 'bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground'
			: variant === 'secondary'
				? 'bg-surface text-foreground hover:bg-muted hover:text-muted-foreground'
				: variant === 'ghost'
					? 'bg-transparent text-primary hover:bg-muted hover:text-muted-foreground'
					: variant === 'outline'
						? 'border border-border bg-transparent text-foreground hover:bg-muted hover:text-muted-foreground'
						: variant === 'error'
							? 'bg-error text-white opacity-90 hover:opacity-100'
							: 'bg-success text-white opacity-90 hover:opacity-100'
	);

	const disabledClass = $derived(
		disabled || loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
	);

	// Coinbase sizing:
	// md -> 44px height (py-2.5 px-5)
	// lg -> 56px height (py-4 px-8)
	// sm -> 32px height (py-1.5 px-4)
	const sizeClass = $derived(
		size === 'sm'
			? 'h-8 px-4 text-sm'
			: size === 'lg'
				? 'h-14 px-8 text-base'
				: 'h-11 px-5 text-base'
	);

	const isInactive = $derived(disabled || loading);
</script>

<button
	{type}
	class="inline-flex items-center justify-center rounded-pill font-sans font-semibold transition-all duration-[var(--motion-fast)] ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-95 {variantClass} {sizeClass} {disabledClass} {extraClass}"
	disabled={isInactive}
	aria-busy={loading || undefined}
	{...rest}
>
	{#if loading}
		<svg
			class="mr-2 -ml-1 h-4 w-4 animate-spin text-current"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
			></circle>
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			></path>
		</svg>
	{/if}
	{#if children}{@render children()}{/if}
</button>
