<!--
	Textarea.svelte — daisyUI `.textarea .textarea-bordered` wrapper.

	Mirrors the Input API for multi-line text. Same `aria-describedby`
	error pattern: the error text is rendered below the field with the
	input wired to its id.

	Props:
	  value:       string
	  placeholder: string
	  error:       string | null
	  disabled:    boolean
	  class:       string         — extra utility classes
-->
<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	type Props = {
		value: string;
		placeholder?: string;
		error?: string | null;
		disabled?: boolean;
		class?: string;
		rows?: number;
	} & Omit<HTMLTextareaAttributes, 'value' | 'class' | 'rows'>;

	let {
		value = $bindable(),
		placeholder = '',
		error = null,
		disabled = false,
		class: extraClass = '',
		rows = 4,
		...rest
	}: Props = $props();

	const errorId = $derived(error ? `textarea-error-${Math.random().toString(36).slice(2, 8)}` : '');
</script>

<div class="flex w-full flex-col gap-1">
	<textarea
		{placeholder}
		{disabled}
		{rows}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? errorId : undefined}
		class="w-full resize-y rounded-md border border-border bg-background p-4 text-foreground placeholder-muted-foreground transition-shadow duration-[var(--motion-fast)] ease-[var(--ease-out)] focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset disabled:cursor-not-allowed disabled:opacity-50 {error
			? 'border-transparent ring-2 ring-error ring-inset'
			: ''} {extraClass}"
		{...rest}></textarea>
	{#if error}
		<p id={errorId} class="mt-1 text-sm text-error" role="alert">{error}</p>
	{/if}
</div>
