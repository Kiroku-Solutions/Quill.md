import * as Y from 'yjs';
import type { Issue, IssueSection } from '../types/issue.ts';
import type { FrontmatterValue } from '../types/frontmatter.ts';
import { FIELD_TO_YAML } from '../types/issue.ts';

/**
 * Reconstructs an Issue object from a Y.Doc.
 */
export function serializeYDoc(ydoc: Y.Doc, fallback?: Issue): Issue {
	const metaMap = ydoc.getMap('meta');
	const customFieldsMap = ydoc.getMap('customFields');
	const sectionsMap = ydoc.getMap('sections');

	const fields: Record<string, unknown> = fallback ? { ...fallback.fields } : {};
	for (const key of Object.keys(FIELD_TO_YAML)) {
		if (key !== 'id' && key !== 'integrityHash') {
			if (metaMap.has(key)) {
				fields[key] = metaMap.get(key);
			}
		}
	}

	const customFields: Record<string, FrontmatterValue> = fallback
		? { ...fallback.customFields }
		: {};
	for (const [key, value] of customFieldsMap.entries()) {
		customFields[key] = value as FrontmatterValue;
	}

	const sections: IssueSection[] = [];

	if (fallback) {
		for (const fallbackSection of fallback.sections) {
			if (sectionsMap.has(fallbackSection.name)) {
				sections.push({
					name: fallbackSection.name,
					markdown: (sectionsMap.get(fallbackSection.name) as Y.Text).toString()
				});
			} else {
				sections.push({ ...fallbackSection });
			}
		}
	}

	for (const [name, ytext] of sectionsMap.entries()) {
		if (!fallback || !fallback.sections.find((s) => s.name === name)) {
			sections.push({
				name,
				markdown: (ytext as Y.Text).toString()
			});
		}
	}

	const id = metaMap.has('id') ? metaMap.get('id') : fallback?.id;
	if (!id || typeof id !== 'string') {
		throw new Error('Invalid Y.Doc: missing required ID in meta map');
	}

	return {
		id,
		fields: fields as Issue['fields'],
		customFields,
		integrityHash:
			(metaMap.has('integrityHash')
				? (metaMap.get('integrityHash') as string | null)
				: fallback?.integrityHash) ?? null,
		sections,
		integrityWarning:
			(metaMap.has('integrityWarning')
				? (metaMap.get('integrityWarning') as boolean)
				: fallback?.integrityWarning) ?? false
	};
}
