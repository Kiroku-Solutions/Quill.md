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

<div class="flex items-center gap-2 {extraClass}">
	<input
		{id}
		type="checkbox"
		aria-label={ariaLabel ?? undefined}
		class="checkbox checkbox-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
		bind:checked
		{disabled}
		{...rest}
	/>
	{#if label}
		<label for={id} class="label-text cursor-pointer select-none">{label}</label>
	{/if}
</div>
