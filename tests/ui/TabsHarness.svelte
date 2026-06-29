<!--
	TabsHarness.svelte — test harness for the Tabs primitive.

	Owns a `value` $state cell and an `onchange` handler so the test
	can verify that activation propagates and that `bind:value` keeps
	the cell in sync with the active tab.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import Tabs from '../../src/lib/ui/Tabs.svelte';

	type Tab = { id: string; label: string };

	type Props = {
		tabs: ReadonlyArray<Tab>;
		initial: string;
		onchange?: (id: string) => void;
	};

	let { tabs, initial, onchange = () => {} }: Props = $props();
	let value = $state(untrack(() => initial));
</script>

<Tabs {tabs} bind:value {onchange} />
