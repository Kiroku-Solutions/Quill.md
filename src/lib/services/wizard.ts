/**
 * Wizard service — atomic write of `.quill.md/config.json` and
 * `.quill.md/templates/*.json` (FR-11 / UC-5).
 *
 * Pure service: takes a {@link DirectoryAdapter} (the active local
 * adapter from the mode store) and a set of built-in template ids.
 * It writes the config first, then each selected template file. Any
 * write failure propagates the error and leaves the partially-written
 * files in place — the wizard UI surfaces the failing path so the user
 * can retry.
 *
 * NFR-7 atomicity note: each `writeTextFile` is atomic at the file
 * level (temp-file + move inside `LocalFsAdapter.writeTextFile`). The
 * wizard is not transactional across files; if `config.json` writes
 * and the first template file fails, the user sees the config but no
 * templates. That is acceptable for v1: the wizard route re-loads on
 * Apply, and a partial state is recoverable by re-applying the wizard
 * (the route tolerates the config already existing — see the
 * `overwriteConfig` option).
 */

import type { WritableDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { Config, Template } from '../types/index.ts';
import { defaultConfig } from './built-in-templates.ts';

const CONFIG_PATH = '.quill.md/config.json';
const TEMPLATES_DIR = '.quill.md/templates';

export interface WizardSetupOptions {
	/** When `true`, overwrite an existing config.json. Defaults to `false`. */
	readonly overwriteConfig?: boolean;
	/** When `true`, overwrite existing template files. Defaults to `false`. */
	readonly overwriteTemplates?: boolean;
	/**
	 * Required config to write if `overwriteConfig` is true or if config does not exist.
	 */
	readonly config?: Config;
}

/**
 * Write the wizard's setup (config + selected templates) to the active
 * adapter. Returns the list of templates actually written (in the
 * order they were emitted).
 *
 * Throws on the first write failure; subsequent writes are not
 * attempted. The caller is expected to surface the error and let the
 * user re-apply.
 */
export async function writeWizardSetup(
	adapter: WritableDirectoryAdapter,
	templatesToProcess: readonly Template[],
	options: WizardSetupOptions = {}
): Promise<readonly Template[]> {
	if (templatesToProcess.length === 0) {
		throw new Error('At least one template must be selected (FR-11)');
	}

	const overwriteConfig = options.overwriteConfig ?? false;
	const overwriteTemplates = options.overwriteTemplates ?? false;

	// 1. Write config.json (unless preserving an existing one).
	if (overwriteConfig || !(await exists(adapter, CONFIG_PATH))) {
		if (!options.config) {
			throw new Error('Config is required when writing a new setup');
		}

		const base = defaultConfig();
		const finalConfig: Config = {
			...base,
			...options.config,
			kanban: options.config.kanban || { columns: options.config.statuses.map((s) => s.id) },
			gantt: options.config.gantt || base.gantt,
			remote: options.config.remote || base.remote,
			labels: options.config.labels || base.labels,
			users: options.config.users || base.users
		};

		await adapter.writeTextFile(CONFIG_PATH, JSON.stringify(finalConfig, null, '\t') + '\n');
	}

	// 2. Write each selected template (skipping existing ones unless
	//    `overwriteTemplates` is set).
	if (overwriteTemplates) {
		try {
			const existingTemplates = await adapter.listDirectory(TEMPLATES_DIR);
			const newTemplateIds = new Set(templatesToProcess.map((t) => `${t.id}.json`));

			for (const entry of existingTemplates) {
				if (
					entry.kind === 'file' &&
					entry.name.endsWith('.json') &&
					!newTemplateIds.has(entry.name)
				) {
					await adapter.removeFile(`${TEMPLATES_DIR}/${entry.name}`);
				}
			}
		} catch {
			// Ignore if directory doesn't exist
		}
	}

	for (const t of templatesToProcess) {
		const path = `${TEMPLATES_DIR}/${t.id}.json`;
		if (!overwriteTemplates && (await exists(adapter, path))) continue;
		await adapter.writeTextFile(path, JSON.stringify(t, null, '\t') + '\n');
	}

	return templatesToProcess;
}

async function exists(adapter: WritableDirectoryAdapter, path: string): Promise<boolean> {
	try {
		await adapter.readTextFile(path);
		return true;
	} catch {
		return false;
	}
}
