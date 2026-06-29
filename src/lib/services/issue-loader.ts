import type { ReadOnlyDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { LoadedIssue } from '../types/index.ts';
import { parseIssueFile } from './parser.ts';

const ISSUES_DIR = '.nomad.md/issues';

/**
 * Load and parse every `*.md` file under `.nomad.md/issues/`.
 *
 * A missing issues directory is treated as an empty set (the user simply
 * has no issues yet). Malformed individual issues are skipped with the
 * parser's default tolerance — they are returned with `integrityWarning`
 * set, and the rest of the set is still usable.
 */
export async function loadIssues(adapter: ReadOnlyDirectoryAdapter): Promise<LoadedIssue[]> {
	let entries;
	try {
		entries = await adapter.listDirectory(ISSUES_DIR);
	} catch {
		return [];
	}

	const loaded: LoadedIssue[] = [];
	for (const entry of entries) {
		if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
		const path = `${ISSUES_DIR}/${entry.name}`;
		const text = await adapter.readTextFile(path);
		loaded.push(await parseIssueFile(text, path));
	}

	loaded.sort((a, b) => a.issue.id - b.issue.id);
	return loaded;
}

export const ISSUES_DIRECTORY = ISSUES_DIR;
