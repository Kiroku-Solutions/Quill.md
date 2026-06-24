<!--
	FilterUrlSync.svelte — render-less URL ↔ filter store bridge (sub-phase 6I).
	On mount: parse `window.location.search` → `filter.set` when non-empty.
	On every filter change: debounce 100 ms → `history.replaceState`.
	On `popstate`: re-parse the URL into the store.
	The "skip when settings panel is open" guard from the 6H hand-off is
	deferred (settingsOpen is local $state in TopBar.svelte; no body class).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getStores } from '$lib/state';
	import type { FilterState } from '$lib/state';

	const { filter } = getStores();
	const DEBOUNCE_MS = 100;

	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastSerialized = '';
	let lastFilterJson = '';
	// The $effect runs once on mount to register its dependencies; we
	// must NOT write to the URL on that initial run (would overwrite the
	// query the user just landed with). After the first run we treat
	// every change as a user-driven filter mutation and debounce-write.
	let isFirstRun = true;

	function syncFromUrl(): void {
		const params = new URLSearchParams(window.location.search);
		if ([...params.entries()].length === 0) return;
		filter.parse(params);
	}

	onMount(() => {
		syncFromUrl();
		const onPopState = (): void => syncFromUrl();
		window.addEventListener('popstate', onPopState);
		return () => {
			window.removeEventListener('popstate', onPopState);
			if (timer !== null) clearTimeout(timer);
		};
	});

	$effect(() => {
		const currentJson = JSON.stringify(filter.filter as FilterState);
		if (isFirstRun) {
			isFirstRun = false;
			lastFilterJson = currentJson;
			return;
		}
		if (currentJson === lastFilterJson) return;
		lastFilterJson = currentJson;
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			const next = '?' + filter.serialize().toString();
			if (next === lastSerialized || next === '?') return;
			lastSerialized = next;
			history.replaceState(null, '', next);
		}, DEBOUNCE_MS);
	});
</script>
