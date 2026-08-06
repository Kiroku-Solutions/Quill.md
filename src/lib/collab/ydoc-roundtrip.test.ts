import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createIssueYDoc } from './ydoc-factory';
import { serializeYDoc } from './ydoc-serializer';
import type { Issue } from '../types/issue';

const createMockIssue = (): Issue => ({
	id: 'TEST-123',
	fields: {
		title: 'Test Issue',
		author: 'Alice',
		creationDate: '2026-08-05',
		updatedDate: '2026-08-05',
		issueType: 'Bug',
		status: 'Open',
		assignee: null,
		labels: ['bug'],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		sprintId: null,
		estimate: null
	},
	customFields: {
		severity: 'High'
	},
	sections: [
		{ name: 'Description', markdown: 'This is a description.' },
		{ name: 'Steps', markdown: '1. Step 1\n2. Step 2' }
	],
	integrityHash: 'abc123hash',
	integrityWarning: false
});

describe('ydoc-roundtrip', () => {
	it('should maintain fidelity across multiple mutations (Issue -> Y.Doc -> Y.Text mutation -> serialize -> Issue)', () => {
		const originalIssue = createMockIssue();

		// 1. Seed
		const ydoc = createIssueYDoc(originalIssue);

		// 2. Mutate frontmatter
		const metaMap = ydoc.getMap('meta');
		metaMap.set('status', 'Closed');

		// 3. Mutate sections using CRDT operations
		const sectionsMap = ydoc.getMap('sections');

		// Modify Description
		const descText = sectionsMap.get('Description') as Y.Text;
		descText.insert(descText.length, ' It has been resolved.');

		// Modify Steps
		const stepsText = sectionsMap.get('Steps') as Y.Text;
		stepsText.delete(3, 6); // Delete "Step 1"
		stepsText.insert(3, 'Done 1'); // Insert "Done 1"

		// 4. Serialize
		const newIssue = serializeYDoc(ydoc);

		// 5. Assert expected changes
		expect(newIssue.fields.status).toBe('Closed');

		const newDesc = newIssue.sections.find((s) => s.name === 'Description')?.markdown;
		expect(newDesc).toBe('This is a description. It has been resolved.');

		const newSteps = newIssue.sections.find((s) => s.name === 'Steps')?.markdown;
		expect(newSteps).toBe('1. Done 1\n2. Step 2');

		// Ensure unmutated parts remain untouched
		expect(newIssue.fields.title).toBe(originalIssue.fields.title);
		expect(newIssue.customFields).toEqual(originalIssue.customFields);
		expect(newIssue.integrityHash).toBe(originalIssue.integrityHash);
	});

	it('should gracefully handle and merge concurrent edits (CRDT convergence)', () => {
		const docA = new Y.Doc();
		const docB = new Y.Doc();

		const issue = createMockIssue();
		createIssueYDoc(issue, docA);

		// Sync docB initially
		Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

		// Client A inserts text at the beginning
		const descA = docA.getMap('sections').get('Description') as Y.Text;
		descA.insert(0, 'Hello ');

		// Client B concurrently inserts text at the beginning without seeing A's edit
		const descB = docB.getMap('sections').get('Description') as Y.Text;
		descB.insert(0, 'World ');

		// Exchange updates to simulate network sync
		Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
		Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

		// Both docs should converge to the exact same state deterministically
		expect(descA.toString()).toBe(descB.toString());
		expect(descA.toString().length).toBeGreaterThan('This is a description.'.length);

		// Serialize and verify
		const finalIssue = serializeYDoc(docA);
		const finalDesc = finalIssue.sections.find((s) => s.name === 'Description')?.markdown;
		expect(finalDesc).toBe(descA.toString());
	});
});
