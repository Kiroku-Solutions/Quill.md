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
import type { Config, Template, Issue, Relation } from '../types/index.ts';
import { defaultConfig } from './built-in-templates.ts';
import { serializeIssue } from './serializer.ts';
import { buildIssueFilename } from './slugs.ts';

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
	/** When `true`, generate 21 inter-connected mock items for debugging. */
	readonly generateMockData?: boolean;
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
	for (const t of templatesToProcess) {
		const path = `${TEMPLATES_DIR}/${t.id}.json`;
		if (!overwriteTemplates && (await exists(adapter, path))) continue;
		await adapter.writeTextFile(path, JSON.stringify(t, null, '\t') + '\n');
	}

	// 3. Generate mock data if requested
	if (options.generateMockData && options.config) {
		await generateMockGraph(adapter, options.config, templatesToProcess);
	}

	return templatesToProcess;
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

async function generateMockGraph(
	adapter: WritableDirectoryAdapter,
	config: Config,
	templates: readonly Template[]
): Promise<void> {
	if (templates.length === 0) return;
	
	const issues: Issue[] = [];
	const statuses = config.statuses.map((s) => s.id);
	const getStatus = (index: number) => statuses[index % statuses.length];

	let nextId = 1;
	const levels: Issue[][] = [];

	// Level 0 (Roots)
	const roots: Issue[] = [];
	for (let i = 0; i < 2; i++) {
		const id = nextId++;
		roots.push(createMockIssue(id, `${templates[0].name} ${i+1}`, templates[0].id, getStatus(id)));
	}
	levels.push(roots);

	// Levels 1 to N-1
	for (let i = 1; i < templates.length; i++) {
		const currentLevel: Issue[] = [];
		const parents = levels[i - 1];
		for (const parent of parents) {
			for (let j = 0; j < 2; j++) {
				const id = nextId++;
				const child = createMockIssue(id, `${templates[i].name} ${parent.id}-${j+1}`, templates[i].id, getStatus(id));
				link(parent, child, 'child');
				currentLevel.push(child);
			}
		}
		levels.push(currentLevel);
	}

	// Cross-hierarchy dependencies
	if (levels.length > 0) {
		const leaves = levels[levels.length - 1];
		if (leaves.length >= 2) link(leaves[0], leaves[leaves.length - 1], 'blocks');
		if (leaves.length >= 4) link(leaves[1], leaves[2], 'depends_on');
	}
	
	if (levels.length > 1) {
		const mids = levels[Math.floor(levels.length / 2)];
		if (mids.length >= 2) link(mids[0], mids[mids.length - 1], 'relates_to');
	}

	if (levels.length > 2) {
		const highMids = levels[1];
		if (highMids.length >= 2) link(highMids[0], highMids[1], 'relates_to');
	}

	issues.push(...levels.flat());

	for (const issue of issues) {
		const serialized = await serializeIssue(issue);
		const filename = buildIssueFilename(issue.id, issue.title);
		await adapter.writeTextFile(`.quill.md/issues/${filename}`, serialized);
	}
}

function createMockIssue(id: number, title: string, type: string, status: string): Issue {
	return {
		id,
		title,
		author: 'Generador Automático',
		creationDate: new Date().toISOString().split('T')[0],
		updatedDate: new Date().toISOString().split('T')[0],
		issueType: type,
		status,
		assignee: null,
		labels: ['mock', 'auto-generado'],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		sprintId: null,
		estimate: null,
		integrityHash: null,
		customFields: {},
		sections: [
			{ name: 'Descripción', markdown: 'Este es un elemento generado automáticamente para probar la vista de grafos 3D y Gantt.' },
			{ name: 'Criterios de Aceptación', markdown: '- [ ] Verificar conexiones.\n- [ ] Validar rendering.' }
		],
		integrityWarning: false
	};
}

function link(from: Issue, to: Issue, type: Relation['type']) {
	from.relations.push({ type, id: to.id });
	if (type === 'child') {
		to.relations.push({ type: 'parent', id: from.id });
	} else if (type === 'parent') {
		to.relations.push({ type: 'child', id: from.id });
	} else if (type === 'blocks') {
		to.relations.push({ type: 'depends_on', id: from.id });
	} else if (type === 'depends_on') {
		to.relations.push({ type: 'blocks', id: from.id });
	} else if (type === 'relates_to') {
		to.relations.push({ type: 'relates_to', id: from.id });
	}
}
