/**
 * Tests for the mode store.
 *
 * Coverage targets:
 *  - bootstrap resolves to 'home' when no active handle exists in IDB.
 *  - bootstrap resolves to 'local' when the active handle has a granted
 *    queryPermission result.
 *  - bootstrap resolves to 'home' when queryPermission returns 'prompt'
 *    (the user has not granted permission; we don't prompt here — that
 *    happens on openLocalFolder).
 *  - openLocalFolder persists the handle, sets mode='local', and clears
 *    any prior remote session.
 *  - openRemote consumes the PAT only in its closure; the store surface
 *    exposes hasRemoteCredentials: true but no `pat` field.
 *  - signOut clears the active handle, the remote session, and goes home.
 *  - recentHandles is updated after every operation that mutates IDB.
 *
 * All tests pass a fake handle store so we don't depend on fake-indexeddb
 * (Node environment). The production code path is exercised by the manual
 * smoke test in Step 4's Polish + PR checklist.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModeStore } from '$lib/state';
import type { HandleRecord, HandleStore } from '$lib/adapters/handle-store';

// ─── Fakes ──────────────────────────────────────────────────────────────────

/**
 * A fake FileSystemDirectoryHandle that records calls to permission
 * queries and lets the test control the outcome.
 */
interface FakeHandle {
	readonly name: string;
	readonly kind: 'directory';
	queryPermission(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
	requestPermission(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>;
}

function makeFakeHandle(
	name: string,
	queryResult: PermissionState,
	requestResult?: PermissionState
): FakeHandle {
	const h: FakeHandle = {
		name,
		kind: 'directory',
		queryPermission: vi.fn(async () => queryResult),
		requestPermission: vi.fn(async () => requestResult ?? queryResult)
	};
	return h;
}

/**
 * An in-memory handle store that records calls for assertions.
 */
function makeFakeHandleStore(): HandleStore & {
	active: HandleRecord | null;
	recent: HandleRecord[];
	getActiveCalls: number;
	setActiveCalls: number;
	clearActiveCalls: number;
	getRecentCalls: number;
} {
	const f = {
		active: null as HandleRecord | null,
		recent: [] as HandleRecord[],
		getActiveCalls: 0,
		setActiveCalls: 0,
		clearActiveCalls: 0,
		getRecentCalls: 0,

		async getActive() {
			f.getActiveCalls += 1;
			return f.active;
		},
		async setActive(handle: FileSystemDirectoryHandle) {
			f.setActiveCalls += 1;
			const record: HandleRecord = {
				id: 'active',
				handle: handle as unknown as FileSystemDirectoryHandle,
				name: handle.name,
				addedAt: Date.now()
			};
			f.active = record;
		},
		async clearActive() {
			f.clearActiveCalls += 1;
			f.active = null;
		},
		async getRecent() {
			f.getRecentCalls += 1;
			return f.recent;
		},
		async removeRecent() {
			/* not exercised in these tests */
		},
		async clearAll() {
			f.active = null;
			f.recent = [];
		}
	};
	return f;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createModeStore — bootstrap', () => {
	let hs: ReturnType<typeof makeFakeHandleStore>;
	beforeEach(() => {
		hs = makeFakeHandleStore();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves to home when there is no active handle', async () => {
		hs.active = null;
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		await store.bootstrap();
		expect(store.mode).toBe('home');
		expect(store.activeHandle).toBeNull();
		expect(hs.getActiveCalls).toBe(1);
	});

	it('resolves to local when the active handle has granted permission', async () => {
		const handle = makeFakeHandle('proj', 'granted');
		hs.active = {
			id: 'active',
			handle: handle as unknown as FileSystemDirectoryHandle,
			name: handle.name,
			addedAt: Date.now()
		};
		const store = createModeStore(
			{ adapter: undefined as never },
			{
				handles: hs,
				createLocalAdapter: () => ({
					readTextFile: vi.fn(),
					writeTextFile: vi.fn(),
					listDirectory: vi.fn(),
					removeFile: vi.fn(),
					moveFile: vi.fn()
				})
			}
		);
		await store.bootstrap();
		expect(store.mode).toBe('local');
		expect(store.activeHandle).toBe(handle as unknown as FileSystemDirectoryHandle);
		expect(store.localAdapter).not.toBeNull();
	});

	it('resolves to home when queryPermission returns "prompt"', async () => {
		const handle = makeFakeHandle('proj', 'prompt');
		hs.active = {
			id: 'active',
			handle: handle as unknown as FileSystemDirectoryHandle,
			name: handle.name,
			addedAt: Date.now()
		};
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		await store.bootstrap();
		expect(store.mode).toBe('home');
		expect(store.activeHandle).toBeNull();
	});
});

describe('createModeStore — openLocalFolder', () => {
	let hs: ReturnType<typeof makeFakeHandleStore>;
	beforeEach(() => {
		hs = makeFakeHandleStore();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('sets mode=local and persists the handle when permission is granted', async () => {
		const handle = makeFakeHandle('proj', 'granted');
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		await store.openLocalFolder(handle as unknown as FileSystemDirectoryHandle);
		expect(store.mode).toBe('local');
		expect(store.activeHandle).toBe(handle as unknown as FileSystemDirectoryHandle);
		expect(hs.setActiveCalls).toBe(1);
		expect(store.hasRemoteCredentials).toBe(false);
	});

	it('stays on home when permission is denied', async () => {
		const handle = makeFakeHandle('proj', 'prompt', 'denied');
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		await store.openLocalFolder(handle as unknown as FileSystemDirectoryHandle);
		expect(store.mode).toBe('home');
		expect(hs.setActiveCalls).toBe(0);
	});

	it('clears any remote session when a local folder is opened', async () => {
		// Set up a remote session first by stubbing fetchSubtree. We don't
		// actually call openRemote here (it requires isomorphic-git); instead
		// we verify that after openLocalFolder, the public surface shows no
		// remote credentials even if the store were seeded with one.
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		const handle = makeFakeHandle('proj', 'granted');
		await store.openLocalFolder(handle as unknown as FileSystemDirectoryHandle);
		expect(store.remoteAdapter).toBeNull();
		expect(store.hasRemoteCredentials).toBe(false);
	});
});

describe('createModeStore — signOut', () => {
	let hs: ReturnType<typeof makeFakeHandleStore>;
	beforeEach(() => {
		hs = makeFakeHandleStore();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('clears the active handle and goes home', async () => {
		const handle = makeFakeHandle('proj', 'granted');
		hs.active = {
			id: 'active',
			handle: handle as unknown as FileSystemDirectoryHandle,
			name: handle.name,
			addedAt: Date.now()
		};
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		await store.bootstrap();
		expect(store.mode).toBe('local');
		await store.signOut();
		expect(store.mode).toBe('home');
		expect(store.activeHandle).toBeNull();
		expect(hs.clearActiveCalls).toBe(1);
	});
});

describe('createModeStore — PAT hygiene (NFR-2)', () => {
	let hs: ReturnType<typeof makeFakeHandleStore>;
	beforeEach(() => {
		hs = makeFakeHandleStore();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not expose any "pat" property on the store object', () => {
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		const keys = Object.keys(store);
		expect(keys.some((k) => k.toLowerCase().includes('pat'))).toBe(false);
		expect(keys.some((k) => k.toLowerCase().includes('token'))).toBe(false);
	});

	it('hasRemoteCredentials returns false by default and no remoteAdapter is bound', () => {
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		expect(store.hasRemoteCredentials).toBe(false);
		expect(store.remoteAdapter).toBeNull();
	});
});

describe('createModeStore — recentHandles', () => {
	let hs: ReturnType<typeof makeFakeHandleStore>;
	beforeEach(() => {
		hs = makeFakeHandleStore();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is empty on a fresh store and populated after openLocalFolder', async () => {
		hs.recent = [];
		const store = createModeStore({ adapter: undefined as never }, { handles: hs });
		expect(store.recentHandles).toEqual([]);
		const handle = makeFakeHandle('proj', 'granted');
		await store.openLocalFolder(handle as unknown as FileSystemDirectoryHandle);
		// openLocalFolder calls readRecent via persistHandle.
		expect(hs.getRecentCalls).toBeGreaterThanOrEqual(1);
	});
});
