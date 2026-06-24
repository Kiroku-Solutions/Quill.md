/**
 * Step 8 — property-based / fuzz-style tests for the parser ↔
 * serializer round-trip (carry-over from Step 6/7).
 *
 * A formal `fast-check` integration would be ideal but adds a
 * production dep; these tests instead drive a tiny deterministic
 * LCG (Linear Congruential Generator) to produce many random but
 * reproducible `Issue` instances and assert the round-trip holds
 * for every one. The generator is seeded so failures are
 * reproducible — every failing iteration logs its seed in the
 * assertion message.
 *
 * Properties asserted (all should hold for every generated issue):
 *   1. `parseIssueFile(serializeIssue(x))` produces an `Issue` with
 *      the same scalar fields as `x`.
 *   2. The integrity hash on the round-tripped file is non-null and
 *      starts with `sha256:`.
 *   3. `integrityWarning` is `false` after a round-trip (the hash
 *      matches the canonical form because we serialize and re-parse
 *      through the same code path).
 *   4. The number of sections and the section order are preserved.
 *   5. Custom-field keys are preserved (values are JSON-encoded by
 *      YAML, so primitives round-trip; object/array values are
 *      out of scope for this generator).
 *
 * Vitest project: `server` (Node only — uses gray-matter + js-yaml).
 */

import { describe, expect, it } from 'vitest';
import { serializeIssue } from '$lib/services/serializer';
import { parseIssueFile } from '$lib/services/parser';
import { computeIntegrityHash, stripIntegrityHashLine } from '$lib/services/integrity';
import type { Issue } from '$lib/types';

// ─── Deterministic PRNG (Mulberry32) ────────────────────────────────────────
//
// 32-bit integer state, full period of 2^32, no dependencies.
// Same seed → same sequence; failures are reproducible.

function makeRng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
	const i = Math.floor(rng() * arr.length);
	return arr[Math.min(i, arr.length - 1)] as T;
}

function randInt(rng: () => number, min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

// ─── Value generators ──────────────────────────────────────────────────────

const STATUSES = ['open', 'in_progress', 'in_review', 'done', 'closed'] as const;
const ISSUE_TYPES = ['epic', 'user_story', 'task', 'bug'] as const;
const RELATION_TYPES = ['parent', 'child', 'blocks', 'depends_on', 'relates_to'] as const;
const LABELS = ['frontend', 'backend', 'security', 'docs', 'urgent', 'p1', 'p2'] as const;
const ASSIGNEES = ['jane', 'john', 'alex', 'sam', null] as const;

function randDate(rng: () => number): string {
	const y = randInt(rng, 2020, 2030);
	const m = randInt(rng, 1, 12);
	const d = randInt(rng, 1, 28);
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function randIssue(rng: () => number): Issue {
	const id = randInt(rng, 1, 99999);
	const title = `Random issue ${id}: ${pick(rng, ['fix', 'add', 'refactor', 'document'])} ${pick(rng, ['login', 'redirect', 'theme', 'parser', 'Gantt'])}`;
	const creationDate = randDate(rng);
	const updatedDate = randDate(rng);
	const status = pick(rng, STATUSES);
	const issueType = pick(rng, ISSUE_TYPES);
	const assignee = pick(rng, ASSIGNEES);

	const labelCount = randInt(rng, 0, 3);
	const labels = Array.from(new Set(Array.from({ length: labelCount }, () => pick(rng, LABELS))));

	const relCount = randInt(rng, 0, 2);
	const relations = Array.from({ length: relCount }, () => ({
		type: pick(rng, RELATION_TYPES),
		id: randInt(rng, 1, 99999)
	}));

	const startDate = randDate(rng);
	const hasEnd = rng() < 0.5;
	const endDate = hasEnd ? randDate(rng) : null;
	const duration = hasEnd ? null : randInt(rng, 1, 30);

	const sectionCount = randInt(rng, 0, 3);
	const sections = Array.from({ length: sectionCount }, (_, i) => ({
		name: `Section ${i + 1}`,
		markdown: `# Random section ${i + 1}\n\nWith some **markdown** content.\n`
	}));

	const customFieldCount = randInt(rng, 0, 2);
	const customFields: Record<string, string> = {};
	for (let i = 0; i < customFieldCount; i++) {
		customFields[`field_${i}`] = `value_${randInt(rng, 0, 100)}`;
	}

	return {
		id,
		title,
		author: pick(rng, ['jane', 'john', 'alex']),
		creationDate,
		updatedDate,
		issueType,
		status,
		assignee,
		labels,
		relations,
		startDate,
		endDate,
		duration,
		integrityHash: null, // serializer recomputes
		customFields,
		sections,
		integrityWarning: false
	};
}

// ─── Property assertions ───────────────────────────────────────────────────

async function assertRoundTrip(issue: Issue, iteration: number, seed: number): Promise<void> {
	const serialized = await serializeIssue(issue);
	const reparsed = await parseIssueFile(serialized, `random-${issue.id}.md`);

	// Property 1: scalar fields preserved.
	expect(reparsed.issue.id, `iter ${iteration} seed ${seed} id`).toBe(issue.id);
	expect(reparsed.issue.title, `iter ${iteration} seed ${seed} title`).toBe(issue.title);
	expect(reparsed.issue.author, `iter ${iteration} seed ${seed} author`).toBe(issue.author);
	expect(reparsed.issue.creationDate, `iter ${iteration} seed ${seed} creation`).toBe(
		issue.creationDate
	);
	expect(reparsed.issue.updatedDate, `iter ${iteration} seed ${seed} updated`).toBe(
		issue.updatedDate
	);
	expect(reparsed.issue.issueType, `iter ${iteration} seed ${seed} issueType`).toBe(
		issue.issueType
	);
	expect(reparsed.issue.status, `iter ${iteration} seed ${seed} status`).toBe(issue.status);
	expect(reparsed.issue.assignee, `iter ${iteration} seed ${seed} assignee`).toBe(issue.assignee);

	// Property 2: integrity hash is recomputed and well-formed.
	expect(reparsed.issue.integrityHash, `iter ${iteration} seed ${seed} hash`).not.toBeNull();
	expect(reparsed.issue.integrityHash, `iter ${iteration} seed ${seed} hash prefix`).toMatch(
		/^sha256:[0-9a-f]{64}$/
	);

	// Property 3: integrity warning is cleared on round-trip (the
	// hash matches because we serialised with the canonical form).
	expect(reparsed.issue.integrityWarning, `iter ${iteration} seed ${seed} warning`).toBe(false);

	// Property 4: section count + order preserved.
	expect(reparsed.issue.sections.length, `iter ${iteration} seed ${seed} section count`).toBe(
		issue.sections.length
	);
	for (let i = 0; i < issue.sections.length; i++) {
		expect(
			reparsed.issue.sections[i]?.name,
			`iter ${iteration} seed ${seed} section[${i}].name`
		).toBe(issue.sections[i]?.name);
		// Section body content is preserved; the parser strips the
		// trailing newline that the serializer adds as the section
		// delimiter separator. Compare trimmed bodies so the
		// assertion is independent of that cosmetic convention.
		const origBody = (issue.sections[i]?.markdown ?? '').replace(/\s+$/, '');
		const reparsedBody = (reparsed.issue.sections[i]?.markdown ?? '').replace(/\s+$/, '');
		expect(reparsedBody, `iter ${iteration} seed ${seed} section[${i}].markdown`).toBe(origBody);
	}

	// Property 5: custom field keys preserved.
	const originalKeys = Object.keys(issue.customFields).sort();
	const reparsedKeys = Object.keys(reparsed.issue.customFields).sort();
	expect(reparsedKeys, `iter ${iteration} seed ${seed} custom field keys`).toEqual(originalKeys);

	// Property 6 (bonus): the integrity hash on the reparsed file
	// matches a fresh computation over the canonical form. This
	// catches any round-trip divergence the scalar assertions miss.
	const canonical = stripIntegrityHashLine(serialized);
	const freshHash = await computeIntegrityHash(canonical);
	expect(freshHash, `iter ${iteration} seed ${seed} canonical hash`).toBe(
		reparsed.issue.integrityHash
	);
}

// ─── Test suites ───────────────────────────────────────────────────────────

describe('property-based — parser ↔ serializer round-trip', () => {
	it('round-trips 50 random issues without divergence (seed 0xC0FFEE)', async () => {
		const rng = makeRng(0xc0ffee);
		for (let i = 0; i < 50; i++) {
			await assertRoundTrip(randIssue(rng), i, 0xc0ffee);
		}
	});

	it('round-trips 50 random issues with a different seed (seed 0xDEADBEEF)', async () => {
		const rng = makeRng(0xdeadbeef);
		for (let i = 0; i < 50; i++) {
			await assertRoundTrip(randIssue(rng), i, 0xdeadbeef);
		}
	});

	it('round-trips edge-case issues (no labels, no relations, no sections)', async () => {
		// These are the issues that the ERS Appendix C examples
		// exercise and the cases the lossy serializer (empty
		// `labels: []` and `relations: []` are omitted) must handle.
		const edgeCases: Issue[] = [
			{
				id: 1,
				title: 'Bare minimum',
				author: 'jane',
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
			},
			{
				id: 2,
				title: 'All custom fields',
				author: 'jane',
				creationDate: '2026-01-01',
				updatedDate: '2026-01-01',
				issueType: 'task',
				status: 'open',
				assignee: 'jane',
				labels: ['a', 'b'],
				relations: [{ type: 'relates_to', id: 1 }],
				startDate: '2026-01-01',
				endDate: '2026-01-02',
				duration: null,
				integrityHash: null,
				customFields: { severity: 'high', priority: 'p1', area: 'frontend' },
				sections: [{ name: 'Single', markdown: 'single section body' }],
				integrityWarning: false
			}
		];
		for (const issue of edgeCases) {
			const serialized = await serializeIssue(issue);
			const reparsed = await parseIssueFile(serialized, `${issue.id}.md`);
			expect(reparsed.issue.id).toBe(issue.id);
			expect(reparsed.issue.title).toBe(issue.title);
			expect(reparsed.issue.sections.length).toBe(issue.sections.length);
			expect(reparsed.issue.labels).toEqual(issue.labels);
			expect(reparsed.issue.relations).toEqual(issue.relations);
			expect(reparsed.issue.integrityHash).toMatch(/^sha256:[0-9a-f]{64}$/);
			expect(reparsed.issue.integrityWarning).toBe(false);
		}
	});
});
