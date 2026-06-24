<!--
	IconButton.svelte — daisyUI `.btn .btn-square .btn-ghost` wrapper.

	A square, borderless button that wraps a single icon (provided via
	the `children` snippet). Always requires an `aria-label` so the
	icon-only control is accessible to screen readers.

	Props:
	  label:   string         — required aria-label
	  disabled: boolean
	  class:   string         — extra utility classes
	  children: Snippet       — the icon (e.g. lucide-svelte <X />)
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	};

	let {
		label,
		disabled = false,
		type = 'button',
		class: extraClass = '',
		children,
		...rest
	}: Props = $props();
</script>

<button
	{type}
	aria-label={label}
	{disabled}
	class="btn btn-square btn-ghost focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {extraClass}"
	{...rest}
>
	{#if children}{@render children()}{/if}
</button>
