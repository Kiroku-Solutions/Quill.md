import { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';
import type { CollabConfig } from './types';
import { sha256Hex } from '$lib/services/integrity';
import { deterministicColor } from './colors';

/**
 * Connect a Y.Doc to a Hocuspocus room. Returns a promise that resolves
 * once the initial server sync is complete (or fails after a timeout).
 *
 * The caller should check `provider.isSynced` after resolution to decide
 * whether to seed the doc with local content.
 */
export async function createRoom(
	ydoc: Y.Doc,
	roomSeed: string,
	config: CollabConfig
): Promise<{ provider: HocuspocusProvider; cleanup: () => void }> {
	// Room name is an opaque SHA-256 hash of the seed (e.g. providerId/owner/repo/branch/issueId)
	const roomName = await sha256Hex(roomSeed);

	const provider = new HocuspocusProvider({
		url: config.serverUrl,
		name: roomName,
		document: ydoc,
		token: config.token
	});

	provider.on('status', ({ status }: { status: string }) => {
		console.log(`[collab] Status changed to: ${status}`);
	});

	provider.on('connect', () => {
		console.log(`[collab] Connected!`);
	});

	provider.on('synced', () => {
		console.log(`[collab] Synced!`);
	});

	provider.on('disconnect', () => {
		console.log(`[collab] Disconnected.`);
	});

	provider.on('destroy', () => {
		console.log(`[collab] Provider destroyed.`);
	});

	// Wait for the initial sync handshake with the server so we know
	// whether the server already has content for this room.
	console.log(`[collab] Connecting to ${config.serverUrl} for room ${roomName}...`);
	const startTime = Date.now();
	await waitForSync(provider, 5000);
	console.log(
		`[collab] Sync check completed in ${Date.now() - startTime}ms. isSynced=${provider.isSynced}`
	);

	if (provider.awareness) {
		provider.awareness.setLocalStateField('user', {
			name: config.displayName ?? 'Anonymous',
			color: deterministicColor(provider.awareness.clientID),
			cursor: null // managed automatically by y-codemirror.next
		});
	}

	return {
		provider,
		cleanup: () => {
			if (provider.awareness) {
				provider.awareness.destroy();
			}
			provider.destroy();
		}
	};
}

/**
 * Returns a promise that resolves when the provider completes its initial
 * sync with the server, or after `timeoutMs` (whichever comes first).
 */
function waitForSync(provider: HocuspocusProvider, timeoutMs: number): Promise<void> {
	if (provider.isSynced) return Promise.resolve();

	return new Promise<void>((resolve) => {
		let resolved = false;

		const done = () => {
			if (resolved) return;
			resolved = true;
			provider.off('synced', onSynced);
			clearTimeout(timer);
			resolve();
		};

		const onSynced = () => done();
		provider.on('synced', onSynced);

		const timer = setTimeout(() => {
			// If the server is unreachable, resolve anyway so the editor
			// still works in offline/single-player mode.
			done();
		}, timeoutMs);
	});
}
