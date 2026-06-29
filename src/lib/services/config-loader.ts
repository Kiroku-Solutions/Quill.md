import type { ReadOnlyDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { Config } from '../types/index.ts';

const CONFIG_PATH = '.nomad.md/config.json';

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Validate a single entry inside `config.statuses[]`, `config.labels[]`,
 * or `config.users[]`. All three follow the same shape: a non-empty
 * `id` and `name`, plus a colour for statuses. The error path surfaces
 * the field + index so the user can fix the broken entry directly.
 */
function assertCatalogEntry(
	parent: string,
	index: number,
	entry: unknown,
	extra: ReadonlyArray<readonly [key: string, kind: 'string' | 'color' | 'array']> = []
): void {
	if (!entry || typeof entry !== 'object') {
		throw new Error(`config.json: ${parent}[${index}] must be an object`);
	}
	const obj = entry as Record<string, unknown>;
	if (!isString(obj['id'])) {
		throw new Error(`config.json: ${parent}[${index}].id must be a non-empty string`);
	}
	if (!isString(obj['name'])) {
		throw new Error(`config.json: ${parent}[${index}].name must be a non-empty string`);
	}
	for (const [key, kind] of extra) {
		const v = obj[key];
		switch (kind) {
			case 'string':
				if (!isString(v)) {
					throw new Error(`config.json: ${parent}[${index}].${key} must be a non-empty string`);
				}
				break;
			case 'color':
				if (typeof v !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
					throw new Error(
						`config.json: ${parent}[${index}].${key} must be a #rgb or #rrggbb hex string`
					);
				}
				break;
			case 'array':
				if (!Array.isArray(v)) {
					throw new Error(`config.json: ${parent}[${index}].${key} must be an array`);
				}
				break;
		}
	}
}

function assertConfig(value: unknown): Config {
	if (!value || typeof value !== 'object') {
		throw new Error('config.json must be a JSON object');
	}
	const v = value as Record<string, unknown>;

	if (!Array.isArray(v['statuses'])) {
		throw new Error('config.json: "statuses" must be an array');
	}
	for (let i = 0; i < (v['statuses'] as unknown[]).length; i++) {
		assertCatalogEntry('statuses', i, (v['statuses'] as unknown[])[i], [['color', 'color']]);
	}
	if (!isString(v['default_status'])) {
		throw new Error('config.json: "default_status" must be a non-empty string');
	}
	// ERS FR-3: default_status must reference a real status id.
	const statusIds = new Set((v['statuses'] as Array<Record<string, unknown>>).map((s) => s['id']));
	if (!statusIds.has(v['default_status'])) {
		throw new Error(`config.json: "default_status" must reference an existing status id`);
	}

	if (!Array.isArray(v['labels'])) {
		throw new Error('config.json: "labels" must be an array');
	}
	for (let i = 0; i < (v['labels'] as unknown[]).length; i++) {
		assertCatalogEntry('labels', i, (v['labels'] as unknown[])[i], [['color', 'color']]);
	}

	if (!Array.isArray(v['users'])) {
		throw new Error('config.json: "users" must be an array');
	}
	// Users: id + name are mandatory; the loader does not enforce `email`
	// shape because the ERS only specifies an id + display-name pair.
	for (let i = 0; i < (v['users'] as unknown[]).length; i++) {
		assertCatalogEntry('users', i, (v['users'] as unknown[])[i]);
	}

	if (!v['kanban'] || typeof v['kanban'] !== 'object') {
		throw new Error('config.json: "kanban" must be an object');
	}
	if (!v['gantt'] || typeof v['gantt'] !== 'object') {
		throw new Error('config.json: "gantt" must be an object');
	}
	if (!v['remote'] || typeof v['remote'] !== 'object') {
		throw new Error('config.json: "remote" must be an object');
	}

	const kanban = v['kanban'] as Record<string, unknown>;
	if (!Array.isArray(kanban['columns'])) {
		throw new Error('config.json: "kanban.columns" must be an array of status ids');
	}
	for (let i = 0; i < (kanban['columns'] as unknown[]).length; i++) {
		const col = (kanban['columns'] as unknown[])[i];
		if (!isString(col) || !statusIds.has(col)) {
			throw new Error(`config.json: kanban.columns[${i}] must reference an existing status id`);
		}
	}

	const gantt = v['gantt'] as Record<string, unknown>;
	if (!isString(gantt['group_by'])) {
		throw new Error('config.json: "gantt.group_by" must be a string');
	}
	if (!isString(gantt['default_view'])) {
		throw new Error('config.json: "gantt.default_view" must be a string');
	}

	const remote = v['remote'] as Record<string, unknown>;
	if (!isString(remote['cors_proxy'])) {
		throw new Error('config.json: "remote.cors_proxy" must be a string');
	}

	return value as Config;
}

/**
 * Load and validate `.nomad.md/config.json`.
 *
 * Throws an actionable error if the file is missing or malformed (ERS FR-3).
 */
export async function loadConfig(adapter: ReadOnlyDirectoryAdapter): Promise<Config> {
	let text: string;
	try {
		text = await adapter.readTextFile(CONFIG_PATH);
	} catch (cause) {
		throw new Error(
			`Could not read ${CONFIG_PATH}. ` +
				'Make sure the selected folder contains a nomad.md setup ' +
				'(a `.nomad.md/config.json` file). ' +
				`Underlying error: ${(cause as Error).message}`,
			{ cause }
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		throw new Error(`Malformed JSON in ${CONFIG_PATH}: ${(cause as Error).message}`, {
			cause
		});
	}

	return assertConfig(parsed);
}

export const CONFIG_FILE_PATH = CONFIG_PATH;
