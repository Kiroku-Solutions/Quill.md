import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { createRoom } from './room';
import type { CollabConfig } from './types';
import { sha256Hex } from '$lib/services/integrity';

// Mock dependencies
vi.mock('@hocuspocus/provider', () => ({
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	HocuspocusProvider: vi.fn().mockImplementation(function (this: any, config: any) {
		this.name = config.name;
		this.url = config.url;
		this.token = config.token;
		this.isSynced = true;
		this.awareness = {
			clientID: 12345,
			setLocalStateField: vi.fn(),
			destroy: vi.fn()
		};
		this.on = vi.fn((event, cb) => {
			if (event === 'synced') {
				setTimeout(cb, 10);
			}
		});
		this.off = vi.fn();
		this.destroy = vi.fn();
	})
}));

vi.mock('y-indexeddb', () => ({
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	IndexeddbPersistence: vi.fn().mockImplementation(function (this: any) {
		this.whenSynced = Promise.resolve();
		this.clearData = vi.fn();
		this.destroy = vi.fn();
	})
}));

vi.mock('$lib/services/integrity', () => ({
	sha256Hex: vi.fn().mockResolvedValue('mocked-hash-123')
}));

describe('room', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('createRoom', () => {
		it('should generate a deterministic room name and initialize providers', async () => {
			const ydoc = new Y.Doc();
			const config: CollabConfig = {
				enabled: true,
				serverUrl: 'wss://test.local',
				token: 'test-token',
				displayName: 'Test User'
			};

			const { provider, cleanup } = await createRoom(ydoc, 'room-seed', config);

			expect(sha256Hex).toHaveBeenCalledWith('room-seed');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((provider as any).url).toBe('wss://test.local');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((provider as any).token).toBe('test-token');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((provider as any).name).toBe('mocked-hash-123');

			expect(provider.awareness?.setLocalStateField).toHaveBeenCalledWith(
				'user',
				expect.objectContaining({
					name: 'Test User',
					cursor: null
				})
			);

			cleanup(false);
			expect(provider.destroy).toHaveBeenCalled();
			expect(provider.awareness?.destroy).toHaveBeenCalled();
		});

		it('should handle anonymous users if displayName is not provided', async () => {
			const ydoc = new Y.Doc();
			const config: CollabConfig = {
				enabled: true,
				serverUrl: 'wss://test.local'
			};

			const { provider, cleanup } = await createRoom(ydoc, 'room-seed', config);

			expect(provider.awareness?.setLocalStateField).toHaveBeenCalledWith(
				'user',
				expect.objectContaining({
					name: 'Anonymous'
				})
			);

			cleanup();
		});
	});
});
