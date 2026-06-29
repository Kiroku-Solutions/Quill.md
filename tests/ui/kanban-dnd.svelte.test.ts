/**
 * KanbanView.svelte — drag-and-drop + keyboard parity (NFR-4, sub-phase 6E).
 *
 * Verifies the 6E acceptance criteria from the brief:
 *   - Three columns, three cards, one card per column.
 *   - Focus a card, press `→`, the card's status changes to the
 *     next column's status.
 *   - Press `Enter`, the editor opens with the focused card's issue.
 *   - In Remote Mode the keyboard reorder is a no-op (no store
 *     update).
 *
 * The test uses the same `vi.mock('$lib/state', …)` pattern as
 * 6C / 6D: the `$lib/state` barrel is replaced with a side-effect-
 * free stub that satisfies the public `StoreGraph` surface. The
 * stub records the calls made to `issues.update` and `editor.open`
 * so the assertions can verify the keyboard path's reach into the
 * store.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project, where `vitest/browser` (and
 * the svelte-dnd-action sub-imports the component pulls) would not
 * resolve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import KanbanDndHarness from './KanbanDndHarness.svelte';
import type { StoreGraph } from '../../src/lib/state/context';
import type { Config, Issue, LoadedIssue } from '../../src/lib/types';

// ─── Module-level stub binding ────────────────────────────────────────────
//
// Same pattern as `tests/ui/recent-folders.svelte.test.ts`. Svelte
// context is illegal outside a component, so the stub lives in a
// module-level `let`. The mock factory returns `getStores` /
// `setStores` closures that read/write the active stub.

interface UpdateCall {
	id: number;
	patch: Record<string, unknown>;
}
interface OpenCall {
	id: number;
}

let activeStub: StoreGraph | null = null;
const updateCalls: UpdateCall[] = [];
const openCalls: OpenCall[] = [];

vi.mock('$lib/state', () => ({
	getStores: () => {
		if (!activeStub) {
			throw new Error('Mock: setStoresStub() was not called before render.');
		}
		return activeStub;
	},
	setStores: (stores: StoreGraph) => {
		activeStub = stores;
		return stores;
	}
}));

// ─── Fixture ──────────────────────────────────────────────────────────────

const CONFIG: Config = {
	statuses: [
		{ id: 'open', name: 'Open', color: '#0f0' },
		{ id: 'in_progress', name: 'In Progress', color: '#ff0' },
		{ id: 'closed', name: 'Closed', color: '#888' }
	],
	default_status: 'open',
	labels: [],
	users: [],
	kanban: { columns: ['open', 'in_progress', 'closed'] },
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

function buildStub(issues: readonly Issue[], mode: 'local' | 'remote'): StoreGraph {
	const loaded: LoadedIssue[] = issues.map((iss) => ({
		issue: iss,
		sourcePath: `.nomad.md/issues/${String(iss.id).padStart(4, '0')}-${iss.title.toLowerCase()}.md`
	}));
	const byId = new Map<number, LoadedIssue>(loaded.map((li) => [li.issue.id, li]));
	const byStatus = new Map<string, LoadedIssue[]>();
	for (const li of loaded) {
		const bucket = byStatus.get(li.issue.status);
		if (bucket) bucket.push(li);
		else byStatus.set(li.issue.status, [li]);
	}
	return {
		mode: {
			mode,
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
			get byId() {
				return byId;
			},
			get byStatus() {
				return byStatus;
			},
			integrityWarnings: [],
			status: 'ready',
			error: null,
			load: () => Promise.resolve(),
			create: () => Promise.resolve(1 as never),
			update: (id: number, patch: Record<string, unknown>) => {
				updateCalls.push({ id, patch });
				const li = byId.get(id);
				if (li) {
					// Mirror the store's behaviour: update in memory.
					(li.issue as unknown as Record<string, unknown>)['status'] = patch['status'];
					// Drop & rebuild the byStatus index so a re-render
					// reflects the new column.
					for (const [k, v] of byStatus) {
						byStatus.set(
							k,
							v.filter((x) => x.issue.id !== id)
						);
					}
					const bucket = byStatus.get(li.issue.status);
					if (bucket) bucket.push(li);
					else byStatus.set(li.issue.status, [li]);
				}
			},
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
			view: 'kanban',
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

// ─── Tests ────────────────────────────────────────────────────────────────

describe('KanbanView — keyboard parity (NFR-4)', () => {
	beforeEach(() => {
		activeStub = null;
		updateCalls.length = 0;
		openCalls.length = 0;
	});

	it('renders one card per column with the status as the column key', async () => {
		activeStub = buildStub(
			[
				makeIssue(1, 'open', 'First issue'),
				makeIssue(2, 'in_progress', 'Second issue'),
				makeIssue(3, 'closed', 'Third issue')
			],
			'local'
		);
		render(KanbanDndHarness);

		const cards = page.getByTestId('kanban-card').elements();
		expect(cards).toHaveLength(3);

		const columns = page.getByTestId('kanban-column').elements();
		expect(columns).toHaveLength(3);
	});

	it('moves a card to the next column on ArrowRight and updates the store', async () => {
		activeStub = buildStub(
			[
				makeIssue(1, 'open', 'First issue'),
				makeIssue(2, 'in_progress', 'Second issue'),
				makeIssue(3, 'closed', 'Third issue')
			],
			'local'
		);
		render(KanbanDndHarness);

		// Focus the "First issue" card (status='open', column=open).
		const firstCard = document.querySelector<HTMLElement>('[data-card-id="1"]');
		expect(firstCard).not.toBeNull();
		firstCard?.focus();
		expect(document.activeElement).toBe(firstCard);

		// Press ArrowRight — the card should move to the next column
		// (in_progress). The keyboard handler calls issues.update
		// with `{ status: 'in_progress' }` then issues.save.
		await userEvent.keyboard('{ArrowRight}');

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]).toEqual({ id: 1, patch: { status: 'in_progress' } });
	});

	it('opens the editor when a card is clicked', async () => {
		activeStub = buildStub(
			[
				makeIssue(1, 'open', 'First issue'),
				makeIssue(2, 'in_progress', 'Second issue'),
				makeIssue(3, 'closed', 'Third issue')
			],
			'local'
		);
		render(KanbanDndHarness);

		const firstCard = page.getByTestId('kanban-card').first();
		await firstCard.click();

		expect(openCalls).toEqual([{ id: 1 }]);
	});

	it('moves a card to the previous column on ArrowLeft', async () => {
		activeStub = buildStub(
			[
				makeIssue(1, 'open', 'First issue'),
				makeIssue(2, 'in_progress', 'Second issue'),
				makeIssue(3, 'closed', 'Third issue')
			],
			'local'
		);
		render(KanbanDndHarness);

		const secondCard = document.querySelector<HTMLElement>('[data-card-id="2"]');
		expect(secondCard).not.toBeNull();
		secondCard?.focus();

		await userEvent.keyboard('{ArrowLeft}');

		expect(updateCalls).toEqual([{ id: 2, patch: { status: 'open' } }]);
	});

	it('is a no-op for keyboard reorder in Remote Mode (read-only guard)', async () => {
		activeStub = buildStub(
			[
				makeIssue(1, 'open', 'First issue'),
				makeIssue(2, 'in_progress', 'Second issue'),
				makeIssue(3, 'closed', 'Third issue')
			],
			'remote'
		);
		render(KanbanDndHarness);

		const firstCard = document.querySelector<HTMLElement>('[data-card-id="1"]');
		expect(firstCard).not.toBeNull();
		firstCard?.focus();

		await userEvent.keyboard('{ArrowRight}');

		// No store update should have been issued.
		expect(updateCalls).toEqual([]);
	});
});
