import type { WritableDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { Template } from '../types/index.ts';

const TEMPLATES_DIR = '.quill.md/templates';

/**
 * Saves a single custom template to the templates directory.
 */
export async function saveTemplate(
	adapter: WritableDirectoryAdapter,
	template: Template,
	overwrite: boolean = true
): Promise<void> {
	const path = `${TEMPLATES_DIR}/${template.id}.json`;
	if (!overwrite) {
		try {
			await adapter.readTextFile(path);
			return; // File exists, do not overwrite
		} catch {
			// Doesn't exist, proceed to write
		}
	}
	await adapter.writeTextFile(path, JSON.stringify(template, null, '\t') + '\n');
}

/**
 * Removes a template from the templates directory.
 */
export async function removeTemplate(
	adapter: WritableDirectoryAdapter,
	templateId: string
): Promise<void> {
	const path = `${TEMPLATES_DIR}/${templateId}.json`;
	await adapter.removeFile(path);
}
