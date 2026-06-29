/**
 * Tests for `config-loader.ts`.
 *
 * The config loader is the entry-point for `.nomad.md/config.json`.
 * Coverage targets:
 *  - Happy path: a well-formed config returns the parsed object.
 *  - Missing file: an actionable error points at the path.
 *  - Malformed JSON: the underlying parse error is surfaced.
 *  - Each required field is validated individually.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '$lib/services/config-loader';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';

const VALID_CONFIG = JSON.stringify({
	statuses: [
		{ id: 'open', name: 'Open', color: '#fff' },
		{ id: 'in_progress', name: 'In Progress', color: '#0f0' }
	],
	default_status: 'open',
	labels: [{ id: 'security', name: 'Security', color: '#f00' }],
	users: [{ id: 'jane', name: 'Jane' }],
	kanban: { columns: ['open', 'in_progress'] },
	gantt: { group_by: 'assignee', default_view: 'week' },
	remote: { cors_proxy: 'https://cors.example.com' }
});

describe('loadConfig — happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(async () => {
		fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', VALID_CONFIG);
	});

	it('returns the parsed object', async () => {
		const config = await loadConfig(fs);
		expect(config.default_status).toBe('open');
		expect(config.statuses).toHaveLength(2);
		expect(config.labels).toHaveLength(1);
		expect(config.users).toHaveLength(1);
		expect(config.kanban.columns).toEqual(['open', 'in_progress']);
		expect(config.gantt.group_by).toBe('assignee');
		expect(config.remote.cors_proxy).toBe('https://cors.example.com');
	});
});

describe('loadConfig — error paths', () => {
	it('throws with the path when the file is missing', async () => {
		const fs = new MemoryFsAdapter();
		await expect(loadConfig(fs)).rejects.toThrow(/config\.json/);
	});

	it('throws on malformed JSON', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', '{ not json');
		await expect(loadConfig(fs)).rejects.toThrow(/Malformed JSON/);
	});

	it('throws when the top-level value is not an object', async () => {
		const fs = new MemoryFsAdapter();
		await fs.writeTextFile('.nomad.md/config.json', '"a string"');
		await expect(loadConfig(fs)).rejects.toThrow(/must be a JSON object/);
	});

	it('throws when statuses is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['statuses'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/statuses/);
	});

	it('throws when default_status is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['default_status'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/default_status/);
	});

	it('throws when labels is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['labels'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/labels/);
	});

	it('throws when users is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['users'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/users/);
	});

	it('throws when kanban is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['kanban'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/kanban/);
	});

	it('throws when gantt is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['gantt'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/gantt/);
	});

	it('throws when remote is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG) } as Record<string, unknown>;
		delete bad['remote'];
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/remote/);
	});

	it('throws when kanban.columns is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = JSON.parse(VALID_CONFIG) as Record<string, unknown>;
		const kanban = { ...(bad['kanban'] as Record<string, unknown>) };
		delete kanban['columns'];
		bad['kanban'] = kanban;
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/kanban\.columns/);
	});

	it('throws when gantt.group_by is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = JSON.parse(VALID_CONFIG) as Record<string, unknown>;
		const gantt = { ...(bad['gantt'] as Record<string, unknown>) };
		delete gantt['group_by'];
		bad['gantt'] = gantt;
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/gantt\.group_by/);
	});

	it('throws when remote.cors_proxy is missing', async () => {
		const fs = new MemoryFsAdapter();
		const bad = JSON.parse(VALID_CONFIG) as Record<string, unknown>;
		const remote = { ...(bad['remote'] as Record<string, unknown>) };
		delete remote['cors_proxy'];
		bad['remote'] = remote;
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/remote\.cors_proxy/);
	});

	it('throws when default_status is the empty string', async () => {
		const fs = new MemoryFsAdapter();
		const bad = { ...JSON.parse(VALID_CONFIG), default_status: '' };
		await fs.writeTextFile('.nomad.md/config.json', JSON.stringify(bad));
		await expect(loadConfig(fs)).rejects.toThrow(/default_status/);
	});
});
