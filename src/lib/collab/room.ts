import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
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
): Promise<{ provider: HocuspocusProvider; cleanup: (isDirty?: boolean) => void }> {
	// Room name is an opaque SHA-256 hash of the seed (e.g. providerId/owner/repo/branch/issueId)
	const roomName = await sha256Hex(roomSeed);

	const provider = new HocuspocusProvider({
		url: config.serverUrl,
		name: roomName,
		document: ydoc,
		token: config.token
	});

	const indexeddbProvider = new IndexeddbPersistence(`quill-md-collab-${roomName}`, ydoc);

	// Restore offline cross-tab sync functionality that was present in y-websocket
	// but is not natively supported by HocuspocusProvider.
	const bc = new BroadcastChannel(`quill-md-collab-${roomName}`);
	bc.onmessage = (event) => {
		console.log(`[collab] BroadcastChannel received ${event.data.byteLength} bytes`);
		Y.applyUpdate(ydoc, new Uint8Array(event.data), bc);
	};
	const onUpdate = (update: Uint8Array, origin: unknown) => {
		if (origin !== bc) {
			console.log(`[collab] BroadcastChannel sending ${update.byteLength} bytes`);
			bc.postMessage(update);
		}
	};
	ydoc.on('update', onUpdate);

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

	// Wait for the provider to complete its initial sync (or fail).
	// We use a 5-second timeout, but if you have extremely slow connections,
	// you could increase this. The provider itself will keep retrying in the
	// background, but we need a cutoff to decide when to unblock the UI.
	const start = Date.now();
	await indexeddbProvider.whenSynced;
	console.log(`[collab] IndexedDB synced in ${Date.now() - start}ms`);

	await waitForSync(provider, 5000);
	console.log(
		`[collab] Sync check completed in ${Date.now() - start}ms. isSynced=${provider.isSynced}`
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
		cleanup: (isDirty: boolean = false) => {
			if (provider.awareness) {
				provider.awareness.destroy();
			}
			provider.destroy();

			ydoc.off('update', onUpdate);
			bc.close();

			if (!isDirty) {
				indexeddbProvider.clearData();
			}
			indexeddbProvider.destroy();
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
