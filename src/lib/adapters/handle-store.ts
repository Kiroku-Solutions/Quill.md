/**
 * Persistence layer for FileSystemDirectoryHandle using IndexedDB.
 *
 * Stores up to 6 handles total: 1 active + 5 recent.
 *
 * Uses structured clone (native IndexedDB serialization) for the handle
 * field — NOT JSON.stringify. This is required because
 * FileSystemDirectoryHandle is not JSON-serializable.
 *
 * Uses native IndexedDB API (idb is not a dependency). IDB operations are
 * wrapped in promise helpers to avoid callback hell.
 *
 * ERS coverage: FR-4 ("folder handle MUST be persisted across sessions"),
 * ERS §5.5 ("Folder Handle Lifecycle").
 *
 * Hardening: handles are never logged. Only non-sensitive metadata (id, name)
 * may appear in error messages, never the handle object itself.
 */

import { isIndexedDBAvailable } from './feature-detect.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'nomad-md-handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

const ACTIVE_ID = 'active' as const;

type RecentId = `recent-${1 | 2 | 3 | 4 | 5}`;

const MAX_RECENT = 5 as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HandleRecord {
	/** 'active' | 'recent-1' | … | 'recent-5' */
	readonly id: typeof ACTIVE_ID | RecentId;
	/** The serialized FileSystemDirectoryHandle. */
	readonly handle: FileSystemDirectoryHandle;
	/** The folder name at time of storage (non-sensitive metadata). */
	readonly name: string;
	/** Unix timestamp (Date.now()) when this record was stored. */
	readonly addedAt: number;
}

export interface HandleStore {
	getActive(): Promise<HandleRecord | null>;
	setActive(handle: FileSystemDirectoryHandle): Promise<void>;
	clearActive(): Promise<void>;
	getRecent(): Promise<HandleRecord[]>;
	removeRecent(id: RecentId): Promise<void>;
	clearAll(): Promise<void>;
}

// ─── Internal helpers (native IndexedDB → Promise) ───────────────────────────

/**
 * Open (or create) the handles database.
 *
 * Schema version 1:
 *   - object store: `handles`, keyPath: `id`
 *
 * Future migrations are handled in the `upgrade` callback.
 */
function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (!isIndexedDBAvailable()) {
			reject(new Error('IndexedDB is not available in this environment'));
			return;
		}

		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.addEventListener('success', () => resolve(req.result));

		req.addEventListener('error', () => reject(req.error));

		req.addEventListener('upgradeneeded', (event) => {
			// TypeScript narrows `req` to IDBOpenDBRequest here
			const db = req.result;

			// Schema migration path: check what exists before creating
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
			// To add a future migration:
			// if (oldVersion < 2) { ... }
			void event;
		});
	});
}

/**
 * Read a single record from the handles store.
 * Returns null if no record exists for the given key.
 */
async function dbGet(db: IDBDatabase, key: string): Promise<HandleRecord | null> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const req = store.get(key);
		req.addEventListener('success', () => resolve(req.result ?? null));
		req.addEventListener('error', () => reject(req.error));
	});
}

/**
 * Read ALL records from the handles store.
 * Returns an empty array if the store is empty.
 */
async function dbGetAll(db: IDBDatabase): Promise<HandleRecord[]> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const req = store.getAll();
		req.addEventListener('success', () => resolve(req.result ?? []));
		req.addEventListener('error', () => reject(req.error));
	});
}

/**
 * Delete a single record from the handles store.
 */
async function dbDelete(db: IDBDatabase, key: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const req = store.delete(key);
		req.addEventListener('success', () => resolve());
		req.addEventListener('error', () => reject(req.error));
	});
}

/**
 * Clear all records from the handles store.
 */
async function dbClear(db: IDBDatabase): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const req = store.clear();
		req.addEventListener('success', () => resolve());
		req.addEventListener('error', () => reject(req.error));
	});
}

// ─── HandleStore implementation ─────────────────────────────────────────────

function buildHandleStore(): HandleStore {
	async function getActive(): Promise<HandleRecord | null> {
		const db = await openDb();
		try {
			return await dbGet(db, ACTIVE_ID);
		} finally {
			db.close();
		}
	}

	async function setActive(handle: FileSystemDirectoryHandle): Promise<void> {
		const db = await openDb();
		try {
			// Fetch current state (inside the same function, before opening write tx)
			const currentActive = await dbGet(db, ACTIVE_ID);
			const allRecords = await dbGetAll(db);

			// Build the new recent list (up to MAX_RECENT entries, newest first)
			// recent-1 is the most recently demoted active handle
			const existingRecent: HandleRecord[] = allRecords
				.filter((r) => r.id.startsWith('recent-'))
				.filter((r) => r.name !== handle.name) // deduplication: re-activating a folder removes it from recents
				.sort((a, b) => b.addedAt - a.addedAt)
				.slice(0, MAX_RECENT - 1); // leave room for the current active

			const now = Date.now();

			// Build the new recent entries:
			//   new recent-1 = previous active (if any, and different folder)
			//   new recent-2 … recent-N = previous recent-1 … recent-(N-1)
			const newRecent: HandleRecord[] = [];

			if (currentActive && currentActive.name !== handle.name) {
				newRecent.push({
					id: 'recent-1',
					handle: currentActive.handle,
					name: currentActive.name,
					addedAt: now
				});
			}

			for (let i = 0; i < existingRecent.length; i++) {
				newRecent.push({
					...existingRecent[i],
					id: `recent-${i + 2}` as RecentId
					// addedAt stays unchanged (preserve original timestamp)
				});
			}

			// Atomic write: use a single readwrite transaction
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction(STORE_NAME, 'readwrite');
				tx.addEventListener('complete', () => resolve());
				tx.addEventListener('error', () => reject(tx.error));
				tx.addEventListener('abort', () => reject(tx.error));

				const store = tx.objectStore(STORE_NAME);

				// Clear all existing records in this tx (no-op for non-existent keys)
				store.delete(ACTIVE_ID);
				for (const r of allRecords) {
					store.delete(r.id);
				}

				// Write new recent entries
				for (const r of newRecent) {
					store.put(r);
				}

				// Write new active
				store.put({
					id: ACTIVE_ID,
					handle,
					name: handle.name,
					addedAt: now
				});
			});
		} finally {
			db.close();
		}
	}

	async function clearActive(): Promise<void> {
		const db = await openDb();
		try {
			await dbDelete(db, ACTIVE_ID);
		} finally {
			db.close();
		}
	}

	async function getRecent(): Promise<HandleRecord[]> {
		const db = await openDb();
		try {
			const all = await dbGetAll(db);
			return all
				.filter((r) => r.id.startsWith('recent-'))
				.sort((a, b) => {
					// Sort descending by recent position (recent-1 first, recent-5 last)
					const aNum = Number(a.id.replace('recent-', ''));
					const bNum = Number(b.id.replace('recent-', ''));
					return aNum - bNum;
				});
		} finally {
			db.close();
		}
	}

	async function removeRecent(id: RecentId): Promise<void> {
		const db = await openDb();
		try {
			// Validate the id format before touching the DB
			const validPattern = /^recent-[1-5]$/;
			if (!validPattern.test(id)) {
				// Silently ignore invalid ids — fail-safe
				return;
			}
			await dbDelete(db, id);
		} finally {
			db.close();
		}
	}

	async function clearAll(): Promise<void> {
		const db = await openDb();
		try {
			await dbClear(db);
		} finally {
			db.close();
		}
	}

	return { getActive, setActive, clearActive, getRecent, removeRecent, clearAll };
}

/**
 * Singleton instance. The store is a plain object (no internal mutable state
 * beyond the IndexedDB database) so instantiation is cheap and memoisation
 * is optional — we memoize anyway to avoid repeated openDb() calls on startup.
 */
export const handleStore: HandleStore = buildHandleStore();
