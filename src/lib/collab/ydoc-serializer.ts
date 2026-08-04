import * as Y from 'yjs';
import type { Issue, IssueSection } from '../types/issue.ts';
import type { FrontmatterValue } from '../types/frontmatter.ts';
import { FIELD_TO_YAML } from '../types/issue.ts';

/**
 * Reconstructs an Issue object from a Y.Doc.
 */
export function serializeYDoc(ydoc: Y.Doc): Issue {
	const metaMap = ydoc.getMap('meta');
	const customFieldsMap = ydoc.getMap('customFields');
	const sectionsMap = ydoc.getMap('sections');

	const fields: Record<string, unknown> = {};
	for (const key of Object.keys(FIELD_TO_YAML)) {
		if (key !== 'id' && key !== 'integrityHash') {
			fields[key] = metaMap.get(key);
		}
	}

	const customFields: Record<string, FrontmatterValue> = {};
	for (const [key, value] of customFieldsMap.entries()) {
		customFields[key] = value as FrontmatterValue;
	}

	const sections: IssueSection[] = [];
	for (const [name, ytext] of sectionsMap.entries()) {
		sections.push({
			name,
			markdown: (ytext as Y.Text).toString()
		});
	}

	return {
		id: metaMap.get('id') as string,
		fields: fields as Issue['fields'],
		customFields,
		integrityHash: (metaMap.get('integrityHash') as string | null) ?? null,
		sections,
		integrityWarning: (metaMap.get('integrityWarning') as boolean) ?? false
	};
}
