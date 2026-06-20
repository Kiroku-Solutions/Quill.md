import type { DirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { Config } from '../types/index.ts';

const CONFIG_PATH = '.agnostic-issuer/config.json';

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function assertConfig(value: unknown): Config {
	if (!value || typeof value !== 'object') {
		throw new Error('config.json must be a JSON object');
	}
	const v = value as Record<string, unknown>;

	if (!Array.isArray(v['statuses'])) {
		throw new Error('config.json: "statuses" must be an array');
	}
	if (!isString(v['default_status'])) {
		throw new Error('config.json: "default_status" must be a non-empty string');
	}
	if (!Array.isArray(v['labels'])) {
		throw new Error('config.json: "labels" must be an array');
	}
	if (!Array.isArray(v['users'])) {
		throw new Error('config.json: "users" must be an array');
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
 * Load and validate `.agnostic-issuer/config.json`.
 *
 * Throws an actionable error if the file is missing or malformed (ERS FR-3).
 */
export async function loadConfig(adapter: DirectoryAdapter): Promise<Config> {
	let text: string;
	try {
		text = await adapter.readTextFile(CONFIG_PATH);
	} catch (cause) {
		throw new Error(
			`Could not read ${CONFIG_PATH}. ` +
				'Make sure the selected folder contains an AgnosticIssuer setup ' +
				'(a `.agnostic-issuer/config.json` file). ' +
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
