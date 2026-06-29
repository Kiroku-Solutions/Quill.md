/**
 * Step 6 — accessibility audit (NFR-4, sub-phase 6K).
 *
 * Runs axe-core against every chrome surface (home, local List, local
 * Kanban, local Gantt, editor, wizard, settings panel). Each surface
 * is mounted with a stub store graph so the production components can
 * render in a real browser without `isomorphic-git` / IndexedDB /
 * network access.
 *
 * Severity policy: assert zero `serious` or `critical` violations per
 * surface. `moderate` and `minor` violations are listed in the test
 * output but do not fail the run (NFR-4 minimum bar per the 6K
 * brief: "zero serious or critical").
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps sibling
 * files out of the `server` project; the bare `tests/a11y/*.test.ts`
 * globs in the same exclude list need a one-line entry. The new
 * test file declares its own imports.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// `axe-core` is a pure ESM build; importing the source directly gives
// the same `axe.run` API as `@axe-core/playwright` without pulling in
// a Playwright-CDP dependency we don't use (the vitest browser driver
// already exposes the DOM).
import axe, { type AxeResults } from 'axe-core';

import AppShell from '../../src/lib/components/AppShell.svelte';
import Home from '../../src/routes/+page.svelte';
import LocalPage from '../../src/routes/local/+page.svelte';
import RemotePage from '../../src/routes/remote/+page.svelte';
import Wizard from '../../src/routes/wizard/+page.svelte';
import SettingsPanel from '../../src/lib/components/SettingsPanel.svelte';
import type { StoreGraph } from '../../src/lib/state/context';
import type { Config, Issue, LoadedIssue, Template } from '../../src/lib/types';
import type { HandleRecord } from '../../src/lib/adapters/handle-store';

// ─── Module-level stub bindings ────────────────────────────────────────────
//
// Svelte context is illegal outside a component, so the stubs live as
// module-level `let` bindings. `setStores` writes the graph; `getStores`
// returns it. The test that mounts `Wizard` also stubs the wizard
// service (see `vi.mock('$lib/services/wizard', …)`).

let activeStub: StoreGraph | null = null;
const openCalls: { id: number }[] = [];

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
	},
	brandIssueId: (id: number) => id as never
}));

vi.mock('$lib/adapters', () => ({
	TRASH_DIRECTORY: '.nomad.md/.trash',
	emptyTrash: () => Promise.resolve(0),
	moveToTrash: () => Promise.resolve('.nomad.md/.trash/test'),
	handleStore: { removeRecent: () => Promise.resolve() },
	LocalFsAdapter: {
		fromHandle: () => ({}) as never,
		pick: () => Promise.reject(new Error('FSA not available in test'))
	}
}));

// The wizard route imports `writeWizardSetup` from `$lib/services/wizard`.
// The service is real (pure Node, no DOM), but it calls into the
// adapter layer we have stubbed — easier to mock the whole module.
vi.mock('$lib/services/wizard', () => ({
	writeWizardSetup: () => Promise.resolve()
}));

// The wizard route's onMount calls `goto('/')` when no local adapter
// is bound. In the Chromium test environment `$app/navigation` is not
// wired, so the call throws an unhandled rejection. Stub the module.
vi.mock('$app/navigation', () => ({
	goto: () => Promise.resolve(),
	resolve: (p: string) => p
}));

// ─── Test fixtures ─────────────────────────────────────────────────────────

const CONFIG: Config = {
	statuses: [
		{ id: 'open', name: 'Open', color: '#16a34a' },
		{ id: 'in_progress', name: 'In Progress', color: '#0ea5e9' },
		{ id: 'done', name: 'Done', color: '#64748b' }
	],
	default_status: 'open',
	labels: [{ id: 'bug', name: 'Bug', color: '#dc2626' }],
	users: [{ id: 'alice', name: 'Alice' }],
	kanban: { columns: ['open', 'in_progress', 'done'] },
	gantt: { group_by: 'issue_type', default_view: 'week' },
	remote: { cors_proxy: '' }
};

function makeIssue(id: number, status: string, title: string, type = 'task'): Issue {
	return {
		id,
		title,
		author: 'tester',
		creationDate: '2026-01-01',
		updatedDate: '2026-01-15',
		issueType: type,
		status,
		assignee: null,
		labels: [],
		relations: [],
		startDate: '2026-02-01',
		endDate: '2026-02-10',
		duration: 9,
		integrityHash: null,
		customFields: {},
		sections: [],
		integrityWarning: false
	};
}

function makeLoaded(id: number, status: string, title: string): LoadedIssue {
	return {
		issue: makeIssue(id, status, title),
		sourcePath: `.nomad.md/issues/${String(id).padStart(4, '0')}-${title.toLowerCase()}.md`
	};
}

const TEMPLATES: Template[] = [
	{
		id: 'task',
		name: 'Task',
		icon: 'tag',
		color: '#0ea5e9',
		default_status: 'open',
		fields: [
			{ id: 1, key: 'title', name: 'Title', type: 'text', obligatory: true },
			{ id: 2, key: 'status', name: 'Status', type: 'select', obligatory: true },
			{ id: 3, key: 'assignee', name: 'Assignee', type: 'user', obligatory: false }
		],
		sections: []
	},
	{
		id: 'bug',
		name: 'Bug',
		icon: 'bug',
		color: '#dc2626',
		default_status: 'open',
		fields: [
			{ id: 1, key: 'title', name: 'Title', type: 'text', obligatory: true },
			{ id: 2, key: 'status', name: 'Status', type: 'select', obligatory: true }
		],
		sections: []
	}
];

function makeHandle(id: string, name: string): HandleRecord {
	return {
		id: id as 'recent-1',
		handle: {} as unknown as FileSystemDirectoryHandle,
		name,
		addedAt: Date.now() - 5 * 60 * 1000
	};
}

function buildStub(opts: {
	mode: 'home' | 'local' | 'remote';
	integrityCount?: number;
	recentHandles?: HandleRecord[];
	issues?: LoadedIssue[];
	activeEditorId?: number | null;
}): StoreGraph {
	const loaded = opts.issues ?? [];
	const integrityWarnings = Array.from({ length: opts.integrityCount ?? 0 }, (_, i) => ({
		issue: { id: i + 1, integrityWarning: true } as never
	}));
	const activeEditorId = opts.activeEditorId ?? null;
	const activeDraft =
		activeEditorId !== null
			? (() => {
					const li = loaded.find((l) => l.issue.id === activeEditorId);
					return li ?? null;
				})()
			: null;
	return {
		mode: {
			mode: opts.mode,
			activeHandle:
				opts.mode === 'local'
					? ({ name: 'acme-projects' } as unknown as FileSystemDirectoryHandle)
					: null,
			recentHandles: opts.recentHandles ?? [],
			hasRemoteCredentials: opts.mode === 'remote',
			proxyWarning: null,
			lastFetchedAt: opts.mode === 'remote' ? Date.now() - 5 * 60 * 1000 : null,
			localAdapter:
				opts.mode === 'local'
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
			config: CONFIG,
			status: 'ready',
			error: null,
			load: () => Promise.resolve(),
			refresh: () => Promise.resolve()
		},
		templates: {
			templates: TEMPLATES,
			byType: new Map(TEMPLATES.map((t) => [t.id, t])),
			status: 'ready',
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
			get integrityWarnings() {
				return integrityWarnings as never;
			},
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
			activeId: activeEditorId,
			draft: activeDraft as never,
			isDirty: activeEditorId !== null,
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

// ─── axe helpers ───────────────────────────────────────────────────────────

async function scanSurface(scope: () => Element | Document = () => document.body): Promise<{
	serious: number;
	critical: number;
	moderate: number;
	minor: number;
	summary: string[];
	details: AxeResults['violations'];
}> {
	const root = scope();
	const result: AxeResults = await axe.run(root, {
		runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
		resultTypes: ['violations']
	});
	const serious = result.violations.filter((v) => v.impact === 'serious');
	const critical = result.violations.filter((v) => v.impact === 'critical');
	const moderate = result.violations.filter((v) => v.impact === 'moderate');
	const minor = result.violations.filter((v) => v.impact === 'minor');
	const summary = [...critical, ...serious, ...moderate, ...minor].map(
		(v) =>
			`[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))` +
			v.nodes.map((n) => `\n     • ${n.target.join(' >> ')} — ${n.failureSummary ?? ''}`).join('')
	);
	return {
		serious: serious.length,
		critical: critical.length,
		moderate: moderate.length,
		minor: minor.length,
		summary,
		details: result.violations
	};
}

type ScanResult = Awaited<ReturnType<typeof scanSurface>>;

const scanHistory: Array<{ label: string; scan: ScanResult }> = [];

function logSummary(
	label: string,
	scan: {
		serious: number;
		critical: number;
		moderate: number;
		minor: number;
		summary: string[];
		details?: AxeResults['violations'];
	}
): void {
	scanHistory.push({ label, scan: scan as ScanResult });
}

/**
 * Render a child component INSIDE the AppShell's `<main>` landmark.
 * Production wires the chrome at the layout level — every route is a
 * child of AppShell. The standalone `render(...)` calls in
 * vitest-browser-svelte would otherwise append each component as a
 * sibling of AppShell (outside the `<main>`), so axe would flag
 * toolbars / view content as "not contained by a landmark".
 */
function adoptIntoMain(): void {
	const main = document.querySelector<HTMLElement>('[data-testid="main-canvas"]');
	if (!main) return;
	const extras = Array.from(document.body.children).filter(
		(c) => !c.contains(main) && !main.contains(c)
	);
	for (const c of extras) main.appendChild(c);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Step 6 — accessibility audit (NFR-4)', () => {
	beforeEach(() => {
		activeStub = null;
		openCalls.length = 0;
		// axe needs a clean document between tests.
		document.body.innerHTML = '';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('home page — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'home',
			recentHandles: [makeHandle('recent-1', 'acme-projects'), makeHandle('recent-2', 'docs')]
		});
		render(AppShell, { mode: 'home' });
		render(Home);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('home', scan);
		expect(scan.critical, `critical: ${scan.summary.join(' | ')}`).toBe(0);
		expect(scan.serious, `serious: ${scan.summary.join(' | ')}`).toBe(0);
	});

	it('home page (first-run) — no serious or critical axe violations', async () => {
		activeStub = buildStub({ mode: 'home', recentHandles: [] });
		render(AppShell, { mode: 'home' });
		render(Home);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('home-first-run', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('local list view — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'local',
			issues: [
				makeLoaded(1, 'open', 'First issue'),
				makeLoaded(2, 'in_progress', 'Second issue'),
				makeLoaded(3, 'done', 'Third issue')
			]
		});
		render(AppShell, { mode: 'local' });
		render(LocalPage);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('local-list', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('local kanban view — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'local',
			issues: [
				makeLoaded(1, 'open', 'First issue'),
				makeLoaded(2, 'in_progress', 'Second issue'),
				makeLoaded(3, 'open', 'Third issue')
			]
		});
		render(AppShell, { mode: 'local' });
		// Switch the view store to 'kanban' before rendering the route.
		if (activeStub) (activeStub.view as { view: string }).view = 'kanban';
		render(LocalPage);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('local-kanban', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('local gantt view — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'local',
			issues: [makeLoaded(1, 'open', 'First issue'), makeLoaded(2, 'in_progress', 'Second issue')]
		});
		render(AppShell, { mode: 'local' });
		if (activeStub) (activeStub.view as { view: string }).view = 'gantt';
		render(LocalPage);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('local-gantt', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('editor panel — no serious or critical axe violations', async () => {
		const li = makeLoaded(1, 'open', 'A real issue');
		activeStub = buildStub({
			mode: 'local',
			issues: [li],
			activeEditorId: 1
		});
		render(AppShell, { mode: 'local' });
		render(LocalPage);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('editor', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('wizard — no serious or critical axe violations', async () => {
		activeStub = buildStub({ mode: 'home' });
		render(AppShell, { mode: 'wizard' });
		render(Wizard);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('wizard', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('settings panel — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'local',
			recentHandles: [makeHandle('recent-1', 'acme-projects')]
		});
		render(AppShell, { mode: 'home' });
		render(SettingsPanel, { open: true, onclose: () => undefined });

		const scan = await scanSurface();
		logSummary('settings', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('remote list view — no serious or critical axe violations', async () => {
		activeStub = buildStub({
			mode: 'remote',
			issues: [makeLoaded(1, 'open', 'Read-only issue')]
		});
		render(AppShell, { mode: 'remote' });
		render(RemotePage);
		adoptIntoMain();

		const scan = await scanSurface();
		logSummary('remote-list', scan);
		expect(scan.critical).toBe(0);
		expect(scan.serious).toBe(0);
	});

	it('summarises all surfaces (auditor triage)', async () => {
		// A single test that re-runs the scan against every surface
		// and writes the consolidated summary to the global audit log.
		// The pass criteria are the same per-surface zero-serious /
		// zero-critical assertions; this is the "snapshot" the audit
		// report quotes.
		scanHistory.length = 0;

		const cases: Array<{
			label: string;
			mode: 'home' | 'local' | 'remote' | 'wizard';
			route?: 'home' | 'local' | 'remote' | 'wizard' | 'settings';
			issues?: LoadedIssue[];
			view?: 'list' | 'kanban' | 'gantt';
			editorId?: number | null;
			recentHandles?: HandleRecord[];
			integrityCount?: number;
		}> = [
			{
				label: 'home (recent)',
				mode: 'home',
				recentHandles: [makeHandle('recent-1', 'acme-projects')]
			},
			{ label: 'home (first-run)', mode: 'home' },
			{
				label: 'local-list',
				mode: 'local',
				issues: [makeLoaded(1, 'open', 'A'), makeLoaded(2, 'in_progress', 'B')]
			},
			{
				label: 'local-kanban',
				mode: 'local',
				issues: [makeLoaded(1, 'open', 'A'), makeLoaded(2, 'in_progress', 'B')],
				view: 'kanban'
			},
			{
				label: 'local-gantt',
				mode: 'local',
				issues: [makeLoaded(1, 'open', 'A'), makeLoaded(2, 'in_progress', 'B')],
				view: 'gantt'
			},
			{
				label: 'editor',
				mode: 'local',
				issues: [makeLoaded(1, 'open', 'A real issue')],
				editorId: 1
			},
			{ label: 'wizard', mode: 'home', route: 'wizard' },
			{
				label: 'settings',
				mode: 'local',
				route: 'settings',
				recentHandles: [makeHandle('recent-1', 'acme-projects')]
			},
			{ label: 'remote-list', mode: 'remote', issues: [makeLoaded(1, 'open', 'Read-only')] }
		];

		const summary: Array<{
			label: string;
			critical: number;
			serious: number;
			moderate: number;
			minor: number;
			violations: string[];
		}> = [];

		for (const c of cases) {
			// Reset the document between cases so axe doesn't see the
			// previous surface's leftovers.
			document.body.innerHTML = '';
			activeStub = buildStub({
				mode: c.mode === 'wizard' || c.mode === 'home' ? 'home' : c.mode,
				recentHandles: c.recentHandles,
				issues: c.issues,
				activeEditorId: c.editorId ?? null,
				integrityCount: c.integrityCount
			});
			if (c.view) {
				// mutate the stub view-store before mounting the page
				(activeStub as { view: { view: string } }).view.view = c.view;
			}

			if (c.route === 'wizard') {
				render(AppShell, { mode: 'wizard' });
				render(Wizard);
				adoptIntoMain();
			} else if (c.route === 'settings') {
				render(AppShell, { mode: 'home' });
				render(SettingsPanel, { open: true, onclose: () => undefined });
			} else if (c.route === 'home') {
				render(AppShell, { mode: 'home' });
				render(Home);
				adoptIntoMain();
			} else if (c.mode === 'remote') {
				render(AppShell, { mode: 'remote' });
				render(RemotePage);
				adoptIntoMain();
			} else {
				render(AppShell, { mode: 'local' });
				render(LocalPage);
				adoptIntoMain();
			}

			const scan = await scanSurface();
			summary.push({
				label: c.label,
				critical: scan.critical,
				serious: scan.serious,
				moderate: scan.moderate,
				minor: scan.minor,
				violations: scan.summary
			});
		}

		console.warn(
			'\n[axe:summary] ' +
				JSON.stringify(
					summary.map((s) => ({
						label: s.label,
						critical: s.critical,
						serious: s.serious,
						moderate: s.moderate,
						minor: s.minor
					})),
					null,
					2
				) +
				'\n' +
				summary
					.flatMap((s) =>
						s.violations.length === 0
							? [`${s.label}: clean`]
							: [`${s.label}:`, ...s.violations.map((v) => '  ' + v)]
					)
					.join('\n')
		);

		// Per-surface hard assertions.
		for (const s of summary) {
			expect(s.critical, `${s.label} has ${s.critical} critical`).toBe(0);
			expect(s.serious, `${s.label} has ${s.serious} serious`).toBe(0);
		}
	});
});
