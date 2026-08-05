<script lang="ts">
	import type { CollabPresenceStore } from '$lib/collab/awareness-store.svelte';
	import { t } from '$lib/ui/strings';
	import Tooltip from '$lib/ui/Tooltip.svelte';

	type Props = {
		presence: CollabPresenceStore;
	};

	let { presence }: Props = $props();

	function getInitials(name: string): string {
		if (!name) return '?';
		return name
			.split(/\s+/)
			.map((word) => word.charAt(0))
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

{#if presence.peerCount > 0}
	<div
		class="flex items-center gap-1.5 border-b border-border bg-surface px-6 py-2"
		aria-label={t('collab.presenceAria')}
	>
		{#each presence.peers as peer, i (peer.clientId)}
			<Tooltip text={i === 0 ? `${peer.name} (${t('collab.you')})` : peer.name} position="bottom">
				<div
					class="flex h-7 w-7 cursor-default items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-background transition-transform hover:-translate-y-0.5"
					style="background-color: {peer.color}; z-index: {presence.peers.length - i};"
				>
					{getInitials(peer.name)}
				</div>
			</Tooltip>
		{/each}
	</div>
{/if}
