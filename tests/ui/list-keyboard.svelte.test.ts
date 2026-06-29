/**
 * ListView.svelte — keyboard nav (NFR-4, sub-phase 6E bonus test).
 *
 * Verifies:
 *   - The first row is auto-focused on mount.
 *   - `↓` moves focus to the next row.
 *   - `Enter` on a focused row calls `editorStore.open(rowId)`.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import ListView from '../../src/lib/components/ListView.svelte';
import type { StoreGraph } from '../../src/lib/state/context';
import type { Config, Issue, LoadedIssue } from '../../src/lib/types';

let activeStub: StoreGraph | null = null;
const openCalls: { id: number }[] = [];

vi.mock('$lib/state', () => ({
	getStores: () => {
		if (!activeStub) throw new Error('Mock: setStoresStub() was not called before render.');
		return activeStub;
	},
	setStores: (stores: StoreGraph) => {
		activeStub = stores;
		return stores;
	}
}));

const CONFIG: Config = {
	statuses: [
		{ id: 'open', name: 'Open', color: '#0f0' },
		{ id: 'closed', name: 'Closed', color: '#888' }
	],
	default_status: 'open',
	labels: [],
	users: [],
	kanban: { columns: ['open', 'closed'] },
	gantt: { group_by: 'issue_type', default_view: 'week' },
	remote: { cors_proxy: '' }
};

function makeIssue(id: number, status: string, title: string): Issue {
	return {
		id,
		title,
		author: 'tester',
		creationDate: '2026-01-01',
		updatedDate: '2026-01-01',
		issueType: 'task',
		status,
		assignee: null,
		labels: [],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		integrityHash: null,
		customFields: {},
		sections: [],
		integrityWarning: false
	};
}

function buildStub(issues: readonly Issue[]): StoreGraph {
	const loaded: LoadedIssue[] = issues.map((iss) => ({
		issue: iss,
		sourcePath: `.nomad.md/issues/${String(iss.id).padStart(4, '0')}-${iss.title.toLowerCase()}.md`
	}));
	return {
		mode: {
			mode: 'local',
			activeHandle: null,
			recentHandles: [],
			hasRemoteCredentials: false,
			proxyWarning: null,
			lastFetchedAt: null,
			localAdapter: null,
			remoteAdapter: null,
			bootstrap: () => Promise.resolve(),
			openLocalFolder: () => Promise.resolve(),
			switchFolder: () => Promise.resolve(null),
			openRemote: () => Promise.resolve(),
			refreshRemote: () => Promise.resolve(),
			signOut: () => Promise.resolve()
		},
		config: {
			config: CONFIG,
			status: 'ready',
			error: null,
			load: () => Promise.resolve(),
			refresh: () => Promise.resolve()
		},
		templates: {
			templates: [],
			byType: new Map(),
			status: 'idle',
			error: null,
			load: () => Promise.resolve(),
			reload: () => Promise.resolve()
		},
		issues: {
			get issues() {
				return loaded;
			},
			dirty: new Set(),
			pendingSaves: new Map(),
			errors: new Map(),
			byId: new Map(loaded.map((li) => [li.issue.id, li])),
			byStatus: new Map(),
			integrityWarnings: [],
			status: 'ready',
			error: null,
			load: () => Promise.resolve(),
			create: () => Promise.resolve(1 as never),
			update: () => {},
			save: () => Promise.resolve(),
			discard: () => {},
			remove: () => Promise.resolve(),
			validate: () => []
		},
		editor: {
			activeId: null,
			draft: null,
			isDirty: false,
			integrityWarning: false,
			errors: [],
			open: (id: number) => {
				openCalls.push({ id });
			},
			close: () => {},
			patchField: () => {},
			patchSection: () => {},
			save: () => Promise.resolve(),
			discard: () => {}
		},
		filter: {
			filter: { q: undefined, status: undefined, type: undefined },
			set: () => {},
			clear: () => {},
			serialize: () => new URLSearchParams(),
			parse: () => {}
		},
		view: {
			view: 'list',
			setView: () => {}
		},
		theme: {
			preference: 'light',
			theme: 'light',
			setTheme: () => {},
			toggle: () => {}
		}
	};
}

describe('ListView — keyboard nav (NFR-4)', () => {
	beforeEach(() => {
		activeStub = null;
		openCalls.length = 0;
	});

	it('renders one row per issue with the filter pill count', async () => {
		activeStub = buildStub([
			makeIssue(1, 'open', 'First issue'),
			makeIssue(2, 'open', 'Second issue'),
			makeIssue(3, 'open', 'Third issue')
		]);
		render(ListView);

		await expect.element(page.getByTestId('list-view-count')).toHaveTextContent('3 of 3');
	});

	it('auto-focuses the first row on mount', async () => {
		activeStub = buildStub([
			makeIssue(1, 'open', 'First issue'),
			makeIssue(2, 'open', 'Second issue'),
			makeIssue(3, 'open', 'Third issue')
		]);
		render(ListView);

		const firstRow = document.querySelector<HTMLElement>('[data-row-id="1"]');
		expect(firstRow).not.toBeNull();
		await expect.poll(() => document.activeElement).toBe(firstRow);
	});

	it('moves focus to the next row on ArrowDown', async () => {
		activeStub = buildStub([
			makeIssue(1, 'open', 'First issue'),
			makeIssue(2, 'open', 'Second issue'),
			makeIssue(3, 'open', 'Third issue')
		]);
		render(ListView);

		const firstRow = document.querySelector<HTMLElement>('[data-row-id="1"]');
		expect(firstRow).not.toBeNull();
		firstRow?.focus();
		expect(document.activeElement).toBe(firstRow);

		await userEvent.keyboard('{ArrowDown}');

		const secondRow = document.querySelector<HTMLElement>('[data-row-id="2"]');
		expect(secondRow).not.toBeNull();
		await expect.poll(() => document.activeElement).toBe(secondRow);
	});

	it('moves focus to the previous row on ArrowUp', async () => {
		activeStub = buildStub([
			makeIssue(1, 'open', 'First issue'),
			makeIssue(2, 'open', 'Second issue'),
			makeIssue(3, 'open', 'Third issue')
		]);
		render(ListView);

		// Wait for the onMount auto-focus to settle, then move focus
		// to the last row.
		await expect
			.poll(() => document.activeElement === document.querySelector('[data-row-id="1"]'))
			.toBe(true);
		const thirdRow = document.querySelector<HTMLElement>('[data-row-id="3"]');
		expect(thirdRow).not.toBeNull();
		thirdRow?.focus();
		expect(document.activeElement).toBe(thirdRow);

		await userEvent.keyboard('{ArrowUp}');

		const secondRow = document.querySelector<HTMLElement>('[data-row-id="2"]');
		expect(secondRow).not.toBeNull();
		await expect.poll(() => document.activeElement).toBe(secondRow);
	});

	it('opens the editor when Enter is pressed on a focused row', async () => {
		activeStub = buildStub([
			makeIssue(1, 'open', 'First issue'),
			makeIssue(2, 'open', 'Second issue'),
			makeIssue(3, 'open', 'Third issue')
		]);
		render(ListView);

		const firstRow = document.querySelector<HTMLElement>('[data-row-id="1"]');
		expect(firstRow).not.toBeNull();
		firstRow?.focus();

		await userEvent.keyboard('{Enter}');

		expect(openCalls).toEqual([{ id: 1 }]);
	});
});
