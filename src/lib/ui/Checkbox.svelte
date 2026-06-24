<!--
	Checkbox.svelte — daisyUI `.checkbox .checkbox-primary` wrapper.

	Renders a labelled checkbox; the label is associated with the input
	via a generated id, so clicking the label toggles the box. The
	component is fully controlled (`bind:checked`).

	Props:
	  checked:  boolean
	  label:    string
	  disabled: boolean
	  class:    string   — extra utility classes
-->
<script lang="ts">
	type Props = {
		checked: boolean;
		label: string;
		disabled?: boolean;
		class?: string;
	};

	let { checked = $bindable(), label, disabled = false, class: extraClass = '' }: Props = $props();

	const id = `cb-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="flex items-center gap-2 {extraClass}">
	<input
		{id}
		type="checkbox"
		class="checkbox checkbox-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
		bind:checked
		{disabled}
	/>
	<label for={id} class="label-text cursor-pointer select-none">{label}</label>
</div>
