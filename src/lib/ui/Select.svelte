<!--
	Select.svelte — daisyUI `.select .select-bordered` wrapper.

	Native `<select>` is the right primitive for keyboard + mobile a11y.
	The component is fully controlled (`bind:value`); the parent is
	responsible for keeping the value in sync.

	Props:
	  value:       string
	  options:     ReadonlyArray<{ id: string; name: string }>
	  placeholder: string   — rendered as a disabled <option> when the
	                          value is empty so the dropdown shows the
	                          prompt before the user picks a real option.
	  disabled:    boolean
	  class:       string    — extra utility classes
-->
<script lang="ts">
	type Option = { id: string; name: string };

	type Props = {
		value: string;
		options: ReadonlyArray<Option>;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
	};

	let {
		value = $bindable(),
		options,
		placeholder = '',
		disabled = false,
		class: extraClass = ''
	}: Props = $props();
</script>

<select
	bind:value
	{disabled}
	class="select select-bordered focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {extraClass}"
>
	{#if placeholder}
		<option value="" disabled={!!value}>{placeholder}</option>
	{/if}
	{#each options as opt (opt.id)}
		<option value={opt.id}>{opt.name}</option>
	{/each}
</select>
