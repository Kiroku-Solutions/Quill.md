import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createIssueYDoc, isYDocSeeded } from './ydoc-factory';
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

describe('ydoc-factory', () => {
	describe('createIssueYDoc', () => {
		it('should seed a new Y.Doc from an Issue correctly', () => {
			const issue = createMockIssue();
			const ydoc = createIssueYDoc(issue);

			const metaMap = ydoc.getMap('meta');
			expect(metaMap.get('id')).toBe('TEST-123');
			expect(metaMap.get('integrityHash')).toBe('abc123hash');
			expect(metaMap.get('integrityWarning')).toBe(false);
			expect(metaMap.get('title')).toBe('Test Issue');
			expect(metaMap.get('status')).toBe('Open');
			expect(metaMap.get('labels')).toEqual(['bug']);

			const customFieldsMap = ydoc.getMap('customFields');
			expect(customFieldsMap.get('severity')).toBe('High');

			const sectionsMap = ydoc.getMap('sections');
			expect(sectionsMap.size).toBe(2);

			const descText = sectionsMap.get('Description') as Y.Text;
			expect(descText).toBeInstanceOf(Y.Text);
			expect(descText.toString()).toBe('This is a description.');

			const stepsText = sectionsMap.get('Steps') as Y.Text;
			expect(stepsText.toString()).toBe('1. Step 1\n2. Step 2');
		});

		it('should seed an existing Y.Doc in-place if provided', () => {
			const existingDoc = new Y.Doc();
			const issue = createMockIssue();

			const ydoc = createIssueYDoc(issue, existingDoc);
			expect(ydoc).toBe(existingDoc);

			const metaMap = ydoc.getMap('meta');
			expect(metaMap.get('id')).toBe('TEST-123');
		});
	});

	describe('isYDocSeeded', () => {
		it('should return false for a new empty Y.Doc', () => {
			const ydoc = new Y.Doc();
			expect(isYDocSeeded(ydoc)).toBe(false);
		});

		it('should return true for a seeded Y.Doc with sections', () => {
			const ydoc = createIssueYDoc(createMockIssue());
			expect(isYDocSeeded(ydoc)).toBe(true);
		});
	});
});
