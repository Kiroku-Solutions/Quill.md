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
	import Info from '@lucide/svelte/icons/info';
	import CheckCircle from '@lucide/svelte/icons/check-circle-2';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import X from '@lucide/svelte/icons/x';

	type Variant = 'info' | 'success' | 'warning' | 'error';

	type Props = {
		variant?: Variant;
		onclose?: () => void;
		class?: string;
		children?: Snippet;
	};

	let { variant = 'info', onclose, class: extraClass = '', children }: Props = $props();

	const config = $derived(
		variant === 'error'
			? {
					bg: 'bg-error/5',
					border: 'border-error/20 border-l-error',
					icon: AlertCircle,
					iconColor: 'text-error'
				}
			: variant === 'warning'
				? {
						bg: 'bg-warning/5',
						border: 'border-warning/20 border-l-warning',
						icon: AlertTriangle,
						iconColor: 'text-warning'
					}
				: variant === 'success'
					? {
							bg: 'bg-success/5',
							border: 'border-success/20 border-l-success',
							icon: CheckCircle,
							iconColor: 'text-success'
						}
					: {
							bg: 'bg-primary/5',
							border: 'border-primary/20 border-l-primary',
							icon: Info,
							iconColor: 'text-primary'
						}
	);
	const Icon = $derived(config.icon);
</script>

<div
	role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
	class="flex items-start gap-3 rounded-xl border border-l-4 p-4 shadow-sm {config.bg} {config.border} {extraClass} transition-all duration-[var(--motion-base)]"
>
	<div class="mt-0.5 shrink-0 {config.iconColor}">
		<Icon class="h-5 w-5" aria-hidden="true" />
	</div>
	<div class="flex-1 font-sans text-sm leading-relaxed font-medium text-foreground/90">
		{#if children}{@render children()}{/if}
	</div>
	{#if onclose}
		<button
			type="button"
			aria-label="Close"
			class="-m-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
			onclick={onclose}
		>
			<X class="h-4 w-4" aria-hidden="true" />
		</button>
	{/if}
</div>
