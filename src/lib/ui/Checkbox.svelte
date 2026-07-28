<!--
	Checkbox.svelte — daisyUI `.checkbox .checkbox-primary` wrapper.

	Renders a labelled checkbox; the label is associated with the input
	via a generated id, so clicking the label toggles the box. The
	component is fully controlled (`bind:checked`).

	Props:
	  checked:    boolean
	  label:      string
	  disabled:   boolean
	  ariaLabel:  string | null  — fallback a11y label when `label` is
	                                empty (e.g. when the visual label lives
	                                outside the checkbox as a sibling
	                                block).
	  class:      string   — extra utility classes

	Any extra HTML attributes (`onchange`, `data-testid`, …) are spread
	onto the underlying `<input>` so callers can wire state without
	duplicating the markup.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		checked: boolean;
		label: string;
		disabled?: boolean;
		ariaLabel?: string | null;
		class?: string;
	} & Omit<HTMLInputAttributes, 'checked' | 'label' | 'disabled' | 'class' | 'aria-label'>;

	let {
		checked = $bindable(),
		label,
		disabled = false,
		ariaLabel = null,
		class: extraClass = '',
		...rest
	}: Props = $props();

	const id = `cb-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="flex items-center gap-3 {extraClass}">
	<input
		{id}
		type="checkbox"
		aria-label={ariaLabel ?? undefined}
		class="h-5 w-5 flex-shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-background bg-[length:12px_12px] bg-center bg-no-repeat transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)] checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M10.5%203L4.5%209L1.5%206%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		bind:checked
		{disabled}
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
