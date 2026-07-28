<!--
	Radio.svelte — daisyUI `.radio .radio-primary` wrapper.

	Used inside a radio group. The parent owns the `name` attribute so
	that browsers handle the "only one selected per group" behaviour
	correctly, and the `value` is the value submitted when this option
	is the selected one.

	Props:
	  checked:    boolean
	  name:       string
	  value:      string
	  label:      string
	  disabled:   boolean
	  ariaLabel:  string | null  — fallback a11y label when `label` is
	                              empty (e.g. when the visual label lives
	                              outside the radio as a sibling block).
	  class:      string   — extra utility classes

	Any extra HTML attributes (`onchange`, `data-testid`, …) are spread
	onto the underlying `<input>` so callers can wire state without
	duplicating the markup.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		checked: boolean;
		name: string;
		value: string;
		label: string;
		disabled?: boolean;
		ariaLabel?: string | null;
		class?: string;
	} & Omit<
		HTMLInputAttributes,
		'checked' | 'name' | 'value' | 'label' | 'disabled' | 'class' | 'aria-label'
	>;

	let {
		checked,
		name,
		value,
		label,
		disabled = false,
		ariaLabel = null,
		class: extraClass = '',
		...rest
	}: Props = $props();

	const id = $derived(`rd-${name}-${value}-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class="flex items-center gap-3 {extraClass}">
	<input
		{id}
		type="radio"
		{name}
		{value}
		{checked}
		{disabled}
		aria-label={ariaLabel ?? undefined}
		class="h-5 w-5 flex-shrink-0 cursor-pointer appearance-none rounded-full border border-border bg-background transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] checked:border-[6px] checked:border-primary checked:bg-background focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		{...rest}
	/>
	{#if label}
		<label
			for={id}
			class="cursor-pointer font-sans text-sm text-foreground select-none disabled:cursor-not-allowed disabled:opacity-50"
			>{label}</label
		>
	{/if}
</div>
