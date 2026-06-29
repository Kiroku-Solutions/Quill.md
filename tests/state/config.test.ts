/**
 * Tests for the config store.
 *
 * Coverage targets:
 *  - load() reads `.nomad.md/config.json` and populates `config`.
 *  - load() with a missing config (fresh repo) leaves `config: null` and
 *    `status: 'ready'` (FR-11 / wizard path).
 *  - load() with a malformed JSON file surfaces the error in `error`
 *    and sets `status: 'error'`.
 *  - Supersede: a second load() aborts the first and wins.
 *  - load() with no adapter (provider returns null) stays 'idle' (no
 *    flash of error while the mode store is mid-transition).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfigStore } from '$lib/state';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';

const VALID_CONFIG = JSON.stringify({
	statuses: [{ id: 'open', name: 'Open', color: '#fff' }],
	default_status: 'open',
	labels: [{ id: 'security', name: 'Security', color: '#f00' }],
	users: [{ id: 'jane', name: 'Jane' }],
	kanban: { columns: ['open'] },
	gantt: { group_by: 'assignee', default_view: 'week' },
	remote: { cors_proxy: 'https://cors.example.com' }
});

describe('createConfigStore — happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
	});
	afterEach(() => {});

	it('returns the parsed config on first load', async () => {
		const store = createConfigStore(() => fs);
		expect(store.status).toBe('idle');
		await store.load();
		expect(store.status).toBe('ready');
		expect(store.config?.default_status).toBe('open');
		expect(store.config?.statuses).toHaveLength(1);
	});

	it('refresh() is an alias for load()', async () => {
		const store = createConfigStore(() => fs);
		await store.refresh();
		expect(store.status).toBe('ready');
		expect(store.config?.default_status).toBe('open');
	});
});

describe('createConfigStore — missing file', () => {
	it('returns config=null, status=ready (FR-11 wizard path)', async () => {
		const fs = new MemoryFsAdapter();
		const store = createConfigStore(() => fs);
		await store.load();
		expect(store.status).toBe('ready');
		expect(store.config).toBeNull();
		expect(store.error).toBeNull();
	});
});

describe('createConfigStore — malformed file', () => {
	it('surfaces the error and sets status=error', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', '{ not json');
		const store = createConfigStore(() => fs);
		await store.load();
		expect(store.status).toBe('error');
		expect(store.error).toBeInstanceOf(Error);
		expect(store.config).toBeNull();
	});
});

describe('createConfigStore — supersede', () => {
	it('a second load() supersedes the first; the first does not flip status', async () => {
		// Adapter 1: missing file (will resolve to ready:null quickly).
		// Adapter 2: valid config (the winner).
		// We call load() twice in quick succession and verify that the final
		// state reflects adapter 2.
		const fs1 = new MemoryFsAdapter();
		const fs2 = new MemoryFsAdapter();
		await fs2.writeTextFile('.nomad.md/config.json', VALID_CONFIG);

		let currentAdapter: MemoryFsAdapter = fs1;
		const store = createConfigStore(() => currentAdapter);

		const p1 = store.load();
		// Swap the adapter mid-flight to simulate a folder switch.
		currentAdapter = fs2;
		const p2 = store.load();

		await Promise.all([p1, p2]);
		expect(store.status).toBe('ready');
		expect(store.config?.default_status).toBe('open');
	});
});

describe('createConfigStore — no adapter', () => {
	it('stays idle when the provider returns null', async () => {
		const store = createConfigStore(() => null);
		await store.load();
		expect(store.status).toBe('idle');
		expect(store.config).toBeNull();
		expect(store.error).toBeNull();
	});
});
