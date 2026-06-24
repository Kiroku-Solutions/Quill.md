<!--
	Radio.svelte — daisyUI `.radio .radio-primary` wrapper.

	Used inside a radio group. The parent owns the `name` attribute so
	that browsers handle the "only one selected per group" behaviour
	correctly, and the `value` is the value submitted when this option
	is the selected one.

	Props:
	  checked:  boolean
	  name:     string
	  value:    string
	  label:    string
	  disabled: boolean
	  class:    string   — extra utility classes
-->
<script lang="ts">
	type Props = {
		checked: boolean;
		name: string;
		value: string;
		label: string;
		disabled?: boolean;
		class?: string;
	};

	let { checked, name, value, label, disabled = false, class: extraClass = '' }: Props = $props();

	const id = $derived(`rd-${name}-${value}-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class="flex items-center gap-2 {extraClass}">
	<input
		{id}
		type="radio"
		{name}
		{value}
		{checked}
		{disabled}
		class="radio radio-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
	/>
	<label for={id} class="label-text cursor-pointer select-none">{label}</label>
</div>
