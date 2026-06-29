/**
 * Wizard service — atomic write of `.nomad.md/config.json` and
 * `.nomad.md/templates/*.json` (FR-11 / UC-5).
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
import { BUILT_IN_TEMPLATES, defaultConfig, getBuiltInTemplate } from './built-in-templates.ts';

const CONFIG_PATH = '.nomad.md/config.json';
const TEMPLATES_DIR = '.nomad.md/templates';

export interface WizardSetupOptions {
	/** When `true`, overwrite an existing config.json. Defaults to `false`. */
	readonly overwriteConfig?: boolean;
	/** When `true`, overwrite existing template files. Defaults to `false`. */
	readonly overwriteTemplates?: boolean;
	/**
	 * Optional custom config. Defaults to {@link defaultConfig}.
	 * Ignored if `overwriteConfig` is false and a config file already
	 * exists on disk (we leave the existing file alone).
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
	templateIds: readonly string[],
	options: WizardSetupOptions = {}
): Promise<readonly Template[]> {
	if (templateIds.length === 0) {
		throw new Error('At least one template must be selected (FR-11)');
	}

	// Resolve templates in declaration order so the on-disk order is
	// stable across runs.
	const tpls: Template[] = [];
	for (const id of templateIds) {
		const t = getBuiltInTemplate(id);
		if (!t) {
			throw new Error(`Unknown built-in template: ${id}`);
		}
		tpls.push(t);
	}

	const overwriteConfig = options.overwriteConfig ?? false;
	const overwriteTemplates = options.overwriteTemplates ?? false;

	// 1. Write config.json (unless preserving an existing one).
	if (overwriteConfig || !(await exists(adapter, CONFIG_PATH))) {
		const cfg = options.config ?? defaultConfig();
		await adapter.writeTextFile(CONFIG_PATH, JSON.stringify(cfg, null, '\t') + '\n');
	}

	// 2. Write each selected template (skipping existing ones unless
	//    `overwriteTemplates` is set).
	for (const t of tpls) {
		const path = `${TEMPLATES_DIR}/${t.id}.json`;
		if (!overwriteTemplates && (await exists(adapter, path))) continue;
		await adapter.writeTextFile(path, JSON.stringify(t, null, '\t') + '\n');
	}

	return tpls;
}

/**
 * Lightweight existence check: a `readTextFile` failure means the file
 * is not there. We catch and treat that as `false`; any other error
 * (permission, IO) propagates.
 */
async function exists(adapter: WritableDirectoryAdapter, path: string): Promise<boolean> {
	try {
		await adapter.readTextFile(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Convenience: re-export the built-in template bundle for callers that
 * want the same list the wizard uses (e.g. an export from the
 * services barrel).
 */
export { BUILT_IN_TEMPLATES };
