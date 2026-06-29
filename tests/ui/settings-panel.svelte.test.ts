/**
 * SettingsPanel.svelte — hero settings surface (sub-phase 6H).
 *
 * Verifies the 6H acceptance criteria from the brief:
 *   - The Theme picker is present with three buttons (Light / Dark /
 *     System). Clicking one calls `theme.setTheme(...)`.
 *   - The CORS proxy field shows the current value and is `readonly`.
 *     The "Coming in a follow-up" small-print is visible.
 *   - The Recent folders list is rendered (the 6D `<RecentFoldersList>`
 *     is embedded).
 *   - The "Empty trash" command button is present; clicking it opens
 *     the modal.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project, where `vitest/browser` (and the
 * lucide icon sub-imports the component pulls) would not resolve.
 *
 * ## Why we mock both `$lib/state` and `$lib/adapters`
 *
 * Same rationale as `tests/ui/recent-folders.svelte.test.ts`: the real
 * `$lib/state` barrel transitively pulls `isomorphic-git` (via
 * `createModeStore`), which Chromium's pre-bundler cannot ESM-rewrite.
 * The real `handleStore` opens a real IndexedDB connection. We replace
 * both modules with side-effect-free stubs.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import SettingsPanel from '../../src/lib/components/SettingsPanel.svelte';
import type { Config } from '../../src/lib/types';
import type { HandleRecord } from '../../src/lib/adapters/handle-store';
import type { StoreGraph } from '../../src/lib/state/context';

// ─── Module-level stub bindings ────────────────────────────────────────────

let activeStub: StoreGraph | null = null;
const setThemeCalls: string[] = [];
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
	TRASH_DIRECTORY: '.nomad.md/.trash',
	emptyTrash: () => Promise.resolve(0),
	moveToTrash: () => Promise.resolve('.nomad.md/.trash/test'),
	handleStore: {
		removeRecent: (id: string) => {
			removedIds.push(id);
			return Promise.resolve();
		}
	}
}));

// ─── Stub builder ─────────────────────────────────────────────────────────

function makeHandle(id: string, name: string): HandleRecord {
	return {
		id: id as 'recent-1',
		handle: {} as unknown as FileSystemDirectoryHandle,
		name,
		addedAt: Date.now() - 5 * 60 * 1000
	};
}

function buildStub(opts: {
	preference?: 'light' | 'dark' | 'system';
	corsProxy?: string;
	recentHandles?: HandleRecord[];
	hasLocalAdapter?: boolean;
}): StoreGraph {
	const config: Config = {
		statuses: [],
		default_status: '',
		labels: [],
		users: [],
		kanban: { columns: [] },
		gantt: { group_by: 'issue_type', default_view: 'week' },
		remote: { cors_proxy: opts.corsProxy ?? 'https://cors.isomorphic-git.org' }
	};
	return {
		mode: {
			mode: opts.hasLocalAdapter ? 'local' : 'home',
			activeHandle: null,
			recentHandles: opts.recentHandles ?? [],
			hasRemoteCredentials: false,
			proxyWarning: null,
			lastFetchedAt: null,
			localAdapter: opts.hasLocalAdapter
				? ({
						listDirectory: () => Promise.resolve([]),
						readTextFile: () => Promise.resolve(''),
						writeTextFile: () => Promise.resolve(),
						removeFile: () => Promise.resolve(),
						moveFile: () => Promise.resolve()
					} as never)
				: null,
			remoteAdapter: null,
			bootstrap: () => Promise.resolve(),
			openLocalFolder: () => Promise.resolve(),
			switchFolder: () => Promise.resolve(null),
			openRemote: () => Promise.resolve(),
			refreshRemote: () => Promise.resolve(),
			signOut: () => Promise.resolve()
		},
		config: {
			config,
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
			preference: opts.preference ?? 'light',
			theme: opts.preference === 'dark' ? 'dark' : 'light',
			setTheme: (t: string) => {
				setThemeCalls.push(t);
			},
			toggle: () => {}
		}
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SettingsPanel', () => {
	beforeEach(() => {
		activeStub = null;
		setThemeCalls.length = 0;
		removedIds.length = 0;
	});

	function renderOpen(opts: Parameters<typeof buildStub>[0] = {}): void {
		activeStub = buildStub(opts);
		render(SettingsPanel, { open: true, onclose: () => undefined });
	}

	it('renders the three-button theme picker', async () => {
		renderOpen();

		await expect.element(page.getByTestId('settings-theme')).toBeInTheDocument();
		await expect.element(page.getByTestId('settings-theme-light')).toBeInTheDocument();
		await expect.element(page.getByTestId('settings-theme-dark')).toBeInTheDocument();
		await expect.element(page.getByTestId('settings-theme-system')).toBeInTheDocument();
	});

	it('clicking a theme button calls theme.setTheme', async () => {
		renderOpen({ preference: 'light' });

		await page.getByTestId('settings-theme-system').click();

		expect(setThemeCalls).toEqual(['system']);
	});

	it('CORS proxy field shows the current value and is readonly', async () => {
		renderOpen({ corsProxy: 'https://my-proxy.example.com' });

		const input = page.getByTestId('settings-cors-input');
		await expect.element(input).toBeInTheDocument();
		await expect.element(input).toHaveValue('https://my-proxy.example.com');

		// The "Coming in a follow-up" small-print is part of the CORS section.
		const note = page.getByTestId('settings-cors-note');
		await expect.element(note).toBeInTheDocument();
		expect((note.element() as HTMLElement).textContent ?? '').toMatch(
			/coming in a[\s\S]*follow-up/i
		);

		// The native input element must expose the `readonly` attribute.
		const inputEl = document.querySelector<HTMLInputElement>('[data-testid="settings-cors-input"]');
		expect(inputEl?.readOnly).toBe(true);
	});

	it('renders the embedded RecentFoldersList', async () => {
		renderOpen({
			recentHandles: [makeHandle('recent-1', 'acme-projects'), makeHandle('recent-2', 'docs')]
		});

		const recent = page.getByTestId('recent-folders');
		await expect.element(recent).toBeInTheDocument();
		const rows = page.getByTestId('recent-folder-row').elements();
		expect(rows).toHaveLength(2);
	});

	it('Empty trash command opens the EmptyTrashModal when clicked', async () => {
		renderOpen({ hasLocalAdapter: true });

		const trashBtn = page.getByTestId('settings-empty-trash');
		await expect.element(trashBtn).toBeInTheDocument();

		await trashBtn.click();

		// The modal mounts a native <dialog> with the empty-trash-confirm button.
		const confirm = page.getByTestId('empty-trash-confirm');
		await expect.element(confirm).toBeInTheDocument();
	});

	it('Clear remote cache button is disabled when no remote session is active', async () => {
		renderOpen();

		const clearCacheBtn = page.getByTestId('settings-clear-cache');
		await expect.element(clearCacheBtn).toBeInTheDocument();
		const clearCacheEl = document.querySelector<HTMLButtonElement>(
			'[data-testid="settings-clear-cache"]'
		);
		expect(clearCacheEl?.disabled).toBe(true);
	});

	it('does not render the panel when open is false', async () => {
		activeStub = buildStub({});
		render(SettingsPanel, { open: false, onclose: () => undefined });

		expect(page.getByTestId('settings-panel').elements()).toHaveLength(0);
	});
});
