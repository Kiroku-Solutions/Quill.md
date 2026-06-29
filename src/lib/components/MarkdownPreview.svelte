<!--
	MarkdownPreview.svelte — debounced, sanitized Markdown preview
	for the editor's Preview tab (sub-phase 6G, FR-13).

	Pipeline: `markdown` prop → 250 ms debounce → `renderMarkdown`
	from `$lib/adapters/renderer` (marked + DOMPurify) → `{@html}`.

	While `markdown !== debounced` OR a render is in flight, a 6B
	`Skeleton` placeholder is shown. The `{@html}` source is
	DOMPurify-sanitised; the eslint `svelte/no-at-html-tags` rule is
	too strict here so we suppress it on that one site.
-->
<script lang="ts">
	import { renderMarkdown } from '$lib/adapters/renderer';
	import { t } from '$lib/ui/strings';
	import Skeleton from '$lib/ui/Skeleton.svelte';

	type Props = { markdown: string };

	let { markdown }: Props = $props();

	let debounced = $state('');
	let html = $state('');
	let rendering = $state(true);
	let seeded = $state(false);

	// Seed the debounced cell with the initial prop value. Avoid
	// `$state(markdown)` — `$state(prop)` only captures the initial
	// value (and the linter flags it as state-referenced-locally).
	$effect(() => {
		if (!seeded) {
			debounced = markdown;
			seeded = true;
		}
	});

	$effect(() => {
		const next = markdown;
		const timer = setTimeout(() => {
			debounced = next;
		}, 250);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const src = debounced;
		let cancelled = false;
		rendering = true;
		(async () => {
			try {
				const out = await renderMarkdown(src, 'comment');
				if (!cancelled) html = out;
			} catch {
				if (!cancelled) html = t('markdown.renderFailed');
			} finally {
				if (!cancelled) rendering = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	const isLoading = $derived(markdown !== debounced || rendering);
</script>

<div class="prose max-w-none" data-testid="markdown-preview">
	{#if isLoading}
		<div class="flex flex-col gap-2" data-testid="markdown-preview-loading">
			<Skeleton width="w-3/4" height="h-6" />
			<Skeleton width="w-full" height="h-4" />
			<Skeleton width="w-full" height="h-4" />
			<Skeleton width="w-2/3" height="h-4" />
		</div>
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}
	{/if}
</div>
