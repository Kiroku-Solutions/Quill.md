import { openDB } from 'idb';

const DB_NAME = 'quill_graph_cache';
const STORE_NAME = 'positions';

type PersistedLayout = {
	version: number;
	key: string;
	savedAt: string;
	positions: Record<string, { x: number; y: number }>;
};

async function getDB() {
	return openDB(DB_NAME, 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'key' });
			}
		},
	});
}

export const persistedLayout = {
	async save(key: string, positions: Record<string, { x: number; y: number }>) {
		try {
			const db = await getDB();
			const data: PersistedLayout = {
				version: 1,
				key,
				savedAt: new Date().toISOString(),
				positions
			};
			await db.put(STORE_NAME, data);
		} catch (e) {
			console.warn('Failed to save graph layout to IndexedDB', e);
		}
	},

	async load(key: string): Promise<Record<string, { x: number; y: number }> | null> {
		try {
			const db = await getDB();
			const data = await db.get(STORE_NAME, key) as PersistedLayout | undefined;
			return data ? data.positions : null;
		} catch (e) {
			console.warn('Failed to load graph layout from IndexedDB', e);
			return null;
		}
	}
};
