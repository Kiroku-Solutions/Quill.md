/**
 * Tests for {@link parseIssueFile} (`src/lib/services/parser.ts`).
 *
 * The parser is the read-path half of the round-trip (counterpart to
 * the serializer covered by `serializer.test.ts`). Coverage targets:
 *  - Empty file → `Issue` with system defaults + `integrityWarning = true`.
 *  - Frontmatter-only file → `sections: []`.
 *  - Single / multiple section bodies, in document order.
 *  - Missing section-end marker → section is silently dropped (parser
 *    is tolerant; section only commits on the matching END).
 *  - FR-15 integrity hash: matches → `integrityWarning = false`,
 *    mismatch → `true`, missing key → `true`, missing prefix → `true`.
 *  - `relations` parsing: every FR-9 type + invalid entries (unknown
 *    type, non-numeric id, non-array).
 *  - Date fields: ISO string, epoch number, null, missing.
 *  - Custom fields: every non-system key is routed into `customFields`
 *    in insertion order; system keys never leak into `customFields`.
 */
import { describe, expect, it } from 'vitest';
import { parseIssueFile } from '$lib/services/parser';
import { computeIntegrityHash, stripIntegrityHashLine } from '$lib/services/integrity';

/**
 * Replace the `__HASH__` placeholder with a freshly-computed integrity
 * hash so the parser sees a file whose hash round-trips successfully.
 */
async function withValidHash(text: string): Promise<string> {
	const stripped = stripIntegrityHashLine(text);
	const hash = await computeIntegrityHash(stripped);
	return text.replace('__HASH__', hash);
}

describe('parseIssueFile — file shape', () => {
	it('returns default-shaped Issue for an empty file', async () => {
		const { issue, sourcePath } = await parseIssueFile('', 'memory://empty.md');
		expect(issue.id).toBe(0);
		expect(issue.fields.title).toBe('');
		expect(issue.fields.author).toBe('');
		expect(issue.fields.creationDate).toBe('');
		expect(issue.sections).toEqual([]);
		expect(issue.customFields).toEqual({});
		// No integrity_hash line at all → warning.
		expect(issue.integrityWarning).toBe(true);
		expect(sourcePath).toBe('memory://empty.md');
	});

	it('parses frontmatter-only files with no body sections', async () => {
		const text = '---\nid: 5\ntitle: Foo\nstatus: open\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://fm-only.md');
		expect(issue.id).toBe(5);
		expect(issue.fields.title).toBe('Foo');
		expect(issue.fields.status).toBe('open');
		expect(issue.sections).toEqual([]);
	});

	it('parses a single section in the body', async () => {
		const text =
			'---\nid: 1\ntitle: Test\nintegrity_hash: "__HASH__"\n---\n\n' +
			'<!-- [SECTION_START: Description] -->\nHello world.\n<!-- [SECTION_END: Description] -->\n';
		const valid = await withValidHash(text);
		const { issue } = await parseIssueFile(valid, 'memory://one-section.md');
		expect(issue.sections).toEqual([{ name: 'Description', markdown: 'Hello world.' }]);
		expect(issue.integrityWarning).toBe(false);
	});

	it('parses multiple sections in document order', async () => {
		const text =
			'---\nid: 1\ntitle: Test\nintegrity_hash: "__HASH__"\n---\n\n' +
			'<!-- [SECTION_START: Description] -->\nA.\n<!-- [SECTION_END: Description] -->\n\n' +
			'<!-- [SECTION_START: Notes] -->\nB.\n<!-- [SECTION_END: Notes] -->\n\n' +
			'<!-- [SECTION_START: Steps] -->\nC.\n<!-- [SECTION_END: Steps] -->\n';
		const valid = await withValidHash(text);
		const { issue } = await parseIssueFile(valid, 'memory://multi-section.md');
		expect(issue.sections.map((s) => s.name)).toEqual(['Description', 'Notes', 'Steps']);
		expect(issue.sections.map((s) => s.markdown)).toEqual(['A.', 'B.', 'C.']);
	});

	it('silently drops a section with no matching closing marker', async () => {
		// The parser only commits a section on the matching END marker.
		// An unclosed section is therefore discarded (no half-baked entry
		// leaks into the in-memory Issue).
		const text =
			'---\nid: 1\ntitle: Test\nintegrity_hash: "__HASH__"\n---\n\n' +
			'<!-- [SECTION_START: Description] -->\nBody content.\nNo closing marker here.\n';
		const valid = await withValidHash(text);
		const { issue } = await parseIssueFile(valid, 'memory://no-close.md');
		expect(issue.sections).toEqual([]);
	});
});

describe('parseIssueFile — integrity hash (FR-15)', () => {
	it('flags integrityWarning = false when the stored hash matches a fresh recompute', async () => {
		const text = '---\nid: 1\ntitle: Test\nintegrity_hash: "__HASH__"\n---\n';
		const valid = await withValidHash(text);
		const { issue } = await parseIssueFile(valid, 'memory://match.md');
		expect(issue.integrityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(issue.integrityWarning).toBe(false);
	});

	it('flags integrityWarning = true when the stored hash does not match', async () => {
		const text = `---\nid: 1\ntitle: Test\nintegrity_hash: "sha256:${'0'.repeat(64)}"\n---\n`;
		const { issue } = await parseIssueFile(text, 'memory://mismatch.md');
		expect(issue.integrityHash).toBe(`sha256:${'0'.repeat(64)}`);
		expect(issue.integrityWarning).toBe(true);
	});

	it('flags integrityWarning = true when the integrity_hash key is absent', async () => {
		const text = '---\nid: 1\ntitle: Test\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://no-hash.md');
		expect(issue.integrityHash).toBeNull();
		expect(issue.integrityWarning).toBe(true);
	});

	it('flags integrityWarning = true when the stored hash is missing the sha256: prefix', async () => {
		// A downgraded-algorithm / typo'd hash must not silently pass.
		const text = '---\nid: 1\ntitle: Test\nintegrity_hash: "abc123"\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://bad-prefix.md');
		expect(issue.integrityWarning).toBe(true);
	});
});

describe('parseIssueFile — relations (FR-9)', () => {
	function withRelations(relsBlock: string): string {
		return `---\nid: 1\ntitle: T\nrelations:\n${relsBlock}---\n`;
	}

	it('parses all five valid relation types', async () => {
		const text = withRelations(
			'  - type: parent\n    id: 2\n' +
				'  - type: child\n    id: 3\n' +
				'  - type: blocks\n    id: 4\n' +
				'  - type: depends_on\n    id: 5\n' +
				'  - type: relates_to\n    id: 6\n'
		);
		const { issue } = await parseIssueFile(text, 'memory://relations.md');
		expect(issue.fields.relations).toEqual([
			{ type: 'parent', id: 2 },
			{ type: 'child', id: 3 },
			{ type: 'blocks', id: 4 },
			{ type: 'depends_on', id: 5 },
			{ type: 'relates_to', id: 6 }
		]);
	});

	it('drops relations with an unknown type', async () => {
		const text = withRelations(
			'  - type: parent\n    id: 2\n' + '  - type: frobnitz\n    id: 99\n'
		);
		const { issue } = await parseIssueFile(text, 'memory://bad-type.md');
		expect(issue.fields.relations).toEqual([{ type: 'parent', id: 2 }]);
	});

	it('drops relations with a non-numeric id', async () => {
		const text = withRelations(
			'  - type: parent\n    id: "not-a-number"\n' + '  - type: child\n    id: 5\n'
		);
		const { issue } = await parseIssueFile(text, 'memory://bad-id.md');
		expect(issue.fields.relations).toEqual([{ type: 'child', id: 5 }]);
	});

	it('returns [] when relations is not an array', async () => {
		const text = '---\nid: 1\ntitle: T\nrelations: "not an array"\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://not-array.md');
		expect(issue.fields.relations).toEqual([]);
	});
});

describe('parseIssueFile — date fields', () => {
	it('accepts ISO date strings (quoted and unquoted)', async () => {
		const text =
			'---\nid: 1\ncreation_date: 2026-01-15\nupdated_date: "2026-02-20"\nstart_date: 2026-03-01\nend_date: null\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://date-str.md');
		expect(issue.fields.creationDate).toBe('2026-01-15');
		expect(issue.fields.updatedDate).toBe('2026-02-20');
		expect(issue.fields.startDate).toBe('2026-03-01');
		expect(issue.fields.endDate).toBeNull();
	});

	it('accepts numeric epoch timestamps (ms) for the same fields', async () => {
		// 1736899200000 ms = 2025-01-15T00:00:00Z.
		const text = '---\nid: 1\ncreation_date: 1736899200000\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://date-num.md');
		expect(issue.fields.creationDate).toBe('2025-01-15');
	});

	it('returns null for null / missing nullable date fields', async () => {
		const text = '---\nid: 1\nstart_date: null\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://date-null.md');
		expect(issue.fields.startDate).toBeNull();
		expect(issue.fields.endDate).toBeNull();
	});

	it('returns "" for missing required date fields (creationDate / updatedDate)', async () => {
		// Required fields default to "" rather than null so the UI can
		// render a placeholder without a separate "missing" branch.
		const text = '---\nid: 1\ntitle: T\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://date-missing.md');
		expect(issue.fields.creationDate).toBe('');
		expect(issue.fields.updatedDate).toBe('');
	});
});

describe('parseIssueFile — custom fields', () => {
	it('routes non-system keys into customFields and preserves insertion order', async () => {
		const text = '---\nid: 1\ntitle: T\nseverity: high\npriority: p1\nstory_points: 5\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://custom.md');
		expect(issue.customFields).toEqual({
			severity: 'high',
			priority: 'p1',
			story_points: 5
		});
		expect(Object.keys(issue.customFields)).toEqual(['severity', 'priority', 'story_points']);
	});

	it('never leaks system keys into customFields even when they are present', async () => {
		const text = '---\nid: 7\ntitle: T\nstatus: open\nlabels: [a]\n---\n';
		const { issue } = await parseIssueFile(text, 'memory://syskey.md');
		expect(issue.customFields).toEqual({});
		expect(issue.id).toBe(7);
		expect(issue.fields.title).toBe('T');
		expect(issue.fields.status).toBe('open');
		expect(issue.fields.labels).toEqual(['a']);
	});
});
