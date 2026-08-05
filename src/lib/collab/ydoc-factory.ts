import * as Y from 'yjs';
import type { Issue } from '../types/issue.ts';

/**
 * Seeds a Y.Doc from a parsed Issue object.
 * If an existing Y.Doc is provided, it will be populated in-place.
 */
export function createIssueYDoc(issue: Issue, existingDoc?: Y.Doc): Y.Doc {
	const ydoc = existingDoc ?? new Y.Doc();

	// 1. Meta (System fields)
	const metaMap = ydoc.getMap('meta');
	metaMap.set('id', issue.id);
	metaMap.set('integrityHash', issue.integrityHash ?? null);
	metaMap.set('integrityWarning', issue.integrityWarning);
	for (const [key, value] of Object.entries(issue.fields)) {
		metaMap.set(key, value);
	}

	// 2. Custom fields
	const customFieldsMap = ydoc.getMap('customFields');
	for (const [key, value] of Object.entries(issue.customFields)) {
		customFieldsMap.set(key, value);
	}

	// 3. Sections
	const sectionsMap = ydoc.getMap('sections');
	for (const section of issue.sections) {
		const ytext = new Y.Text(section.markdown);
		sectionsMap.set(section.name, ytext);
	}

	return ydoc;
}

/**
 * Returns true if the Y.Doc has any content seeded into it
 * (i.e. has a 'sections' map with at least one entry).
 */
export function isYDocSeeded(ydoc: Y.Doc): boolean {
	const sectionsMap = ydoc.getMap('sections');
	return sectionsMap.size > 0;
}
