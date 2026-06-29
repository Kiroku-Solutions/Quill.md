/**
 * AppShell + chrome — three-region layout structure (sub-phase 6C).
 *
 * Verifies the layout shell:
 *   - TopBar is rendered for every mode.
 *   - Main canvas is rendered for every mode.
 *   - LeftRail is rendered ONLY for `local` and `remote`.
 *   - The mode badge in the TopBar reflects the `mode` prop.
 *   - The integrity warning count badge appears in the LeftRail when
 *     integrity warnings exist.
 *   - The IntegrityWarningBanner appears in the canvas when warnings
 *     exist and is hidden otherwise.
 *   - The active folder name appears in the TopBar indicator.
 *
 * Vitest project: `client` (Playwright Chromium).
 *
 * ## Why we mock `$lib/state`
 *
 * The production components (`TopBar`, `LeftRail`,
 * `IntegrityWarningBanner`, `ProxyWarningBanner`, `ThemeToggle`)
 * import `getStores()` from `$lib/state`. The barrel re-exports every
 * factory — including `createModeStore`, which transitively pulls in
 * `isomorphic-git` via `fetchSubtree`. Chromium's bundler cannot
 * ESM-rewrite isomorphic-git's `async-lock` CJS interop, so the real
 * barrel blows up the test (the same constraint that excludes
 * `tests/adapters/remote-git.test.ts` from the `client` project).
 *
 * The mock replaces the `$lib/state` module with a side-effect-free
 * stub: `setStores` records the graph in a module-level binding (not
 * Svelte context — calling `setContext` from outside a component
 * throws `lifecycle_outside_component`), `getStores` returns it. The
 * components under test do not notice the difference — they still go
 * through `getStores()` and the stub satisfies the public surface.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import AppShell from '../../src/lib/components/AppShell.svelte';
import type { ShellMode } from '../../src/lib/components/TopBar.svelte';
import type { StoreGraph } from '../../src/lib/state/context.ts';

// ─── Module-level stub binding ────────────────────────────────────────────
//
// We keep the active stub in a module-level `let` instead of Svelte
// context. `setContext` is illegal outside a component initialization,
// but the components themselves only call `getStores()` from inside
// their own init, so the read path is fine. The write path lives in
// the test (outside any component), so a plain module binding is the
// right shape.

let activeStub: StoreGraph | null = null;

vi.mock('$lib/state', () => ({
	getStores: () => {
		if (!activeStub) {
			throw new Error('Mock: setStoresStub() was not called before this component tree.');
		}
		return activeStub;
	},
	setStores: (stores: StoreGraph) => {
		activeStub = stores;
		return stores;
	}
}));

// Mock `$lib/adapters` so the SettingsPanel → RecentFoldersList chain
// (mounted transitively by the TopBar since sub-phase 6H) does not pull
// the real `remote-git.ts` adapter into the Chromium bundle — that
// path goes through `isomorphic-git` → `async-lock` (CJS) which Vite's
// ESM rewriter cannot interop cleanly. A side-effect-free stub keeps
// the test isolated from the filesystem / IndexedDB / network.
vi.mock('$lib/adapters', () => ({
	TRASH_DIRECTORY: '.nomad.md/.trash',
	emptyTrash: () => Promise.resolve(0),
	moveToTrash: () => Promise.resolve('.nomad.md/.trash/test'),
	handleStore: {
		removeRecent: () => Promise.resolve()
	}
}));

// ─── Stub builder ─────────────────────────────────────────────────────────
//
// Each test calls `buildStub({ integrityCount })` (optionally with
// `activeHandleName`) to produce a fresh graph. The stub satisfies the
// minimal `StoreGraph` contract that AppShell, TopBar, LeftRail, and
// IntegrityWarningBanner actually read at runtime.

function buildStub(opts: { integrityCount: number; activeHandleName?: string }): StoreGraph {
	const integrityWarnings = Array.from({ length: opts.integrityCount }, (_, i) => ({
		issue: { id: i + 1, integrityWarning: true }
	}));

	return {
		mode: {
			mode: 'home',
			activeHandle:
				opts.activeHandleName !== undefined
					? ({ name: opts.activeHandleName } as unknown as FileSystemDirectoryHandle)
					: null,
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
			config: null,
			status: 'idle',
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
			get integrityWarnings() {
				return integrityWarnings as never;
			},
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
			preference: 'light',
			theme: 'light',
			setTheme: () => {},
			toggle: () => {}
		}
	};
}

function renderShell(mode: ShellMode, opts: { integrityCount?: number } = {}): void {
	activeStub = buildStub({ integrityCount: opts.integrityCount ?? 0 });
	render(AppShell, { mode });
}

describe('AppShell — three-region layout', () => {
	beforeEach(() => {
		activeStub = null;
	});

	it('renders the TopBar and main canvas for the home mode', async () => {
		renderShell('home');

		await expect.element(page.getByTestId('topbar')).toBeInTheDocument();
		await expect.element(page.getByTestId('main-canvas')).toBeInTheDocument();
		expect(page.getByTestId('leftrail').elements()).toHaveLength(0);
	});

	it('renders the TopBar and main canvas for the wizard mode', async () => {
		renderShell('wizard');

		await expect.element(page.getByTestId('topbar')).toBeInTheDocument();
		await expect.element(page.getByTestId('main-canvas')).toBeInTheDocument();
		expect(page.getByTestId('leftrail').elements()).toHaveLength(0);
	});

	it('renders the LeftRail for local mode', async () => {
		renderShell('local');

		await expect.element(page.getByTestId('topbar')).toBeInTheDocument();
		await expect.element(page.getByTestId('main-canvas')).toBeInTheDocument();
		await expect.element(page.getByTestId('leftrail')).toBeInTheDocument();
	});

	it('renders the LeftRail for remote mode', async () => {
		renderShell('remote');

		await expect.element(page.getByTestId('topbar')).toBeInTheDocument();
		await expect.element(page.getByTestId('main-canvas')).toBeInTheDocument();
		await expect.element(page.getByTestId('leftrail')).toBeInTheDocument();
	});

	it('shows the Local mode badge in the TopBar for local mode', async () => {
		renderShell('local');

		const topbar = page.getByTestId('topbar');
		await expect.element(topbar.getByText('Local')).toBeInTheDocument();
	});

	it('shows the Remote mode badge in the TopBar for remote mode', async () => {
		renderShell('remote');

		const topbar = page.getByTestId('topbar');
		await expect.element(topbar.getByText('Remote (read-only)')).toBeInTheDocument();
	});

	it('shows the Setup badge in the TopBar for wizard mode', async () => {
		renderShell('wizard');

		const topbar = page.getByTestId('topbar');
		await expect.element(topbar.getByText('Setup')).toBeInTheDocument();
	});

	it('shows the Home badge in the TopBar for home mode', async () => {
		renderShell('home');

		const topbar = page.getByTestId('topbar');
		await expect.element(topbar.getByText('Home')).toBeInTheDocument();
	});

	it('shows the integrity warning badge in the LeftRail when warnings exist', async () => {
		renderShell('local', { integrityCount: 3 });

		const leftrail = page.getByTestId('leftrail');
		await expect.element(leftrail.getByText(/3\s+integrity warnings/i)).toBeInTheDocument();
	});

	it('hides the integrity warning badge when there are no warnings', async () => {
		renderShell('local', { integrityCount: 0 });

		const leftrail = page.getByTestId('leftrail');
		expect(leftrail.getByText(/integrity warnings?/i).elements()).toHaveLength(0);
	});

	it('mounts the IntegrityWarningBanner in the canvas when warnings exist', async () => {
		renderShell('local', { integrityCount: 2 });

		await expect.element(page.getByTestId('integrity-warning-banner')).toBeInTheDocument();
	});

	it('hides the IntegrityWarningBanner when there are no warnings', async () => {
		renderShell('local', { integrityCount: 0 });

		expect(page.getByTestId('integrity-warning-banner').elements()).toHaveLength(0);
	});

	it('shows the active folder name in the TopBar for local mode', async () => {
		activeStub = buildStub({ integrityCount: 0, activeHandleName: 'acme-projects' });
		render(AppShell, { mode: 'local' });

		const topbar = page.getByTestId('topbar');
		await expect.element(topbar.getByText('acme-projects')).toBeInTheDocument();
	});
});
