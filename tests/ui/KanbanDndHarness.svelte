<!--
	KanbanDndHarness.svelte — test harness for KanbanView DnD / keyboard.

	Wraps the production `KanbanView` so the test can mount it
	without having to wire the surrounding `AppShell` chrome. The
	harness is NOT a production component; it lives in `tests/ui/`
	for the test infrastructure to find.
-->
<script lang="ts">
	import KanbanView from '../../src/lib/components/KanbanView.svelte';
</script>

<KanbanView />
