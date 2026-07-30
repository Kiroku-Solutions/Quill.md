import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import yaml from 'js-yaml';
import crypto from 'node:crypto';

function resolveProjectDir(projectDir?: string): string {
	if (projectDir) return projectDir;
	const argDir = process.argv[2];
	if (argDir && existsSync(path.join(argDir, '.quill.md'))) return argDir;
	return process.cwd();
}

const DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"' as const,
	forceQuotes: false
};

function serializeDocument(id: string, immutable: boolean, content: string, extraData: Record<string, unknown> = {}): string {
	const data: Record<string, unknown> = {
		id,
        immutable,
		...extraData,
	};

	// 1. Serialize canonical form (without hash)
	const canonicalYaml = yaml.dump(data, DUMP_OPTIONS);
	const canonicalText = `---\n${canonicalYaml}---\n\n${content}`;
	
	// 2. Compute hash
	const hash = crypto.createHash('sha256').update(canonicalText, 'utf8').digest('hex');
	
	// 3. Inject hash
	data['integrity_hash'] = `sha256:${hash}`;
	
	const finalYaml = yaml.dump(data, DUMP_OPTIONS).replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
	return `---\n${finalYaml}---\n\n${content}`;
}

export async function createWikiPage(
	title: string,
	content: string,
	projectDir?: string
) {
	const dir = resolveProjectDir(projectDir);
	const targetDir = path.join(dir, '.quill.md', 'wiki');
	try {
		await fs.mkdir(targetDir, { recursive: true });
        const id = crypto.randomUUID();
        const filename = `${title.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
        
        const serialized = serializeDocument(id, false, content);
		await fs.writeFile(path.join(targetDir, filename), serialized);

		return {
			content: [
				{
					type: 'text' as const,
					text: `Successfully created Wiki page ${id}: ${filename}\n\n${serialized}`
				}
			]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error creating Wiki page: ${msg}` }],
			isError: true
		};
	}
}

export async function createAdr(
	title: string,
	status: string,
	context: string,
	decision: string,
    consequences: string,
	projectDir?: string
) {
	const dir = resolveProjectDir(projectDir);
	const targetDir = path.join(dir, '.quill.md', 'adr');
	try {
		await fs.mkdir(targetDir, { recursive: true });
        const id = crypto.randomUUID();
        const filename = `${title.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
        
        const content = `# ${title}\n\n## Status\n${status}\n\n## Context\n${context}\n\n## Decision\n${decision}\n\n## Consequences\n${consequences}`;
        const serialized = serializeDocument(id, false, content);
		await fs.writeFile(path.join(targetDir, filename), serialized);

		return {
			content: [
				{
					type: 'text' as const,
					text: `Successfully created ADR ${id}: ${filename}\n\n${serialized}`
				}
			]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error creating ADR: ${msg}` }],
			isError: true
		};
	}
}
