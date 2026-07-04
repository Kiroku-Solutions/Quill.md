<script lang="ts">
	import { getStores } from '$lib/state';
	import { onMount, untrack } from 'svelte';
	const { issues, editor, templates, filter, theme } = getStores();

	let container: HTMLDivElement | undefined = $state();
	let graph: any;

	function buildGraphData() {
		let nodes: any[] = [];
		let links: any[] = [];

		const allIssues = Array.from(issues.byId.values());
		const matchedIssues = allIssues.filter((li) => {
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

		const filteredSet = new Set(matchedIssues);
		const f = filter.filter;
		const hasActiveFilter = !!(f.status || f.type || f.q);

		if (hasActiveFilter) {
			for (const li of matchedIssues) {
				for (const rel of li.issue.relations) {
					const target = issues.byId.get(Number(rel.id));
					if (target) filteredSet.add(target);
				}
			}
			for (const li of allIssues) {
				if (
					li.issue.relations.some((r) => matchedIssues.some((m) => m.issue.id === Number(r.id)))
				) {
					filteredSet.add(li);
				}
			}
		}

		const filteredIssues = Array.from(filteredSet);

		const validNodeIds = new Set(filteredIssues.map((li) => String(li.issue.id)));
		const groupBy = filter.filter.groupBy ?? 'none';

		let groupNodes: import('$lib/types').LoadedIssue[] = [];
		if (groupBy === 'epic') {
			groupNodes = Array.from(issues.byId.values()).filter((li) => li.issue.issueType === 'epic');
		} else if (groupBy === 'sprint') {
			groupNodes = Array.from(issues.byId.values()).filter((li) => li.issue.issueType === 'sprint');
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
					const relatedGroup = groupNodes.find(
						(g) =>
							issue.relations.some((r) => r.id === g.issue.id) ||
							g.issue.relations.some((r) => r.id === issue.id)
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
			node.val = 3 + deg * 1.5;
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
			const linkColorStr =
				theme.theme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)';

			const module = await import('force-graph');
			const ForceGraph2D = module.default;
			if (!mounted) return;

			currentGraph = (ForceGraph2D as any)()(container)
				.dagMode('td') // Top-Down DAG mode
				.dagLevelDistance(90)
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

			// Spread out nodes to prevent the tight vertical string
			if (currentGraph.d3Force('charge')) {
				currentGraph.d3Force('charge').strength(-400).distanceMax(400);
			}
			if (currentGraph.d3Force('link')) {
				currentGraph.d3Force('link').distance(60);
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
	<div bind:this={container} class="absolute inset-0"></div>
</div>
