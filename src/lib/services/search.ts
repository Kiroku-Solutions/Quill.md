import type { LoadedIssue } from '../types/index.ts';
import type {
	ReadOnlyDirectoryAdapter,
	WritableDirectoryAdapter
} from '../adapters/directory-adapter.ts';

const INDEX_FILE = '.quill.md/search-index.json';

export interface SearchIndex {
	/** Mapping from lowercase word to an array of Issue IDs */
	inverted: Record<string, string[]>;
}

/** Tokenize a string into words, lowercase */
function tokenize(text: string): string[] {
	if (!text) return [];
	return text
		.toLowerCase()
		.split(/[\W_]+/)
		.filter((t) => t.length > 2); // Ignore short words
}

/** Generate a search index from all issues */
export function generateSearchIndex(issues: readonly LoadedIssue[]): SearchIndex {
	const inverted: Record<string, Set<string>> = {};

	for (const { issue } of issues) {
		const id = issue.id;
		const tokens = new Set<string>();

		// Index title
		tokenize(issue.fields.title as string).forEach((t) => tokens.add(t));
		// Index sections
		if (issue.sections) {
			for (const sec of issue.sections) {
				tokenize(sec.markdown).forEach((t) => tokens.add(t));
			}
		}
		// Index custom fields (if string)
		for (const val of Object.values(issue.customFields ?? {})) {
			if (typeof val === 'string') {
				tokenize(val).forEach((t) => tokens.add(t));
			}
		}

		for (const token of tokens) {
			if (!inverted[token]) inverted[token] = new Set();
			inverted[token].add(id);
		}
	}

	const result: Record<string, string[]> = {};
	for (const [token, ids] of Object.entries(inverted)) {
		result[token] = Array.from(ids);
	}

	return { inverted: result };
}

/** Save the search index to the remote/local repository */
export async function saveSearchIndex(
	adapter: WritableDirectoryAdapter,
	index: SearchIndex
): Promise<void> {
	await adapter.writeTextFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

/** Load the search index from the repository */
export async function loadSearchIndex(adapter: ReadOnlyDirectoryAdapter): Promise<SearchIndex> {
	try {
		const content = await adapter.readTextFile(INDEX_FILE);
		return JSON.parse(content) as SearchIndex;
	} catch {
		return { inverted: {} };
	}
}

/** Search the index and return matching issue IDs */
export function searchIssues(index: SearchIndex, query: string): string[] {
	if (!query || !query.trim()) return [];
	const tokens = tokenize(query);
	if (tokens.length === 0) return [];

	let results: Set<string> | null = null;

	for (const token of tokens) {
		const matches = new Set<string>();
		// Substring matching against index keys for basic autocomplete feel
		for (const [key, ids] of Object.entries(index.inverted)) {
			if (key.includes(token)) {
				for (const id of ids) matches.add(id);
			}
		}

		if (results === null) {
			results = matches;
		} else {
			// Intersection for multiple terms
			const intersected = new Set<string>();
			for (const id of matches) {
				if (results.has(id)) intersected.add(id);
			}
			results = intersected;
		}
	}

	return Array.from(results ?? []);
}
