import type { ReadOnlyDirectoryAdapter } from '../adapters/directory-adapter.ts';
import type { LoadedIssue } from '../types/index.ts';
import { parseIssueFile } from './parser.ts';

const ISSUES_DIR = '.quill.md/issues';

/**
 * Load and parse every `*.md` file under `.quill.md/issues/`.
 *
 * A missing issues directory is treated as an empty set (the user simply
 * has no issues yet). Malformed individual issues are skipped with the
 * parser's default tolerance — they are returned with `integrityWarning`
 * set, and the rest of the set is still usable.
 */
export async function loadIssues(adapter: ReadOnlyDirectoryAdapter): Promise<LoadedIssue[]> {
	const loaded: LoadedIssue[] = [];

	async function loadDir(dir: string) {
		let dirEntries;
		try {
			dirEntries = await adapter.listDirectory(dir);
		} catch {
			return;
		}
		for (const entry of dirEntries) {
			if (entry.kind === 'file' && entry.name.endsWith('.md')) {
				const path = `${dir}/${entry.name}`;
				const text = await adapter.readTextFile(path);
				loaded.push(await parseIssueFile(text, path));
			}
		}
	}

	await loadDir(`${ISSUES_DIR}/open`);
	await loadDir(`${ISSUES_DIR}/closed`);
	await loadDir(ISSUES_DIR); // Legacy root issues

	loaded.sort((a, b) =>
		String(a.issue.id).localeCompare(String(b.issue.id), undefined, { numeric: true })
	);
	return loaded;
}

export const ISSUES_DIRECTORY = ISSUES_DIR;
