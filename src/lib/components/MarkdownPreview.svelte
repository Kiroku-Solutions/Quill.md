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
	import mermaid from 'mermaid';
	import { tick } from 'svelte';

	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: 'default'
	});

	type Props = { markdown: string };

	let { markdown }: Props = $props();

	let debounced = $state('');
	let html = $state('');
	let rendering = $state(true);
	let seeded = $state(false);
	let container = $state<HTMLElement>();

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
				if (!cancelled) {
					html = out;
				}
			} catch {
				if (!cancelled) html = t('markdown.renderFailed');
			} finally {
				if (!cancelled) {
					rendering = false;
					await tick();
					if (!cancelled && container) {
						const nodes = container.querySelectorAll('code.language-mermaid');
						for (const node of nodes) {
							const pre = node.parentElement;
							if (pre && pre.tagName === 'PRE') {
								const wrapper = document.createElement('div');
								wrapper.className = 'mermaid-wrapper relative group rounded-md border border-border bg-surface my-4';

								const div = document.createElement('div');
								div.className = 'mermaid p-4 flex justify-center overflow-x-auto';
								div.textContent = node.textContent;

								wrapper.appendChild(div);

								const btnGroup = document.createElement('div');
								btnGroup.className = 'absolute top-2 right-2 z-10 flex gap-1 p-1 rounded-md bg-surface border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity';

								const createBtn = (icon: string, title: string, onClick: () => void) => {
									const b = document.createElement('button');
									b.className = 'p-1.5 rounded hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer';
									b.title = title;
									b.innerHTML = icon;
									b.onclick = onClick;
									return b;
								};

								let currentScale = 1;
								let originalWidth: number | null = null;
								let originalHeight: number | null = null;
								
								const zoomInIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>`;
								const zoomOutIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>`;
								const resetIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
								const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
								const maximizeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
								const minimizeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3h-3"/><path d="M21 8h-3V5"/><path d="M3 16h3v3"/><path d="M16 21v-3h3"/><path d="M14 10L21 3"/><path d="M3 21l7-7"/><path d="M3 3l7 7"/><path d="M14 14l7 7"/></svg>`;

								const updateZoom = () => {
									const svg = div.querySelector('svg');
									if (svg) {
										if (originalWidth === null) {
											const box = svg.getBoundingClientRect();
											originalWidth = box.width;
											originalHeight = box.height;
										}

										if (currentScale === 1) {
											svg.style.transform = '';
											svg.style.transformOrigin = '';
											div.style.minHeight = '';
											div.style.minWidth = '';
										} else {
											svg.style.transform = `scale(${currentScale})`;
											svg.style.transformOrigin = 'top center';
											if (originalHeight !== null && originalWidth !== null) {
												div.style.minHeight = `${originalHeight * currentScale}px`;
												div.style.minWidth = `${originalWidth * currentScale}px`;
											}
										}
										svg.style.transition = 'transform 0.2s ease-in-out';
									}
								};

								btnGroup.appendChild(createBtn(zoomInIcon, t('common.zoomIn') || 'Zoom In', () => { currentScale += 0.25; updateZoom(); }));
								btnGroup.appendChild(createBtn(zoomOutIcon, t('common.zoomOut') || 'Zoom Out', () => { currentScale = Math.max(0.25, currentScale - 0.25); updateZoom(); }));
								btnGroup.appendChild(createBtn(resetIcon, t('common.resetZoom') || 'Reset Zoom', () => { currentScale = 1; updateZoom(); }));
								
								btnGroup.appendChild(createBtn(downloadIcon, t('common.download') || 'Download PNG', () => {
									const svg = div.querySelector('svg');
									if (!svg) return;
									const clone = svg.cloneNode(true) as SVGSVGElement;
									const box = svg.getBoundingClientRect();
									const unscaledWidth = box.width / currentScale;
									const unscaledHeight = box.height / currentScale;
									
									clone.style.transform = 'none';
									clone.setAttribute('width', String(unscaledWidth));
									clone.setAttribute('height', String(unscaledHeight));
									
									const svgData = new XMLSerializer().serializeToString(clone);
									const canvas = document.createElement('canvas');
									canvas.width = unscaledWidth * 2;
									canvas.height = unscaledHeight * 2;
									const ctx = canvas.getContext('2d');
									if (!ctx) return;
									ctx.scale(2, 2);
									ctx.fillStyle = '#ffffff';
									ctx.fillRect(0, 0, canvas.width, canvas.height);
									
									const img = new Image();
									img.onload = () => {
										ctx.drawImage(img, 0, 0);
										const a = document.createElement('a');
										a.download = `diagram-${Date.now()}.png`;
										a.href = canvas.toDataURL('image/png');
										a.click();
									};
									img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
								}));

								const fsBtn = createBtn(maximizeIcon, t('common.fullscreen') || 'Fullscreen', () => {
									if (document.fullscreenElement) {
										document.exitFullscreen().catch(console.error);
									} else {
										wrapper.requestFullscreen().catch(console.error);
									}
								});
								
								wrapper.addEventListener('fullscreenchange', () => {
									if (document.fullscreenElement === wrapper) {
										fsBtn.innerHTML = minimizeIcon;
									} else {
										fsBtn.innerHTML = maximizeIcon;
										currentScale = 1;
										updateZoom();
									}
								});

								btnGroup.appendChild(fsBtn);
								wrapper.appendChild(btnGroup);
								pre.replaceWith(wrapper);
							}
						}
						if (nodes.length > 0) {
							try {
								await mermaid.run({
									nodes: container.querySelectorAll('.mermaid')
								});
							} catch (e) {
								console.error('Mermaid render failed', e);
							}
						}
					}
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	const isLoading = $derived(markdown !== debounced || rendering);
</script>

<div bind:this={container} class="prose max-w-none" data-testid="markdown-preview">
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

<style>
	:global(.mermaid-wrapper:fullscreen) {
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		overflow: auto;
	}
	:global(.mermaid-wrapper:fullscreen .mermaid) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	:global(.mermaid-wrapper:fullscreen .mermaid svg) {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
	}
</style>
