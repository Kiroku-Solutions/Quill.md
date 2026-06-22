/**
 * Tests for the issue serializer (`src/lib/services/serializer.ts`).
 *
 * The serializer is the write-path half of the round-trip. Coverage
 * targets:
 *  - Round-trip: serialize an `Issue` produced by the parser and re-parse
 *    it. The re-parsed issue must match the original on every field,
 *    including custom fields and integrity hash.
 *  - YAML key order: system keys appear first, in the canonical order,
 *    followed by custom fields, followed by `integrity_hash` last.
 *  - Section bodies: section markers and trailing newlines are emitted
 *    exactly once; consecutive sections are separated by a blank line.
 *  - Empty containers: empty `labels[]` / `relations[]` arrays are
 *    omitted from the frontmatter (lossy by design — see serializer.ts).
 *  - `canonicalForm`: equal to the serialized text with the integrity
 *    line stripped.
 */

import { describe, expect, it } from 'vitest';
import { canonicalForm, serializeIssue } from '$lib/services/serializer';
import { parseIssueFile } from '$lib/services/parser';
import { computeIntegrityHash, stripIntegrityHashLine } from '$lib/services/integrity';
import type { Issue } from '$lib/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
	return {
		id: 42,
		title: 'Fix login redirect',
		author: 'jane',
		creationDate: '2026-10-20',
		updatedDate: '2026-10-21',
		issueType: 'bug',
		status: 'in_progress',
		assignee: 'jane',
		labels: ['security', 'frontend'],
		relations: [
			{ type: 'blocks', id: 45 },
			{ type: 'relates_to', id: 7 }
		],
		startDate: '2026-10-20',
		endDate: null,
		duration: 3,
		integrityHash: null,
		customFields: { severity: 'high', priority: 'p1' },
		sections: [
			{ name: 'Description', markdown: '# Login form\n\nBody of description.' },
			{ name: 'Steps to reproduce', markdown: '1. Step one.\n2. Step two.' }
		],
		integrityWarning: false,
		...overrides
	};
}

describe('serializeIssue — basic shape', () => {
	it('emits the YAML frontmatter wrapped in --- fences', async () => {
		const text = await serializeIssue(makeIssue());
		expect(text.startsWith('---\n')).toBe(true);
		expect(text).toContain('\n---\n');
	});

	it('emits system keys in the canonical order', async () => {
		const text = await serializeIssue(makeIssue());
		const fm = text.split('---\n')[1] ?? '';
		const keyOrder = [
			'id:',
			'title:',
			'author:',
			'creation_date:',
			'updated_date:',
			'issue_type:',
			'status:',
			'assignee:',
			'labels:',
			'relations:',
			'start_date:',
			'duration:',
			'integrity_hash:'
		];
		let cursor = 0;
		for (const key of keyOrder) {
			const idx = fm.indexOf(key, cursor);
			expect(idx, `key ${key} should appear after cursor ${cursor}`).toBeGreaterThanOrEqual(cursor);
			cursor = idx + key.length;
		}
	});

	it('emits `integrity_hash` last in the frontmatter', async () => {
		const text = await serializeIssue(makeIssue());
		const fm = text.split('---\n')[1] ?? '';
		const lines = fm.split('\n').filter((l) => l.trim().length > 0);
		const last = lines[lines.length - 1] ?? '';
		expect(last.startsWith('integrity_hash:')).toBe(true);
	});

	it('force-quotes the integrity_hash value (ERS §6.1.3)', async () => {
		const text = await serializeIssue(makeIssue());
		expect(text).toMatch(/^integrity_hash: "sha256:[a-f0-9]{64}"$/m);
	});

	it('emits custom fields between system keys and integrity_hash', async () => {
		const text = await serializeIssue(makeIssue());
		const severityIdx = text.indexOf('severity:');
		const priorityIdx = text.indexOf('priority:');
		const integrityIdx = text.indexOf('integrity_hash:');
		expect(severityIdx).toBeGreaterThan(0);
		expect(priorityIdx).toBeGreaterThan(severityIdx);
		expect(integrityIdx).toBeGreaterThan(priorityIdx);
	});
});

describe('serializeIssue — section bodies', () => {
	it('wraps each section in <!-- [SECTION_START/END: name] --> markers', async () => {
		const text = await serializeIssue(makeIssue());
		expect(text).toContain('<!-- [SECTION_START: Description] -->');
		expect(text).toContain('<!-- [SECTION_END: Description] -->');
		expect(text).toContain('<!-- [SECTION_START: Steps to reproduce] -->');
		expect(text).toContain('<!-- [SECTION_END: Steps to reproduce] -->');
	});

	it('preserves section body verbatim (including blank lines)', async () => {
		const text = await serializeIssue(makeIssue());
		expect(text).toContain('# Login form');
		expect(text).toContain('Body of description.');
	});

	it('handles an issue with no sections', async () => {
		const text = await serializeIssue(makeIssue({ sections: [] }));
		expect(text).toContain('---');
		// The body region (after the closing --- fence) should be empty / whitespace.
		const body = text.split('---\n')[2] ?? '';
		expect(body.trim()).toBe('');
	});

	it('emits a trailing newline so consecutive sections are separated', async () => {
		const text = await serializeIssue(makeIssue());
		// Section blocks end with "...END: Description] -->\n"; the next
		// section starts on a new line.
		expect(text).toMatch(/\[SECTION_END: Description\] -->\n\n<!-- \[SECTION_START/);
	});
});

describe('serializeIssue — lossy behaviour for empty containers', () => {
	it('omits labels: when labels is empty', async () => {
		const text = await serializeIssue(makeIssue({ labels: [] }));
		expect(text).not.toMatch(/^labels:/m);
	});

	it('omits relations: when relations is empty', async () => {
		const text = await serializeIssue(makeIssue({ relations: [] }));
		expect(text).not.toMatch(/^relations:/m);
	});

	it('omits assignee: when assignee is null', async () => {
		const text = await serializeIssue(makeIssue({ assignee: null }));
		expect(text).not.toMatch(/^assignee:/m);
	});

	it('omits start_date: when startDate is null', async () => {
		const text = await serializeIssue(makeIssue({ startDate: null }));
		expect(text).not.toMatch(/^start_date:/m);
	});

	it('omits duration: when duration is null', async () => {
		const text = await serializeIssue(makeIssue({ duration: null }));
		expect(text).not.toMatch(/^duration:/m);
	});

	it('omits title: when title is the empty string', async () => {
		const text = await serializeIssue(makeIssue({ title: '' }));
		expect(text).not.toMatch(/^title:/m);
	});
});

describe('serializeIssue — round-trip via parseIssueFile', () => {
	it('re-parses to the same Issue (sans integrityHash metadata)', async () => {
		const original = makeIssue();
		const text = await serializeIssue(original);
		const reloaded = await parseIssueFile(text, 'memory://round-trip');

		expect(reloaded.issue.id).toBe(original.id);
		expect(reloaded.issue.title).toBe(original.title);
		expect(reloaded.issue.author).toBe(original.author);
		expect(reloaded.issue.creationDate).toBe(original.creationDate);
		expect(reloaded.issue.updatedDate).toBe(original.updatedDate);
		expect(reloaded.issue.issueType).toBe(original.issueType);
		expect(reloaded.issue.status).toBe(original.status);
		expect(reloaded.issue.assignee).toBe(original.assignee);
		expect(reloaded.issue.labels).toEqual(original.labels);
		expect(reloaded.issue.relations).toEqual(original.relations);
		expect(reloaded.issue.startDate).toBe(original.startDate);
		expect(reloaded.issue.duration).toBe(original.duration);
		expect(reloaded.issue.sections.map((s) => s.name)).toEqual(
			original.sections.map((s) => s.name)
		);
		expect(reloaded.issue.sections.map((s) => s.markdown)).toEqual(
			original.sections.map((s) => s.markdown)
		);
		// Custom fields round-trip
		expect(reloaded.issue.customFields).toEqual(original.customFields);
	});

	it('produces an integrity_hash that verifies on reload', async () => {
		const text = await serializeIssue(makeIssue());
		const reloaded = await parseIssueFile(text, 'memory://round-trip');
		expect(reloaded.issue.integrityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(reloaded.issue.integrityWarning).toBe(false);
	});

	it('canonicalForm matches serializeIssue minus the integrity line', async () => {
		const issue = makeIssue();
		const canonical = canonicalForm(issue);
		const serialized = await serializeIssue(issue);
		// Strip the integrity_hash line from the serialized form and compare.
		const stripped = stripIntegrityHashLine(serialized);
		expect(stripped).toBe(canonical);
	});

	it('canonicalForm is deterministic (same Issue → same canonical text)', () => {
		const a = canonicalForm(makeIssue());
		const b = canonicalForm(makeIssue());
		expect(a).toBe(b);
	});

	it('canonicalForm hashes deterministically (same canonical → same hash)', async () => {
		const canonical = canonicalForm(makeIssue());
		const hash1 = await computeIntegrityHash(canonical);
		const hash2 = await computeIntegrityHash(canonical);
		expect(hash1).toBe(hash2);
	});
});
