import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { serializeYDoc } from './ydoc-serializer';
import { createIssueYDoc } from './ydoc-factory';
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
		labels: ['bug', 'urgent'],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		sprintId: null,
		estimate: 5
	},
	customFields: {
		severity: 'High',
		team: 'Backend'
	},
	sections: [
		{ name: 'Description', markdown: 'This is a description.' },
		{ name: 'Steps', markdown: '1. Step 1\n2. Step 2' }
	],
	integrityHash: 'abc123hash',
	integrityWarning: false
});

describe('ydoc-serializer', () => {
	describe('serializeYDoc', () => {
		it('should accurately reconstruct an Issue object from a Y.Doc', () => {
			const originalIssue = createMockIssue();
			const ydoc = createIssueYDoc(originalIssue);

			const reconstructedIssue = serializeYDoc(ydoc);

			expect(reconstructedIssue).toEqual(originalIssue);
		});

		it('should handle empty fields or missing sections gracefully', () => {
			const issueWithMissingFields = createMockIssue();
			issueWithMissingFields.sections = [];
			issueWithMissingFields.customFields = {};

			const ydoc = createIssueYDoc(issueWithMissingFields);
			const reconstructedIssue = serializeYDoc(ydoc);

			expect(reconstructedIssue).toEqual(issueWithMissingFields);
			expect(reconstructedIssue.sections).toEqual([]);
			expect(reconstructedIssue.customFields).toEqual({});
		});

		it('should reflect direct mutations made to the Y.Doc', () => {
			const issue = createMockIssue();
			const ydoc = createIssueYDoc(issue);

			// Mutate fields
			const metaMap = ydoc.getMap('meta');
			metaMap.set('title', 'Updated Title');
			metaMap.set('status', 'In Progress');

			// Mutate custom fields
			const customFieldsMap = ydoc.getMap('customFields');
			customFieldsMap.set('severity', 'Critical');

			// Mutate sections
			const sectionsMap = ydoc.getMap('sections');
			const descText = sectionsMap.get('Description') as Y.Text;
			descText.insert(descText.length, ' Appended text.');

			const reconstructedIssue = serializeYDoc(ydoc);

			expect(reconstructedIssue.fields.title).toBe('Updated Title');
			expect(reconstructedIssue.fields.status).toBe('In Progress');
			expect(reconstructedIssue.customFields['severity']).toBe('Critical');
			expect(reconstructedIssue.sections.find((s) => s.name === 'Description')?.markdown).toBe(
				'This is a description. Appended text.'
			);
		});
	});

	describe('Negative paths', () => {
		it('should throw a typed error when the Y.Doc is completely invalid (missing ID)', () => {
			const ydoc = new Y.Doc();
			// We only seed the meta map but omit 'id'
			const metaMap = ydoc.getMap('meta');
			metaMap.set('title', 'Invalid Issue');

			expect(() => serializeYDoc(ydoc)).toThrowError(
				'Invalid Y.Doc: missing required ID in meta map'
			);
		});
	});
});
