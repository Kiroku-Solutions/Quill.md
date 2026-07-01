<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount, onDestroy } from 'svelte';
	import { IconButton } from '$lib/ui';
	import Maximize from '@lucide/svelte/icons/maximize';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import ZoomOut from '@lucide/svelte/icons/zoom-out';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	
	// Graphology & Sigma
	import Graph from 'graphology';
	import { Sigma } from 'sigma';
	import { circular } from 'graphology-layout';
	import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker';
	import forceAtlas2 from 'graphology-layout-forceatlas2';
	import { persistedLayout } from '$lib/services/graph-persistence';
	
	const { issues, editor, templates } = getStores();

	let container: HTMLDivElement | undefined = $state();
	let sigma: Sigma | undefined;
	let fa2: FA2LayoutSupervisor | undefined;
	let isSimulating = $state(true);

	$effect(() => {
		void issues.issues;
		
		if (!sigma) return;
		buildGraph();
	});

	function buildGraph() {
		if (!sigma) return;
		const graph = sigma.getGraph();
		graph.clear();
		
		// Add nodes
		for (const li of issues.issues) {
			const issue = li.issue;
			const tmpl = templates.byType.get(issue.issueType);
			const radius = issue.issueType === 'sprint' ? 14 : (issue.issueType === 'epic' ? 12 : 8);
			
			graph.addNode(String(issue.id), {
				x: Math.random() * 100,
				y: Math.random() * 100,
				size: radius,
				label: issue.title.length > 20 ? issue.title.substring(0, 20) + '...' : issue.title,
				color: tmpl?.color || '#888888'
			});
		}
		
		// Add edges
		for (const li of issues.issues) {
			const issue = li.issue;
			for (const rel of issue.relations) {
				if (graph.hasNode(String(issue.id)) && graph.hasNode(String(rel.id))) {
					if (!graph.hasEdge(String(issue.id), String(rel.id))) {
						graph.addEdge(String(issue.id), String(rel.id), {
							type: 'arrow',
							size: 2,
							color: '#666666'
						});
					}
				}
			}
		}
		
		if (graph.order > 0) {
			persistedLayout.load('global-graph').then((cached) => {
				if (cached && Object.keys(cached).length > 0) {
					graph.forEachNode((node) => {
						if (cached[node]) {
							graph.setNodeAttribute(node, 'x', cached[node].x);
							graph.setNodeAttribute(node, 'y', cached[node].y);
						}
					});
				} else {
					circular.assign(graph, { scale: 300 });
				}
				
				if (fa2) {
					fa2.kill();
				}
				
				const settings = forceAtlas2.inferSettings(graph);
				settings.gravity = 1;
				settings.scalingRatio = 10;
				
				fa2 = new FA2LayoutSupervisor(graph, { settings });
				if (isSimulating) {
					fa2.start();
				}
			});
		}
	}

	onMount(() => {
		if (!container) return;
		
		const graph = new Graph({ type: 'directed' });
		
		sigma = new Sigma(graph, container, {
			renderEdgeLabels: false,
			defaultEdgeType: 'arrow',
			labelDensity: 0.07,
			labelGridCellSize: 60,
			labelRenderedSizeThreshold: 12,
			minCameraRatio: 0.1,
			maxCameraRatio: 4,
		});
		
		buildGraph();
		
		// Click to open editor
		sigma.on('clickNode', ({ node }) => {
			editor.open(Number(node));
		});

		// Drag logic
		let draggedNode: string | null = null;
		
		sigma.on('downNode', (e) => {
			isSimulating = false;
			if (fa2) fa2.stop();
			draggedNode = e.node;
			sigma?.getGraph().setNodeAttribute(draggedNode, 'highlighted', true);
		});
		
		sigma.getMouseCaptor().on('mousemovebody', (e) => {
			if (!draggedNode || !sigma) return;
			const pos = sigma.viewportToGraph(e);
			sigma.getGraph().setNodeAttribute(draggedNode, 'x', pos.x);
			sigma.getGraph().setNodeAttribute(draggedNode, 'y', pos.y);
			e.preventSigmaDefault();
			e.original.preventDefault();
			e.original.stopPropagation();
		});
		
		sigma.getMouseCaptor().on('mouseup', () => {
			if (draggedNode && sigma) {
				sigma.getGraph().removeNodeAttribute(draggedNode, 'highlighted');
				draggedNode = null;
			}
		});
		
		let saveHandle: number;
		const scheduleSave = () => {
			clearTimeout(saveHandle);
			saveHandle = window.setTimeout(() => {
				if (!sigma) return;
				const positions: Record<string, {x: number, y: number}> = {};
				sigma.getGraph().forEachNode((node, attrs) => {
					positions[node] = { x: attrs.x, y: attrs.y };
				});
				persistedLayout.save('global-graph', positions);
			}, 2000);
		};
		sigma.on('afterRender', scheduleSave);

		return () => {
			clearTimeout(saveHandle);
			if (fa2) fa2.kill();
			if (sigma) sigma.kill();
		};
	});

	function zoomIn() { 
		if (!sigma) return;
		const c = sigma.getCamera();
		c.animatedZoom({ factor: 1.5, duration: 300 });
	}
	
	function zoomOut() { 
		if (!sigma) return;
		const c = sigma.getCamera();
		c.animatedUnzoom({ factor: 1.5, duration: 300 });
	}
	
	function fitView() { 
		if (!sigma) return;
		sigma.getCamera().animatedReset({ duration: 300 });
	}
	
	function toggleSimulation() {
		isSimulating = !isSimulating;
		if (isSimulating) {
			fa2?.start();
		} else {
			fa2?.stop();
		}
	}
</script>

<div class="relative w-full h-full bg-surface overflow-hidden" bind:this={container}>
	<!-- Controls -->
	<div class="absolute bottom-6 right-6 flex flex-col gap-2 bg-background/80 backdrop-blur border border-border p-1.5 rounded-lg shadow-sm z-10">
		<IconButton label={isSimulating ? "Pausar Física" : "Reanudar Física"} onclick={toggleSimulation}>
			{#if isSimulating}
				<Pause size={18} class="text-primary" />
			{:else}
				<Play size={18} class="text-muted-foreground" />
			{/if}
		</IconButton>
		<div class="h-[1px] w-full bg-border/50 my-1"></div>
		<IconButton label="Acercar" onclick={zoomIn}>
			<ZoomIn size={18} class="text-muted-foreground" />
		</IconButton>
		<IconButton label="Alejar" onclick={zoomOut}>
			<ZoomOut size={18} class="text-muted-foreground" />
		</IconButton>
		<IconButton label="Centrar Vista" onclick={fitView}>
			<Maximize size={18} class="text-muted-foreground" />
		</IconButton>
	</div>
</div>

<style>
	:global(.sigma-mouse) {
		cursor: grab;
	}
	:global(.sigma-mouse:active) {
		cursor: grabbing;
	}
</style>
