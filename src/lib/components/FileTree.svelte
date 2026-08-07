<script lang="ts">
	import type { Snippet } from 'svelte';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FileText from '@lucide/svelte/icons/file-text';

	export type TreeNode = {
		name: string;
		path: string;
		type: 'file' | 'folder';
		children?: TreeNode[];
	};

	let {
		paths,
		selected,
		onselect,
		nodeAction
	}: {
		paths: string[];
		selected: string | null;
		onselect: (path: string) => void;
		nodeAction?: Snippet<[TreeNode]>;
	} = $props();

	let tree = $derived(buildTree(paths));
	let expandedState = $state<Record<string, boolean>>({});

	function buildTree(paths: string[]): TreeNode[] {
		const root: TreeNode[] = [];
		for (const path of paths) {
			const parts = path.split('/');
			let currentLevel = root;
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const isFile = i === parts.length - 1;
				const currentPath = parts.slice(0, i + 1).join('/');

				let node = currentLevel.find((n) => n.name === part);
				if (!node) {
					node = {
						name: part,
						path: currentPath,
						type: isFile ? 'file' : 'folder',
						children: isFile ? undefined : []
					};
					currentLevel.push(node);
				}
				if (!isFile) {
					currentLevel = node.children!;
				}
			}
		}

		function sortTree(nodes: TreeNode[]) {
			nodes.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			for (const node of nodes) {
				if (node.children) sortTree(node.children);
			}
		}
		sortTree(root);
		return root;
	}

	function toggleFolder(path: string) {
		expandedState[path] = !expandedState[path];
	}
</script>

{#snippet renderNode(node: TreeNode, depth: number)}
	<div
		class="group hover:bg-surface-dark flex items-center justify-between rounded-md pr-1.5 transition-colors"
	>
		{#if node.type === 'folder'}
			{@const isExpanded = expandedState[node.path]}
			<button
				class="flex flex-1 items-center gap-2 py-1.5 text-sm text-foreground"
				style="padding-left: {depth * 1 + 0.5}rem;"
				onclick={() => toggleFolder(node.path)}
			>
				{#if isExpanded}
					<FolderOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
				{:else}
					<Folder class="h-4 w-4 shrink-0 text-muted-foreground" />
				{/if}
				<span class="truncate font-medium">{node.name}</span>
			</button>
			{#if nodeAction}
				<div class="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
					{@render nodeAction(node)}
				</div>
			{/if}
		{:else}
			<button
				class="flex flex-1 items-center gap-2 py-1.5 text-sm {selected === node.path
					? 'rounded-md bg-primary/10 font-bold text-primary'
					: 'text-foreground'}"
				style="padding-left: {depth * 1 + 0.5}rem;"
				onclick={() => onselect(node.path)}
			>
				<FileText class="h-4 w-4 shrink-0" />
				<span class="truncate">{node.name}</span>
			</button>
			{#if nodeAction}
				<div class="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
					{@render nodeAction(node)}
				</div>
			{/if}
		{/if}
	</div>
	{#if node.type === 'folder' && expandedState[node.path] && node.children}
		{#each node.children as child (child.path)}
			{@render renderNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

<div class="flex flex-col">
	{#each tree as node (node.path)}
		{@render renderNode(node, 0)}
	{/each}
</div>
