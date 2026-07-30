import { dump } from 'js-yaml';
import { computeIntegrityHash, verifyIntegrity } from './integrity';
import { parseFrontmatter } from './frontmatter';
import type { WritableDirectoryAdapter } from '../adapters/directory-adapter';

/** YAML dump options: stable key order, no line wrapping, no anchors. */
const DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"' as const,
	forceQuotes: false
};

export interface ParsedDocument {
	id: string;
	immutable: boolean;
	integrityWarning: boolean;
	content: string;
	data: Record<string, unknown>;
}

/**
 * Parses a markdown document, extracting its frontmatter, verifying its integrity hash,
 * and returning the structured data.
 */
export async function parseDocumentFile(text: string): Promise<ParsedDocument> {
	const { data, content } = parseFrontmatter(text);
	
	const id = typeof data?.id === 'string' ? data.id : crypto.randomUUID();
	const immutable = data?.immutable === true || data?.immutable === 'true';
	
	let integrityWarning = false;
	const storedHash = data?.integrity_hash;
	if (typeof storedHash === 'string') {
		const isValid = await verifyIntegrity(storedHash, text);
		if (!isValid) {
			integrityWarning = true;
		}
	} else if (data && Object.keys(data).length > 0) {
		// Frontmatter exists but no hash
		integrityWarning = true;
	}

	return {
		id,
		immutable,
		integrityWarning,
		content,
		data: data || {}
	};
}

/**
 * Force-quote the `integrity_hash` value.
 */
function quoteIntegrityHash(yamlText: string): string {
	return yamlText.replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
}

/**
 * Serializes a document WITH an integrity hash. 
 */
export async function serializeDocument(id: string, immutable: boolean, content: string, extraData: Record<string, unknown> = {}): Promise<string> {
	const data: Record<string, unknown> = {
		id,
        immutable,
		...extraData,
	};

	// 1. Serialize canonical form (without hash)
	const canonicalYaml = dump(data, DUMP_OPTIONS);
	const canonicalText = `---\n${canonicalYaml}---\n\n${content}`;
	
	// 2. Compute hash
	const hash = await computeIntegrityHash(canonicalText);
	
	// 3. Inject hash
	data['integrity_hash'] = hash;
	
	const finalYaml = quoteIntegrityHash(dump(data, DUMP_OPTIONS));
	return `---\n${finalYaml}---\n\n${content}`;
}

/**
 * Saves a document to the specified directory.
 */
export async function saveDocument(
	adapter: WritableDirectoryAdapter,
	directory: string,
	filename: string,
	id: string,
	immutable: boolean,
	content: string,
	extraData: Record<string, unknown> = {}
): Promise<ParsedDocument> {
	const text = await serializeDocument(id, immutable, content, extraData);
	const filepath = `${directory}/${filename}`;
	await adapter.writeTextFile(filepath, text);
	return parseDocumentFile(text);
}
