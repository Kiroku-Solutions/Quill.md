import * as Y from 'yjs';
import type { Issue } from '../types/issue.ts';

/**
 * Seeds a Y.Doc from a parsed Issue object.
 */
export function createIssueYDoc(issue: Issue): Y.Doc {
	const ydoc = new Y.Doc();

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
