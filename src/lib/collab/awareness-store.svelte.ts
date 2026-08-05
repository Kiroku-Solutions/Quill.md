import type { Awareness } from 'y-protocols/awareness';

export interface CollabPeer {
	clientId: number;
	name: string;
	color: string;
	cursor?: unknown;
}

export interface CollabPresenceStore {
	readonly peers: CollabPeer[];
	readonly peerCount: number;
	readonly destroy: () => void;
}

/**
 * Creates a reactive wrapper around a Yjs Awareness instance.
 */
export function createCollabPresenceStore(awareness: Awareness): CollabPresenceStore {
	// Local state of peers. We use $state.raw to avoid deep reactivity overhead on Yjs internals.
	let peers = $state.raw<CollabPeer[]>([]);

	function updatePeers() {
		const states = awareness.getStates();
		const localId = awareness.clientID;
		const nextPeers: CollabPeer[] = [];

		// Ensure the local user is always first in the list
		const localState = states.get(localId);
		if (localState && localState.user) {
			nextPeers.push({
				clientId: localId,
				name: localState.user.name,
				color: localState.user.color,
				cursor: localState.cursor
			});
		}

		// Add remote users
		for (const [clientId, state] of states.entries()) {
			if (clientId !== localId && state.user) {
				nextPeers.push({
					clientId,
					name: state.user.name,
					color: state.user.color,
					cursor: state.cursor
				});
			}
		}

		peers = nextPeers;
	}

	// Initialize
	updatePeers();

	// Subscribe to awareness changes
	const onChange = () => {
		updatePeers();
	};

	awareness.on('change', onChange);
	awareness.on('update', onChange);

	return {
		get peers() {
			return peers;
		},
		get peerCount() {
			// peerCount includes only remote peers (so we subtract local)
			return Math.max(0, peers.length - 1);
		},
		destroy() {
			awareness.off('change', onChange);
			awareness.off('update', onChange);
		}
	};
}
