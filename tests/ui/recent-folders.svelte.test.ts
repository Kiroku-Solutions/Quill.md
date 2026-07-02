/**
 * RecentFoldersList.svelte — recent-folders list (sub-phase 6D, ERS §4.1.2).
 *
 * Verifies the home-screen recent-folders surface:
 *   - The list renders one row per entry in `mode.recentHandles`.
 *   - Each row exposes a "Forget" affordance; clicking it removes the row
 *     from the visible list (the local optimistic update + the
 *     `handleStore.removeRecent` mock both fire).
 *   - The list section is hidden when `mode.recentHandles` is empty.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project, where `vitest/browser` (and the
 * lucide icon sub-imports the component pulls) would not resolve.
 *
 * ## Why we mock both `$lib/state` and `$lib/adapters`
 *
 * The component reads the store via `getStores()` and persists
 * removals via the `handleStore` singleton re-exported from
 * `$lib/adapters`. The real `$lib/state` barrel transitively pulls
 * `isomorphic-git` (via `createModeStore`), which Chromium's
 * pre-bundler cannot ESM-rewrite. The real `handleStore` opens a real
 * IndexedDB connection — fine in Chromium, but the test does not want
 * to depend on IDB state and instead asserts on the local optimistic
 * UI update. Both modules are replaced with side-effect-free stubs.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import RecentFoldersList from '../../src/lib/components/RecentFoldersList.svelte';
import type { HandleRecord } from '../../src/lib/adapters/handle-store';
import type { StoreGraph } from '../../src/lib/state/context';

// ─── Module-level stub bindings ────────────────────────────────────────────
//
// Same pattern as `tests/ui/app-shell.svelte.test.ts`: Svelte context
// is illegal outside a component, so the stubs live as module-level
// `let` bindings. The mock factory returns `getStores` and `setStores`
// closures that read/write the active stub.

let activeStub: StoreGraph | null = null;
const removedIds: string[] = [];

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

vi.mock('$lib/adapters', () => ({
	handleStore: {
		removeRecent: (id: string) => {
			removedIds.push(id);
			return Promise.resolve();
		}
	}
}));

// ─── Stub builder ─────────────────────────────────────────────────────────

function makeHandle(id: string, name: string): HandleRecord {
	// `HandleRecord.handle` is a `FileSystemDirectoryHandle`; the row
	// never exercises its methods, so an empty object cast is enough.
	return {
		id: id as 'recent-1',
		handle: {} as unknown as FileSystemDirectoryHandle,
		name,
		addedAt: Date.now() - 5 * 60 * 1000
	};
}

function buildStub(opts: { recentHandles: HandleRecord[] }): StoreGraph {
	return {
		mode: {
			mode: 'home',
			activeHandle: null,
			recentHandles: opts.recentHandles,
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
			clearRemoteCache: () => Promise.resolve(),
			signOut: () => Promise.resolve()
		},
		config: {
			config: null,
			status: 'idle',
			error: null,
			isReadOnly: false,
			load: () => Promise.resolve(),
			refresh: () => Promise.resolve(),
			save: () => Promise.resolve()
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
				return [];
			},
			dirty: new Set(),
			pendingSaves: new Map(),
			errors: new Map(),
			byId: new Map(),
			byStatus: new Map(),
			integrityWarnings: [],
			status: 'idle',
			error: null,
			load: () => Promise.resolve(),
			create: () => Promise.resolve(1 as never),
			importIssue: () => Promise.resolve(1 as never),
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
			open: () => {},
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
		},
		ui: {
			settingsOpen: false, mobileNavOpen: false, openMobileNav: () => {}, closeMobileNav: () => {}, toggleMobileNav: () => {},
			openSettings: () => {},
			closeSettings: () => {},
			toggleSettings: () => {},
			editorOpen: false,
			openEditor: () => {},
			closeEditor: () => {},
			toggleEditor: () => {}
		}
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('RecentFoldersList', () => {
	beforeEach(() => {
		activeStub = null;
		removedIds.length = 0;
	});

	it('renders one row per recent handle', async () => {
		activeStub = buildStub({
			recentHandles: [makeHandle('recent-1', 'acme-projects'), makeHandle('recent-2', 'docs')]
		});
		render(RecentFoldersList);

		const rows = page.getByTestId('recent-folder-row').elements();
		expect(rows).toHaveLength(2);
	});

	it('shows the folder name for each row', async () => {
		activeStub = buildStub({
			recentHandles: [makeHandle('recent-1', 'acme-projects'), makeHandle('recent-2', 'docs')]
		});
		render(RecentFoldersList);

		await expect
			.element(page.getByTestId('recent-folder-row').getByText('acme-projects').first())
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId('recent-folder-row').getByText('docs').first())
			.toBeInTheDocument();
	});

	it('removes the row when its Forget button is clicked', async () => {
		activeStub = buildStub({
			recentHandles: [makeHandle('recent-1', 'acme-projects'), makeHandle('recent-2', 'docs')]
		});
		render(RecentFoldersList);

		const firstRow = page.getByTestId('recent-folder-row').filter({ hasText: 'acme-projects' });
		await expect.element(firstRow).toBeInTheDocument();

		await firstRow.getByTestId('recent-folder-forget').click();

		const rows = page.getByTestId('recent-folder-row').elements();
		expect(rows).toHaveLength(1);
		expect(removedIds).toEqual(['recent-1']);
	});

	it('hides the entire list section when there are no recent handles', async () => {
		activeStub = buildStub({ recentHandles: [] });
		render(RecentFoldersList);

		expect(page.getByTestId('recent-folders').elements()).toHaveLength(0);
		expect(page.getByTestId('recent-folder-row').elements()).toHaveLength(0);
	});
});
