<!--
	MarkdownPreviewHarness.svelte — test harness for MarkdownPreview.

	Owns a `markdown` $state cell and forwards it to MarkdownPreview
	as the `markdown` prop. Tests can update the cell via the
	`value` prop, which is `bind`-able from the test side via the
	`rerender({ value: '...' })` flow provided by
	`vitest-browser-svelte`.
-->
<script lang="ts">
	import MarkdownPreview from '../../src/lib/components/MarkdownPreview.svelte';

	type Props = {
		value: string;
	};

	let { value = $bindable() }: Props = $props();
</script>

<MarkdownPreview markdown={value} />
