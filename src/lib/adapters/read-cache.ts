/**
 * IndexedDB-backed read cache for remote Mode.
 *
 * The cache holds the result of the most recent `fetchAll` / `fetchSince`
 * so a re-open of the same `(providerId, owner/repo, branch, sha)` does
 * not require another network round-trip on the cold path. The cache
 * stores raw `RemoteFile[]` keyed by `cacheKey` (see `makeCacheKey`).
 *
 * The cache is intentionally NOT a snapshot of the `LoadedIssue[]` shape;
 * storing files separately keeps the cache provider-agnostic and lets the
 * service layer own issue parsing. The `CommitQueue` keeps its own
 * pending-writes map keyed by file path.
 *
 * Storage backend: `idb` (already a dependency). One object store per
 * cache entry. Keys are derived from `(providerId, owner, repo, branch)`
 * to match the browser's `idb.openDB` name convention.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'quill-md-remote-cache';

export interface CachedSnapshot {
	readonly cacheKey: string;
	readonly providerId: string;
	readonly owner: string;
	readonly repo: string;
	readonly branch: string;
	readonly commitSha: string;
	readonly fetchedAt: number;
	readonly files: ReadonlyArray<{
		readonly path: string;
		readonly content: string;
		readonly sha: string;
	}>;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
	if (typeof indexedDB === 'undefined') {
		return Promise.reject(new Error('IndexedDB is not available'));
	}
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('snapshots')) {
					db.createObjectStore('snapshots', { keyPath: 'cacheKey' });
				}
			}
		});
	}
	return dbPromise;
}

/** Store a snapshot keyed by `cacheKey`. Overwrites any prior snapshot. */
export async function putSnapshot(snapshot: CachedSnapshot): Promise<void> {
	const db = await getDb();
	await db.put('snapshots', snapshot);
}

/** Retrieve the snapshot for `cacheKey`, or null if absent. */
export async function getSnapshot(cacheKey: string): Promise<CachedSnapshot | null> {
	const db = await getDb();
	const result = (await db.get('snapshots', cacheKey)) as CachedSnapshot | undefined;
	return result ?? null;
}

/** Remove the snapshot for `cacheKey`. No-op if absent. */
export async function deleteSnapshot(cacheKey: string): Promise<void> {
	const db = await getDb();
	await db.delete('snapshots', cacheKey);
}

/** Drop every snapshot. Used by Settings → "Clear local snapshot". */
export async function clearAllSnapshots(): Promise<void> {
	const db = await getDb();
	await db.clear('snapshots');
}

/** Test seam — wipe the cached promise so the next call re-opens the DB. */
export function _resetForTests(): void {
	dbPromise = null;
}
