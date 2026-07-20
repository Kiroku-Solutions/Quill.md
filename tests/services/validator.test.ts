/**
 * Tests for {@link validateIssue} (src/lib/services/validator.ts).
 *
 * Coverage focus: the cycle-detection fix in `detectCycles` (audit A12).
 * The fix replaced a per-edge loop that produced duplicate entries for each
 * node on a cycle with a dedup-on-the-cycle step (`[...new Set(cycle)]`).
 * These tests pin the resulting behaviour so a regression to the old
 * loop would fail loudly.
 *
 * Also covers the broader validation surface (self-relation, unknown
 * relation type, dangling relation target, missing required fields) so
 * the fixture helpers and the public API stay trustworthy for future
 * tests.
 */
import { describe, expect, it } from 'vitest';
import { validateIssue } from '$lib/services/validator';
import type { Config, Issue, Relation, Template } from '$lib/types/index';

/** A minimal `Template` that matches every issue shape used in the tests. */
const template: Template = {
	id: 'task',
	name: 'Task',
	icon: 'check',
	color: '#000',
	default_status: 'open',
	fields: [],
	sections: []
};

/** A minimal `Config` whose statuses match the issues' status field. */
const config: Config = {
	product_goal: '',
	definition_of_done: [],
	statuses: [{ id: 'open', name: 'Open', color: '#fff', category: 'todo' }],
	default_status: 'open',
	labels: [],
	users: [],
	kanban: { columns: ['open'] },
	gantt: { group_by: 'status', default_view: 'day' },
	remote: { cors_proxy: '' }
};

/** Build an `Issue` with the given id and relations. All other fields are stub. */
function makeIssue(id: number, relations: readonly Relation[] = []): Issue {
	return {
		id,
		fields: {
			title: `Issue ${id}`,
			author: 'tester',
			creationDate: '2026-01-01',
			updatedDate: '2026-01-01',
			issueType: 'task',
			status: 'open',
			assignee: null,
			labels: [],
			relations: relations.map((r) => ({ ...r })),
			startDate: null,
			endDate: null,
			duration: null,
			sprintId: null,
			estimate: null
		},
		integrityHash: null,
		customFields: {},
		sections: [],
		integrityWarning: false
	};
}

const baseContext = {
	templates: [template],
	config,
	allIssues: [] as readonly Issue[]
};

describe('validateIssue — cycle detection (audit A12)', () => {
	it('flags a 2-node cycle A → B → A as a single cycle entry per node', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 2 }]);
		const b = makeIssue(2, [{ type: 'blocks', id: 1 }]);
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b] });

		// Exactly one error, attributed to the `relations` field.
		const cycleErrors = result.errors.filter((e) => e.field === 'relations');
		expect(cycleErrors).toHaveLength(1);
		expect(cycleErrors[0]?.message).toMatch(/cycle/i);
		// Both endpoints are mentioned so the UI can navigate.
		expect(cycleErrors[0]?.message).toContain('1');
		expect(cycleErrors[0]?.message).toContain('2');
	});

	it('flags a 3-node cycle A → B → C → A', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 2 }]);
		const b = makeIssue(2, [{ type: 'blocks', id: 3 }]);
		const c = makeIssue(3, [{ type: 'blocks', id: 1 }]);
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b, c] });

		expect(result.errors.some((e) => e.field === 'relations' && /cycle/i.test(e.message))).toBe(
			true
		);
	});

	it('deduplicates repeated nodes inside a cycle (A → B → C → B → A)', () => {
		// Without the `uniqueCycle` fix, the inner `B` would be recorded twice
		// in the errors Map for the A → B → C → B → A walk.
		const a = makeIssue(1, [{ type: 'blocks', id: 2 }]);
		const b = makeIssue(2, [
			{ type: 'blocks', id: 3 },
			{ type: 'blocks', id: 1 } // also from B back to A, completing the cycle twice
		]);
		const c = makeIssue(3, [{ type: 'blocks', id: 2 }]); // C → B
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b, c] });

		const cycleErrors = result.errors.filter((e) => e.field === 'relations');
		// Exactly one cycle error per node involved, not duplicated.
		expect(cycleErrors).toHaveLength(1);
	});

	it('does not flag a directed acyclic graph', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 2 }]);
		const b = makeIssue(2, [{ type: 'blocks', id: 3 }]);
		const c = makeIssue(3);
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b, c] });
		expect(
			result.errors.filter((e) => e.field === 'relations' && /cycle/i.test(e.message))
		).toEqual([]);
	});

	it('ignores `relates_to` edges for cycle detection (per ERS §3.1 FR-9)', () => {
		// A relates_to B, B relates_to A — soft links must NOT be considered
		// a cycle even though they form a closed loop in the full graph.
		const a = makeIssue(1, [{ type: 'relates_to', id: 2 }]);
		const b = makeIssue(2, [{ type: 'relates_to', id: 1 }]);
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b] });
		expect(
			result.errors.filter((e) => e.field === 'relations' && /cycle/i.test(e.message))
		).toEqual([]);
	});

	it('ignores dangling edges (target does not exist)', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 999 }]);
		// 999 is not in allIssues — the relation is flagged as dangling, but the
		// cycle detector must not crash on the missing target.
		const result = validateIssue(a, { ...baseContext, allIssues: [a] });
		// Dangling edge produces its own error; no cycle error.
		expect(
			result.errors.some(
				(e) => e.field.startsWith('relations') && /does not exist/i.test(e.message)
			)
		).toBe(true);
		expect(result.errors.filter((e) => /cycle/i.test(e.message))).toEqual([]);
	});
});

describe('validateIssue — relation rules', () => {
	it('rejects self-relations as a relation error, not a cycle error', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 1 }]);
		const result = validateIssue(a, { ...baseContext, allIssues: [a] });
		expect(
			result.errors.some((e) => e.field === 'relations[0].id' && /itself/i.test(e.message))
		).toBe(true);
	});

	it('rejects unknown relation types', () => {
		// Cast through `unknown` because the strict `RelationType` union would
		// otherwise reject this at compile time — the validator must still
		// cope with malformed input arriving from the YAML loader.
		const a = makeIssue(1, [{ type: 'unknown_type' as unknown as Relation['type'], id: 2 }]);
		const b = makeIssue(2);
		const result = validateIssue(a, { ...baseContext, allIssues: [a, b] });
		expect(
			result.errors.some(
				(e) => e.field === 'relations[0].type' && /Unknown relation/i.test(e.message)
			)
		).toBe(true);
	});

	it('rejects relation targets that do not exist', () => {
		const a = makeIssue(1, [{ type: 'blocks', id: 999 }]);
		const result = validateIssue(a, { ...baseContext, allIssues: [a] });
		expect(result.errors.some((e) => /does not exist/i.test(e.message))).toBe(true);
	});
});

describe('validateIssue — basic field rules', () => {
	it('rejects non-positive ids', () => {
		const issue = makeIssue(0);
		const result = validateIssue(issue, baseContext);
		expect(result.errors.some((e) => e.field === 'id' && /positive/i.test(e.message))).toBe(true);
	});

	it('rejects empty titles', () => {
		const base = makeIssue(1);
		const issue: Issue = { ...base, fields: { ...base.fields, title: '   ' } };
		const result = validateIssue(issue, baseContext);
		expect(result.errors.some((e) => e.field === 'title' && /required/i.test(e.message))).toBe(
			true
		);
	});

	it('rejects unknown status against the config', () => {
		const base = makeIssue(1);
		const issue: Issue = { ...base, fields: { ...base.fields, status: 'mystery' } };
		const result = validateIssue(issue, baseContext);
		expect(
			result.errors.some((e) => e.field === 'status' && /Unknown status/i.test(e.message))
		).toBe(true);
	});

	it('returns ok=true for a well-formed issue', () => {
		const issue = makeIssue(1);
		const result = validateIssue(issue, baseContext);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});
});
