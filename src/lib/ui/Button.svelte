<!--
	Button.svelte — daisyUI `.btn` wrapper.

	Wraps the daisyUI button classes with a typed variant + size prop.
	Passes through `class` and any other HTML attributes (e.g. `type`,
	`onclick`) via the `...rest` spread. When `loading` is true the
	button is disabled, `aria-busy="true"` is set, and a spinner glyph
	is shown next to the children.

	Props:
	  variant: 'primary' | 'secondary' | 'ghost' | 'error' | 'success' (default 'primary')
	  size:    'sm' | 'md' | 'lg' (default 'md')
	  loading: boolean
	  disabled: boolean
	  type:    'button' | 'submit' | 'reset' (default 'button')
	  class:   string   — extra utility classes
	  children: Snippet — button label / icon
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'error' | 'success';
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

	const variantClass = $derived(
		variant === 'primary'
			? 'btn-primary'
			: variant === 'secondary'
				? 'btn-secondary'
				: variant === 'ghost'
					? 'btn-ghost'
					: variant === 'error'
						? 'btn-error'
						: 'btn-success'
	);
	const sizeClass = $derived(size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : 'btn-md');
	const isInactive = $derived(disabled || loading);
</script>

<button
	{type}
	class="btn {variantClass} {sizeClass} focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {extraClass}"
	disabled={isInactive}
	aria-busy={loading || undefined}
	{...rest}
>
	{#if loading}
		<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
	{/if}
	{#if children}{@render children()}{/if}
</button>
