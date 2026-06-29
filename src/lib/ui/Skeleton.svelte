<!--
	Skeleton.svelte — daisyUI `.skeleton` loading placeholder.

	Props:
	  width:   string                          — CSS width, e.g. 'w-32' or '12rem'
	  height:  string                          — CSS height, e.g. 'h-4' or '1rem'
	  rounded: 'sm' | 'md' | 'lg' | 'full' | 'none' (default 'md')
	  class:   string                          — extra utility classes
-->
<script lang="ts">
	type Rounded = 'sm' | 'md' | 'lg' | 'full' | 'none';

	type Props = {
		width?: string;
		height?: string;
		rounded?: Rounded;
		class?: string;
	};

	let { width = '', height = '', rounded = 'md', class: extraClass = '' }: Props = $props();

	const roundedClass = $derived(
		rounded === 'sm'
			? 'rounded-sm'
			: rounded === 'lg'
				? 'rounded-lg'
				: rounded === 'full'
					? 'rounded-full'
					: rounded === 'none'
						? 'rounded-none'
						: 'rounded-md'
	);
</script>

<div class="skeleton {roundedClass} {width} {height} {extraClass}" aria-hidden="true"></div>
