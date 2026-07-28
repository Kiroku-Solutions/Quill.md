<!--
	Input.svelte — daisyUI `.input .input-bordered` wrapper.

	Props:
	  value:       string
	  placeholder: string
	  error:       string | null  — when set, the input gets `.input-error` and
	                                the error text is rendered below with
	                                `aria-describedby` linking to the error id.
	  type:        'text' | 'email' | 'url' | 'password' | 'search' | 'number'
	  disabled:    boolean
	  class:       string         — extra utility classes
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type InputType = 'text' | 'email' | 'url' | 'password' | 'search' | 'number';

	type Props = {
		value: string;
		placeholder?: string;
		error?: string | null;
		type?: InputType;
		disabled?: boolean;
		class?: string;
	} & Omit<HTMLInputAttributes, 'value' | 'class' | 'type'>;

	let {
		value = $bindable(),
		placeholder = '',
		error = null,
		type = 'text',
		disabled = false,
		class: extraClass = '',
		...rest
	}: Props = $props();

	const errorId = $derived(error ? `input-error-${Math.random().toString(36).slice(2, 8)}` : '');
</script>

<div class="flex w-full flex-col gap-1">
	<input
		{type}
		{placeholder}
		{disabled}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? errorId : undefined}
		class="h-12 w-full rounded-md border border-border bg-background px-4 text-foreground placeholder-muted-foreground transition-shadow duration-[var(--motion-fast)] ease-in-out focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset disabled:cursor-not-allowed disabled:opacity-50 {error
			? 'border-transparent ring-2 ring-error ring-inset'
			: ''} {extraClass}"
		{...rest}
	/>
	{#if error}
		<p id={errorId} class="mt-1 text-sm text-error" role="alert">{error}</p>
	{/if}
</div>
