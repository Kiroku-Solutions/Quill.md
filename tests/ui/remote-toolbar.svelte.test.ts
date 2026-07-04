/**
 * RemoteToolbar.svelte — remote view toolbar (sub-phase 6F).
 *
 * Verifies the remote toolbar surface:
 *   - The "New issue" affordance is NOT rendered (read-only guard,
 *     inherited from 6E).
 *   - The "Refresh" button IS rendered and clickable.
 *   - Clicking Refresh opens the `RefreshPatPrompt` modal and submitting
 *     the form calls `modeStore.refreshRemote(pat)`.
 *   - The "Sign out" button IS rendered and clicking it calls
 *     `modeStore.signOut()` (and the component navigates, but we stub
 *     `goto` for the test).
 *   - When `modeStore.lastFetchedAt` is non-null, the toolbar renders
 *     the "Last fetched: N min ago" indicator via `formatRelative`.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps this
 * file out of the `server` project.
 *
 * ## Why we mock both `$lib/state` and `$app/navigation`
 *
 * Same rationale as `tests/ui/recent-folders.svelte.test.ts` and
 * `tests/ui/app-shell.svelte.test.ts`: the real `$lib/state` barrel
 * transitively pulls `isomorphic-git` (via `createModeStore`), which
 * Chromium's bundler cannot ESM-rewrite. The real `$app/navigation`
 * would attempt a real navigation; we stub `goto` so the test stays
 * in-page.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import RemoteToolbar from '../../src/lib/components/RemoteToolbar.svelte';
import type { StoreGraph } from '../../src/lib/state/context';

// ─── Module-level stub bindings ────────────────────────────────────────────

let activeStub: StoreGraph | null = null;
const refreshCalls: string[] = [];
const signOutCalls: number[] = [];

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

vi.mock('$app/navigation', () => ({
	goto: () => Promise.resolve()
}));

// ─── Stub builder ─────────────────────────────────────────────────────────

function buildStub(opts: {
	mode?: 'home' | 'local' | 'remote';
	lastFetchedAt?: number | null;
	refreshImpl?: (pat: string) => Promise<void>;
}): StoreGraph {
	return {
		mode: {
			mode: opts.mode ?? 'remote',
			activeHandle: null,
			recentHandles: [],
			hasRemoteCredentials: opts.mode === 'remote',
			proxyWarning: null,
			lastFetchedAt: opts.lastFetchedAt ?? null,
			localAdapter: null,
			remoteAdapter: null,
			bootstrap: () => Promise.resolve(),
			openLocalFolder: () => Promise.resolve(),
			switchFolder: () => Promise.resolve(null),
			openRemote: () => Promise.resolve(),
			refreshRemote: (pat: string) => {
				refreshCalls.push(pat);
				return opts.refreshImpl ? opts.refreshImpl(pat) : Promise.resolve();
			},
			clearRemoteCache: () => Promise.resolve(),
			signOut: () => {
				signOutCalls.push(Date.now());
				return Promise.resolve();
			}
		},
		config: {
			config: null,
			status: 'idle',
			error: null,
			isReadOnly: true,
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
			settingsOpen: false,
			mobileNavOpen: false,
			openMobileNav: () => {},
			closeMobileNav: () => {},
			toggleMobileNav: () => {},
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

describe('RemoteToolbar', () => {
	beforeEach(() => {
		activeStub = null;
		refreshCalls.length = 0;
		signOutCalls.length = 0;
	});

	it('renders the toolbar root', async () => {
		activeStub = buildStub({});
		render(RemoteToolbar);
		await expect.element(page.getByTestId('remote-toolbar')).toBeInTheDocument();
	});

	it('does NOT render a "New issue" affordance (read-only guard)', async () => {
		activeStub = buildStub({});
		render(RemoteToolbar);

		// The local twin renders `toolbar-new-issue`; the remote twin must
		// never produce it. Use a defensive text scan as a backstop so
		// the assertion still catches a future regression that swaps the
		// testid for something else.
		expect(page.getByTestId('toolbar-new-issue').elements()).toHaveLength(0);
		expect(page.getByText(/new issue/i).elements()).toHaveLength(0);
	});

	it('renders a clickable Refresh button', async () => {
		activeStub = buildStub({});
		render(RemoteToolbar);

		const refresh = page.getByTestId('remote-toolbar-refresh');
		await expect.element(refresh).toBeInTheDocument();
	});

	it('opens the PAT prompt when Refresh is clicked and submits call refreshRemote(pat)', async () => {
		activeStub = buildStub({});
		render(RemoteToolbar);

		await page.getByTestId('remote-toolbar-refresh').click();

		const prompt = page.getByTestId('refresh-pat-prompt');
		await expect.element(prompt).toBeInTheDocument();

		const input = page.getByTestId('refresh-pat-prompt-input');
		await input.fill('ghp_testtoken1234');

		await page.getByTestId('refresh-pat-prompt-submit').click();

		// Allow the form submit microtask + the toolbar's onPatSubmitted
		// promise to settle.
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(refreshCalls).toEqual(['ghp_testtoken1234']);
	});

	it('renders a Sign out button that calls modeStore.signOut', async () => {
		activeStub = buildStub({});
		render(RemoteToolbar);

		const signout = page.getByTestId('remote-toolbar-signout');
		await expect.element(signout).toBeInTheDocument();

		await signout.click();

		// Allow the goto microtask to settle.
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(signOutCalls).toHaveLength(1);
	});

	it('shows "Last fetched: just now" when lastFetchedAt is recent', async () => {
		activeStub = buildStub({ lastFetchedAt: Date.now() });
		render(RemoteToolbar);

		await expect.element(page.getByTestId('remote-toolbar-last-fetched')).toBeInTheDocument();
		// 5 s is well inside the "just now" bucket (< 60s).
		await expect.element(page.getByText(/just now/i).first()).toBeInTheDocument();
	});

	it('shows the "Not yet fetched" placeholder when lastFetchedAt is null', async () => {
		activeStub = buildStub({ lastFetchedAt: null });
		render(RemoteToolbar);

		await expect
			.element(page.getByTestId('remote-toolbar-last-fetched-pending'))
			.toBeInTheDocument();
	});

	it('surfaces refresh errors as an alert below the toolbar', async () => {
		activeStub = buildStub({
			refreshImpl: () => Promise.reject(new Error('Network unreachable'))
		});
		render(RemoteToolbar);

		await page.getByTestId('remote-toolbar-refresh').click();
		await page.getByTestId('refresh-pat-prompt-input').fill('ghp_testtoken1234');
		await page.getByTestId('refresh-pat-prompt-submit').click();

		// Wait for the toolbar's catch to commit the error string.
		await new Promise((resolve) => setTimeout(resolve, 20));

		const alert = page.getByTestId('remote-toolbar-error');
		await expect.element(alert).toBeInTheDocument();
		await expect.element(alert.getByText(/network unreachable/i)).toBeInTheDocument();
	});
});
