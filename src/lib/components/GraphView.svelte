<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount, untrack } from 'svelte';
	const { issues, editor, templates, filter, theme } = getStores();
	
	let container: HTMLDivElement | undefined = $state();
	let graph: any;
	let is3D = $state(true);

	function buildGraphData() {
		let nodes: any[] = [];
		let links: any[] = [];

		const filteredIssues = Array.from(issues.byId.values()).filter((li) => {
				const f = filter.filter;
				if (f.status && li.issue.status !== f.status) return false;
				if (f.type && li.issue.issueType !== f.type) return false;
				if (f.q) {
					const needle = f.q.toLowerCase();
					if (
						!li.issue.title.toLowerCase().includes(needle) &&
						!li.issue.sections.some((s) => s.markdown.toLowerCase().includes(needle))
					) {
						return false;
					}
				}
				return true;
			});

			const validNodeIds = new Set(filteredIssues.map(li => String(li.issue.id)));
			const groupBy = filter.filter.groupBy ?? 'none';
			
			let groupNodes: import('$lib/types').LoadedIssue[] = [];
			if (groupBy === 'epic') {
				groupNodes = Array.from(issues.byId.values()).filter(li => li.issue.issueType === 'epic');
			} else if (groupBy === 'sprint') {
				groupNodes = Array.from(issues.byId.values()).filter(li => li.issue.issueType === 'sprint');
			}

			for (const li of filteredIssues) {
				const issue = li.issue;
				const tmpl = templates.byType.get(issue.issueType);
				
				let color: string | undefined = tmpl?.color || '#888888';
				let groupId: string | undefined = undefined;
				
				if (groupBy !== 'none') {
					if (issue.issueType === groupBy) {
						groupId = String(issue.id);
						color = undefined; // Auto-color by group
					} else {
						const relatedGroup = groupNodes.find(g => 
							issue.relations.some(r => r.id === g.issue.id) || 
							g.issue.relations.some(r => r.id === issue.id)
						);
						if (relatedGroup) {
							groupId = String(relatedGroup.issue.id);
							color = undefined; // Auto-color by group
						} else {
							groupId = 'unassigned';
							color = '#3f3f46'; // Dim for unassigned
						}
					}
				}

				nodes.push({
					id: String(issue.id),
					name: issue.title,
					color,
					groupId
				});
				
				for (const rel of issue.relations) {
					const targetId = String(rel.id);
					if (validNodeIds.has(targetId)) {
						links.push({ source: String(issue.id), target: targetId, name: rel.type });
					}
				}
		}

		// Calculate sizes based on connection degree
		const degrees = new Map<string, number>();
		for (const link of links) {
			degrees.set(link.source, (degrees.get(link.source) || 0) + 1);
			degrees.set(link.target, (degrees.get(link.target) || 0) + 1);
		}

		for (const node of nodes) {
			const deg = degrees.get(node.id) || 0;
			// Base volume is 3. Each connection adds 1.5 to volume.
			// The library calculates radius = cbrt(val), so volume grows linearly with connections.
			node.val = 3 + (deg * 1.5);
		}

		return { nodes, links };
	}

	$effect(() => {
		void issues.issues;
		void filter.filter;
		
		if (graph) {
			graph.graphData(buildGraphData());
		}
	});
	
	// Effect to update link colors dynamically when the theme changes
	$effect(() => {
		if (graph) {
			const linkColor = theme.theme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)';
			graph.linkColor(() => linkColor);
		}
	});

	$effect(() => {
		if (!container) return;
		
		const currentIs3D = is3D;
		let currentGraph: any = null;
		let mounted = true;
		
		untrack(() => {
			if (graph && graph._destructor) {
				graph._destructor();
				graph = null;
			}
			if (container) {
				container.innerHTML = '';
			}
		});

		const initGraph = async () => {
			const data = untrack(() => buildGraphData());
			
			// Initial theme check
			const linkColorStr = theme.theme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)';
			
			if (currentIs3D) {
				const module = await import('3d-force-graph');
				const ForceGraph3D = module.default;
				if (!mounted) return;
				
				currentGraph = (ForceGraph3D as any)()(container)
					.nodeLabel('name')
					.nodeColor((n: any) => n.color || undefined)
					.nodeAutoColorBy('groupId')
					.nodeVal('val')
					.linkColor(() => linkColorStr)
					.linkDirectionalArrowLength(3.5)
					.linkDirectionalArrowRelPos(1)
					.backgroundColor('#00000000')
					.onNodeClick((node: any) => {
						if (!node.id.startsWith('debug-')) {
							editor.open(Number(node.id));
						}
					});
			} else {
				const module = await import('force-graph');
				const ForceGraph2D = module.default;
				if (!mounted) return;
				
				currentGraph = (ForceGraph2D as any)()(container)
					.nodeLabel('name')
					.nodeColor((n: any) => n.color || undefined)
					.nodeAutoColorBy('groupId')
					.nodeVal('val')
					.linkColor(() => linkColorStr)
					.linkDirectionalArrowLength(3.5)
					.linkDirectionalArrowRelPos(1)
					.onNodeClick((node: any) => {
						if (!node.id.startsWith('debug-')) {
							editor.open(Number(node.id));
						}
					});
			}
			
			currentGraph.graphData(data);
			
			if (container) {
				currentGraph.width(container.clientWidth);
				currentGraph.height(container.clientHeight);
			}
			
			untrack(() => {
				graph = currentGraph;
			});
		};
		
		initGraph();

		return () => {
			mounted = false;
			if (currentGraph && currentGraph._destructor) {
				currentGraph._destructor();
			}
		};
	});

	onMount(() => {
		let resizeObserver: ResizeObserver | null = null;
		
		// Use a small timeout to ensure container is bound
		setTimeout(() => {
			if (container) {
				resizeObserver = new ResizeObserver(() => {
					if (container && graph) {
						graph.width(container.clientWidth);
						graph.height(container.clientHeight);
					}
				});
				resizeObserver.observe(container as Element);
			}
		}, 0);
		
		return () => {
			if (resizeObserver) resizeObserver.disconnect();
		};
	});
</script>

<div class="relative w-full h-full bg-surface overflow-hidden">
	<div bind:this={container} class="w-full h-full"></div>
	

	<!-- 2D/3D Toggle -->
	<div class="absolute bottom-6 right-6 flex items-center gap-2 bg-background/80 backdrop-blur border border-border p-2 rounded-lg shadow-sm z-10">
		<span class="text-[11px] font-bold uppercase tracking-widest {is3D ? 'text-muted-foreground' : 'text-primary'}">2D</span>
		<button 
			type="button" 
			class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
			onclick={() => is3D = !is3D}
			aria-pressed={is3D}
		>
			<span class="sr-only">Toggle 3D mode</span>
			<span aria-hidden="true" class="pointer-events-none absolute h-full w-full rounded-md bg-transparent"></span>
			<span aria-hidden="true" class="pointer-events-none mx-auto h-4 w-9 rounded-full {is3D ? 'bg-primary' : 'bg-muted-foreground'} transition-colors duration-200 ease-in-out"></span>
			<span aria-hidden="true" class="pointer-events-none absolute left-0 inline-block h-5 w-5 transform rounded-full border border-border bg-background shadow ring-0 transition-transform duration-200 ease-in-out {is3D ? 'translate-x-4' : 'translate-x-0'}"></span>
		</button>
		<span class="text-[11px] font-bold uppercase tracking-widest {is3D ? 'text-primary' : 'text-muted-foreground'}">3D</span>
	</div>
</div>
