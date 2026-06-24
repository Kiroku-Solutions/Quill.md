<!--
	Alert.svelte — daisyUI `.alert` wrapper.

	Renders a coloured alert banner with a × close button when `onclose`
	is provided. The icon area is reserved (slot reserved) but the
	children fill the body.

	Props:
	  variant: 'info' | 'success' | 'warning' | 'error'
	  onclose: optional close handler; when set, a × button is rendered
	  class:   string  — extra utility classes
	  children: Snippet
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'info' | 'success' | 'warning' | 'error';

	type Props = {
		variant: Variant;
		onclose?: () => void;
		class?: string;
		children?: Snippet;
	};

	let { variant, onclose, class: extraClass = '', children }: Props = $props();

	const variantClass = $derived(`alert-${variant}`);
</script>

<div
	role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
	class="alert {variantClass} {extraClass}"
>
	<div class="flex-1">
		{#if children}{@render children()}{/if}
	</div>
	{#if onclose}
		<button
			type="button"
			aria-label="Close"
			class="btn btn-sm btn-circle btn-ghost focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			onclick={onclose}
		>
			✕
		</button>
	{/if}
</div>
