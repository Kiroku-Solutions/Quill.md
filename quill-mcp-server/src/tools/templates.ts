import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

function resolveProjectDir(projectDir?: string): string {
	if (projectDir) return projectDir;
	const argDir = process.argv[2];
	if (argDir && existsSync(path.join(argDir, '.quill.md'))) return argDir;
	return process.cwd();
}

function getTemplatesDir(projectDir?: string) {
	return path.join(resolveProjectDir(projectDir), '.quill.md', 'templates');
}

export async function createTemplate(templateJsonStr: string, projectDir?: string) {
	const templatesDir = getTemplatesDir(projectDir);
	try {
		const template = JSON.parse(templateJsonStr);

		if (!template.id || !template.name) {
			throw new Error('Template must have at least an "id" and a "name" field');
		}

		await fs.mkdir(templatesDir, { recursive: true });

		// Color collision detection
		const existingTemplates = (await fs.readdir(templatesDir)).filter((f) => f.endsWith('.json'));
		const usedColors = new Set<string>();
		let existingColorForThisId: string | undefined = undefined;

		for (const f of existingTemplates) {
			try {
				const content = await fs.readFile(path.join(templatesDir, f), 'utf-8');
				const t = JSON.parse(content);
				if (t.id === template.id) {
					existingColorForThisId = t.color?.toLowerCase();
				} else if (t.color) {
					usedColors.add(t.color.toLowerCase());
				}
			} catch {
				// Ignore unparseable files
			}
		}

		const proposedColor = template.color?.toLowerCase();
		if (
			!proposedColor ||
			(usedColors.has(proposedColor) && proposedColor !== existingColorForThisId)
		) {
			const distinctColors = [
				'#ef4444',
				'#f97316',
				'#f59e0b',
				'#eab308',
				'#84cc16',
				'#22c55e',
				'#10b981',
				'#14b8a6',
				'#06b6d4',
				'#0ea5e9',
				'#3b82f6',
				'#6366f1',
				'#8b5cf6',
				'#a855f7',
				'#d946ef',
				'#ec4899',
				'#f43f5e'
			];
			let newColor = distinctColors.find((c) => !usedColors.has(c));
			if (!newColor) {
				newColor =
					'#' +
					Math.floor(Math.random() * 16777215)
						.toString(16)
						.padStart(6, '0');
			}
			template.color = newColor;
		}

		// Ensure standard system fields are present
		template.fields = template.fields || [];
		const systemFields = [
			{
				id: -4,
				key: 'status',
				name: 'Status',
				type: 'select',
				obligatory: true,
				options_source: 'config.statuses'
			},
			{
				id: -3,
				key: 'assignee',
				name: 'Assignee',
				type: 'select',
				obligatory: false,
				options_source: 'config.users'
			},
			{
				id: -2,
				key: 'labels',
				name: 'Labels',
				type: 'multi-select',
				obligatory: false,
				options_source: 'config.labels'
			},
			{ id: -1, key: 'relations', name: 'Relations', type: 'relations', obligatory: false }
		];

		const validTypes = new Set([
			'text',
			'longtext',
			'number',
			'boolean',
			'select',
			'multi-select',
			'date',
			'datetime',
			'relation',
			'relations'
		]);
		if (template.fields) {
			for (const f of template.fields) {
				if (!validTypes.has(f.type)) {
					throw new Error(
						`Strict Validation Failed: Field '${f.key}' uses an invalid type '${f.type}'. Valid types are: ${Array.from(validTypes).join(', ')}`
					);
				}
				if (
					(f.type === 'select' || f.type === 'multi-select') &&
					!Array.isArray(f.options) &&
					typeof f.options_source !== 'string'
				) {
					throw new Error(
						`Strict Validation Failed: Field '${f.key}' of type '${f.type}' must have 'options' array or 'options_source' string`
					);
				}
			}
		}

		for (const sysField of systemFields) {
			if (!template.fields.some((f: Record<string, unknown>) => f.key === sysField.key)) {
				template.fields.push(sysField);
			}
		}
		// Re-sort to ensure negative ID fields appear at the top
		template.fields.sort(
			(a: Record<string, unknown>, b: Record<string, unknown>) =>
				(Number(a.id) || 0) - (Number(b.id) || 0)
		);

		const filename = `${template.id}.json`;

		// Formatting JSON nicely
		await fs.writeFile(
			path.join(templatesDir, filename),
			JSON.stringify(template, null, '\t') + '\n'
		);

		return {
			content: [
				{
					type: 'text' as const,
					text: `Successfully created template ${template.id} at ${filename}`
				}
			]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error creating template: ${msg}` }],
			isError: true
		};
	}
}
