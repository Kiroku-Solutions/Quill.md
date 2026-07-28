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
	class="h-12 w-full appearance-none rounded-md border border-border bg-background bg-no-repeat pr-10 pl-4 text-foreground transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-out)] focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset disabled:cursor-not-allowed disabled:opacity-50 {extraClass}"
	style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22currentColor%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E'); background-position: right 1rem center; background-size: 1.5em 1.5em;"
>
	{#if placeholder}
		<option value="" disabled={!!value}>{placeholder}</option>
	{/if}
	{#each options as opt (opt.id)}
		<option value={opt.id}>{opt.name}</option>
	{/each}
</select>
