import type { ReadOnlyDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { FieldType, Template } from '../types/index.ts';
import { FIELD_TYPES } from '../types/index.ts';

const TEMPLATES_DIR = '.quill.md/templates';

const VALID_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(FIELD_TYPES);

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function assertTemplate(value: unknown, filename: string): Template {
	if (!value || typeof value !== 'object') {
		throw new Error(`${filename}: must be a JSON object`);
	}
	const v = value as Record<string, unknown>;

	if (!isString(v['id'])) throw new Error(`${filename}: "id" must be a string`);
	if (!isString(v['name'])) throw new Error(`${filename}: "name" must be a string`);
	if (!isString(v['icon'])) throw new Error(`${filename}: "icon" must be a string`);
	if (!isString(v['color'])) throw new Error(`${filename}: "color" must be a string`);
	if (!isString(v['default_status'])) {
		throw new Error(`${filename}: "default_status" must be a string`);
	}

	if (!Array.isArray(v['fields'])) {
		throw new Error(`${filename}: "fields" must be an array`);
	}
	for (let i = 0; i < v['fields'].length; i++) {
		const f = v['fields'][i] as Record<string, unknown> | null;
		if (!f || typeof f !== 'object') {
			throw new Error(`${filename}: fields[${i}] must be an object`);
		}
		if (typeof f['id'] !== 'number') {
			throw new Error(`${filename}: fields[${i}].id must be a number`);
		}
		if (!isString(f['key'])) {
			throw new Error(`${filename}: fields[${i}].key must be a string`);
		}
		if (!isString(f['type']) || !VALID_FIELD_TYPES.has(f['type'] as FieldType)) {
			throw new Error(`${filename}: fields[${i}].type must be one of ${FIELD_TYPES.join(', ')}`);
		}
		if (!isString(f['name'])) {
			throw new Error(`${filename}: fields[${i}].name must be a string`);
		}
		if (typeof f['obligatory'] !== 'boolean') {
			throw new Error(`${filename}: fields[${i}].obligatory must be a boolean`);
		}
		if (f['options'] !== undefined && !Array.isArray(f['options'])) {
			throw new Error(`${filename}: fields[${i}].options must be an array if present`);
		}
		// ERS §3.1 FR-2: select / multi-select fields MUST have an `options`
		// array. The previous loader silently accepted a `select` field with
		// no options, which made the editor crash on render. Closing that gap.
		if (
			(f['type'] === 'select' || f['type'] === 'multi-select') &&
			!Array.isArray(f['options']) &&
			!isString(f['options_source'])
		) {
			throw new Error(
				`${filename}: fields[${i}] (type "${f['type']}") must include a non-empty "options" array or an "options_source"`
			);
		}
	}

	if (!Array.isArray(v['sections'])) {
		throw new Error(`${filename}: "sections" must be an array`);
	}
	for (let i = 0; i < v['sections'].length; i++) {
		const s = v['sections'][i] as Record<string, unknown> | null;
		if (!s || typeof s !== 'object') {
			throw new Error(`${filename}: sections[${i}] must be an object`);
		}
		if (typeof s['id'] !== 'number') {
			throw new Error(`${filename}: sections[${i}].id must be a number`);
		}
		if (!isString(s['key'])) {
			throw new Error(`${filename}: sections[${i}].key must be a string`);
		}
		if (!isString(s['name'])) {
			throw new Error(`${filename}: sections[${i}].name must be a string`);
		}
		if (typeof s['obligatory'] !== 'boolean') {
			throw new Error(`${filename}: sections[${i}].obligatory must be a boolean`);
		}
	}

	return value as Template;
}

/**
 * Load every `*.json` file under `.quill.md/templates/`.
 *
 * Malformed templates abort the load with an actionable error (the editor
 * cannot function without a schema).
 */
export async function loadTemplates(adapter: ReadOnlyDirectoryAdapter): Promise<Template[]> {
	let entries;
	try {
		entries = await adapter.listDirectory(TEMPLATES_DIR);
	} catch (cause) {
		throw new Error(
			`Could not list ${TEMPLATES_DIR}: ${(cause as Error).message}. ` +
				'Make sure the selected folder contains a quill.md setup.',
			{ cause }
		);
	}

	const out: Template[] = [];
	for (const entry of entries) {
		if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
		const path = `${TEMPLATES_DIR}/${entry.name}`;
		const text = await adapter.readTextFile(path);
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (cause) {
			throw new Error(`Malformed JSON in ${path}: ${(cause as Error).message}`, { cause });
		}
		out.push(assertTemplate(parsed, path));
	}
	out.sort((a, b) => a.id.localeCompare(b.id));
	return out;
}

export const TEMPLATES_DIRECTORY = TEMPLATES_DIR;
