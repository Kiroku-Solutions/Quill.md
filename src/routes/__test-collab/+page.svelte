<script lang="ts">
	// This is a dedicated test route to simulate two-tab collaboration in Playwright
	// without needing to bypass File System Access API prompts.
	import { onMount } from 'svelte';
	import { setStores } from '$lib/state/context';
	import EditorPanel from '$lib/components/EditorPanel.svelte';
	import type { StoreGraph } from '$lib/state/context';
	import type { Issue } from '$lib/types/issue';
	import { writable } from 'svelte/store';

	const mockIssue: Issue = {
		id: 'TEST-1',
		fields: {
			title: 'Collab Test',
			author: 'Test',
			creationDate: '2026-08-05',
			updatedDate: '2026-08-05',
			issueType: 'Bug',
			status: 'Open',
			assignee: null,
			labels: [],
			relations: [],
			startDate: null,
			endDate: null,
			duration: null,
			sprintId: null,
			estimate: null
		},
		customFields: {},
		sections: [{ name: 'Description', markdown: 'Initial description' }],
		integrityHash: 'abc',
		integrityWarning: false
	};

	let stores = {} as StoreGraph;
	let mounted = $state(false);

	onMount(() => {
		stores = {
			config: writable({
				default_status: 'Open',
				statuses: [],
				labels: [],
				templates: [],
				collab: { enabled: true, serverUrl: '' }
			}),
			issues: writable([mockIssue]),
			activeIssue: writable(mockIssue),
			search: writable({ query: '', filters: {} }),
			adapter: {
				mode: 'local',
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				handle: {} as any,
				saveIssue: async () => {},
				deleteIssue: async () => {},
				loadIssues: async () => [mockIssue],
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				loadConfig: async () => ({}) as any
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		setStores(stores);
		mounted = true;
	});
</script>

{#if mounted}
	<div class="test-collab-container flex h-screen flex-col bg-background text-foreground">
		<EditorPanel />
	</div>
{/if}
