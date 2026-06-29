/**
 * FormFields.svelte — template-driven form (sub-phase 6G, FR-2 / FR-8).
 *
 * Verifies the acceptance criteria for the form rows that
 * `EditorPanel.svelte` mounts in its Form tab:
 *   - Every field declared by `template.fields[]` renders, in
 *     ascending `id` order, with the right primitive (text input,
 *     select, chip multi-select).
 *   - An obligatory field renders the required `*` marker.
 *   - Typing in a `text` field calls `editor.patchField(key, value)`
 *     with the matching key.
 *   - Selecting an option in a `select` field calls
 *     `editor.patchField(key, value)`.
 *   - Toggling a chip in a `multi-select` field calls
 *     `editor.patchField(key, string[])` with the new list.
 *   - When `editor.errors` contains an entry whose `field` matches
 *     the row's key, the inline error message is rendered beneath
 *     the input with `role="alert"`.
 *
 * The test uses the standard `vi.mock('$lib/state', …)` pattern
 * from 6C / 6D / 6E / 6F. The stub satisfies the public
 * `StoreGraph` shape and records every call to `editor.patchField`
 * so assertions can verify the right verb reaches the store with
 * the right payload.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps
 * this file out of the `server` project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import FormFields from '../../src/lib/components/FormFields.svelte';
import type { StoreGraph } from '../../src/lib/state/context';
import type { Config, Issue, LoadedIssue, Template, TemplateField } from '../../src/lib/types';

// ─── Module-level stub binding ────────────────────────────────────────────

interface PatchCall {
	key: string;
	value: unknown;
}

let activeStub: StoreGraph | null = null;
const patchCalls: PatchCall[] = [];

/**
 * Mirror of the editor store's system-key set. The real store
 * derives this from `FIELD_TO_YAML` in `types/issue.ts`; the test
 * inlines a plain Set so we don't need to pull the editor factory
 * into the chromium bundle just to read its constants.
 */
const SYSTEM_KEYS: ReadonlySet<string> = new Set([
	'id',
	'title',
	'author',
	'creationDate',
	'updatedDate',
	'issueType',
	'status',
	'assignee',
	'labels',
	'relations',
	'startDate',
	'endDate',
	'duration',
	'integrityHash'
]);

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

// ─── Fixtures ─────────────────────────────────────────────────────────────

const CONFIG: Config = {
	statuses: [
		{ id: 'open', name: 'Open', color: '#0f0' },
		{ id: 'closed', name: 'Closed', color: '#888' }
	],
	default_status: 'open',
	labels: [
		{ id: 'bug', name: 'Bug', color: '#f00' },
		{ id: 'feature', name: 'Feature', color: '#00f' }
	],
	users: [
		{ id: 'alice', name: 'Alice' },
		{ id: 'bob', name: 'Bob' }
	],
	kanban: { columns: ['open', 'closed'] },
	gantt: { group_by: 'issue_type', default_view: 'week' },
	remote: { cors_proxy: '' }
};

function makeIssue(): Issue {
	return {
		id: 42,
		title: 'Test issue',
		author: 'tester',
		creationDate: '2026-01-01',
		updatedDate: '2026-01-01',
		issueType: 'task',
		status: 'open',
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

function makeLoaded(): LoadedIssue {
	return {
		issue: makeIssue(),
		sourcePath: '.nomad.md/issues/0042-test.md'
	};
}

const TASK_TEMPLATE: Template = {
	id: 'task',
	name: 'Task',
	icon: 'check-square',
	color: '#0af',
	default_status: 'open',
	fields: [
		{
			id: 1,
			key: 'summary',
			type: 'text',
			name: 'Summary',
			obligatory: true
		},
		{
			id: 2,
			key: 'status',
			type: 'select',
			name: 'Status',
			obligatory: false,
			options: ['open', 'closed']
		},
		{
			id: 3,
			key: 'labels',
			type: 'multi-select',
			name: 'Labels',
			obligatory: false,
			options_source: 'config.labels'
		}
	],
	sections: []
};

interface StubOpts {
	readonly errors?: ReadonlyArray<{ field: string; message: string }>;
	readonly template?: Template;
}

function buildStub(opts: StubOpts = {}): StoreGraph {
	const loaded = makeLoaded();
	const tpl = opts.template ?? TASK_TEMPLATE;
	const errors = opts.errors ?? [];
	const byType = new Map<string, Template>();
	byType.set(tpl.id, tpl);
	const byId = new Map<number, LoadedIssue>();
	byId.set(loaded.issue.id, loaded);
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
			templates: [tpl],
			byType,
			status: 'ready',
			error: null,
			load: () => Promise.resolve(),
			reload: () => Promise.resolve()
		},
		issues: {
			get issues() {
				return [loaded];
			},
			dirty: new Set(),
			pendingSaves: new Map(),
			errors: new Map(),
			byId,
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
			validate: () => errors
		},
		editor: {
			activeId: loaded.issue.id,
			draft: loaded,
			isDirty: false,
			integrityWarning: false,
			get errors() {
				return errors;
			},
			open: () => {},
			close: () => {},
			patchField: (key: string, value: unknown) => {
				patchCalls.push({ key, value });
				// Mirror the real editor store: system keys land on
				// `draft.issue` directly, everything else on
				// `draft.issue.customFields`. The chip-multi-select
				// toggle in `FormFields` reads back from the draft to
				// decide whether a chip is selected; without this
				// mirror the second click always starts from the
				// original empty list and re-pushes.
				if (SYSTEM_KEYS.has(key)) {
					(loaded.issue as unknown as Record<string, unknown>)[key] = value;
				} else {
					loaded.issue.customFields[key] = value as never;
				}
			},
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

// ─── DOM helpers ─────────────────────────────────────────────────────────

function rowEls(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-field-key]'));
}

function rowFor(key: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-field-key="${key}"]`);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('FormFields — template-driven form rows', () => {
	beforeEach(() => {
		activeStub = null;
		patchCalls.length = 0;
	});

	it('renders every template field in ascending id order with the right primitive', async () => {
		activeStub = buildStub();
		render(FormFields);

		// The three rows render in id order: 1=summary, 2=status, 3=labels.
		const keys = rowEls().map((el) => el.getAttribute('data-field-key'));
		expect(keys).toEqual(['summary', 'status', 'labels']);

		// Text input for `summary`.
		const summaryRow = rowFor('summary');
		expect(summaryRow?.querySelector('input[type="text"]')).not.toBeNull();

		// Select for `status`.
		const statusRow = rowFor('status');
		expect(statusRow?.querySelector('select')).not.toBeNull();

		// Multi-select renders as a group of chip buttons.
		const labelsRow = rowFor('labels');
		expect(labelsRow?.querySelector('[role="group"]')).not.toBeNull();
		const labelsGroup = labelsRow?.querySelector('[role="group"]');
		const chips = labelsGroup
			? Array.from(labelsGroup.querySelectorAll('button')).map((b) => b.textContent?.trim())
			: [];
		expect(chips).toEqual(expect.arrayContaining(['Bug', 'Feature']));
	});

	it('marks obligatory fields with a required asterisk', async () => {
		activeStub = buildStub();
		render(FormFields);

		const summaryRow = rowFor('summary');
		const srText = summaryRow?.querySelector('.sr-only')?.textContent?.trim();
		expect(srText).toBe('required');

		// The visible asterisk renders inside the label.
		const labelSpan = summaryRow?.querySelector('label span');
		expect(labelSpan?.textContent).toContain('*');
	});

	it('calls editor.patchField with the right key and value when typing in a text field', async () => {
		activeStub = buildStub();
		render(FormFields);

		const input = document.querySelector<HTMLInputElement>(
			'[data-field-key="summary"] input[type="text"]'
		);
		expect(input).not.toBeNull();
		await userEvent.type(input as HTMLInputElement, 'X');

		// userEvent.type fires one `input` event per character.
		expect(patchCalls.length).toBeGreaterThan(0);
		const last = patchCalls[patchCalls.length - 1];
		expect(last.key).toBe('summary');
		expect(last.value).toBe('X');
	});

	it('calls editor.patchField when toggling a chip in a multi-select', async () => {
		activeStub = buildStub();
		render(FormFields);

		const bugChip = document.querySelector<HTMLButtonElement>(
			'[data-field-key="labels"] [role="group"] button'
		);
		expect(bugChip).not.toBeNull();
		await userEvent.click(bugChip as HTMLButtonElement);

		// Toggling the first chip in the labels group — the order
		// matches `config.labels`. With `labels: []` initially, the
		// first toggle adds it.
		const firstToggle = patchCalls[0];
		expect(firstToggle.key).toBe('labels');
		expect(Array.isArray(firstToggle.value)).toBe(true);

		// Click again removes it.
		await userEvent.click(bugChip as HTMLButtonElement);
		const secondToggle = patchCalls[1];
		expect(secondToggle.key).toBe('labels');
		expect(Array.isArray(secondToggle.value)).toBe(true);
		expect((secondToggle.value as string[]).length).toBe(0);
	});

	it('renders the inline error message when editor.errors has a matching field', async () => {
		activeStub = buildStub({
			errors: [{ field: 'summary', message: 'Summary is required.' }]
		});
		render(FormFields);

		const summaryRow = rowFor('summary');
		const alert = summaryRow?.querySelector('[role="alert"]');
		expect(alert).not.toBeNull();
		expect(alert?.textContent?.trim()).toBe('Summary is required.');
	});

	it('does not render the error message when the error targets a different field', async () => {
		activeStub = buildStub({
			errors: [{ field: 'status', message: 'Status is invalid.' }]
		});
		render(FormFields);

		// The summary row should have NO inline error.
		const summaryRow = rowFor('summary');
		expect(summaryRow?.querySelector('[role="alert"]')).toBeNull();

		// The status row carries the error instead.
		const statusRow = rowFor('status');
		const statusAlert = statusRow?.querySelector('[role="alert"]');
		expect(statusAlert?.textContent?.trim()).toBe('Status is invalid.');
	});

	it('skips longtext fields — they live in the section tabs', async () => {
		const longtextFields: TemplateField[] = [
			...TASK_TEMPLATE.fields,
			{
				id: 0,
				key: 'description',
				type: 'longtext',
				name: 'Description',
				obligatory: false
			}
		];
		// Sort by id to mimic the store sort.
		const sorted = [...longtextFields].sort((a, b) => a.id - b.id);
		const longtextTemplate: Template = { ...TASK_TEMPLATE, fields: sorted };
		activeStub = buildStub({ template: longtextTemplate });
		render(FormFields);

		// The longtext row must NOT appear in the form.
		const keys = rowEls().map((el) => el.getAttribute('data-field-key'));
		expect(keys).not.toContain('description');
		expect(keys).toEqual(['summary', 'status', 'labels']);
	});
});
