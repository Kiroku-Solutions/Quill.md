import type {
	Issue,
	IssueSection,
	LoadedIssue,
	Relation,
	RelationType,
	FrontmatterValue
} from '../types/index.ts';
import { FIELD_TO_YAML } from '../types/index.ts';
import { computeIntegrityHash, stripIntegrityHashLine } from './integrity.ts';
import { parseFrontmatter } from './frontmatter.ts';

const SYSTEM_KEY_SET: ReadonlySet<string> = new Set(Object.values(FIELD_TO_YAML));

const SECTION_START = /^<!--\s*\[SECTION_START:\s*(.+?)\s*\]\s*-->\s*$/;
const SECTION_END = /^<!--\s*\[SECTION_END:\s*(.+?)\s*\]\s*-->\s*$/;

/**
 * Walk the body of an issue file and extract the named sections in order.
 * Anything outside a section block is silently ignored (the ERS requires
 * that the body contain only section blocks, but we tolerate incidental
 * whitespace rather than rejecting the file).
 */
function parseSections(body: string): IssueSection[] {
	const lines = body.split(/\r?\n/);
	const sections: IssueSection[] = [];
	let current: { name: string; lines: string[] } | null = null;

	for (const line of lines) {
		const startMatch = line.match(SECTION_START);
		if (startMatch) {
			current = { name: startMatch[1] ?? '', lines: [] };
			continue;
		}
		const endMatch = line.match(SECTION_END);
		if (endMatch) {
			if (current && current.name === (endMatch[1] ?? '')) {
				sections.push({ name: current.name, markdown: current.lines.join('\n') });
				current = null;
			}
			continue;
		}
		if (current) current.lines.push(line);
	}
	return sections;
}

/**
 * Pull template-defined frontmatter values out of the parsed YAML object.
 * Anything whose key is not in the ERS §6.1.3 system set is considered
 * a custom field; its order is preserved by JS object insertion order
 * semantics (ES2015+) and is honored by the serializer.
 */
function extractCustomFields(fm: Record<string, unknown>): Record<string, FrontmatterValue> {
	const out: Record<string, FrontmatterValue> = {};
	for (const [key, value] of Object.entries(fm)) {
		if (!SYSTEM_KEY_SET.has(key)) {
			out[key] = value as FrontmatterValue;
		}
	}
	return out;
}

/** Normalize any date-like value to `YYYY-MM-DD`. Accepts Date, string, or null. */
function toIsoDate(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}
	if (typeof value === 'string') {
		// Accept already-formatted dates; truncate longer strings to the date portion.
		return value.slice(0, 10);
	}
	if (typeof value === 'number') {
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
	}
	return '';
}

function toIsoDateOrNull(value: unknown): string | null {
	const s = toIsoDate(value);
	return s === '' ? null : s;
}

function toNumberOrNull(value: unknown): number | null {
	if (value == null || value === '') return null;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

const VALID_RELATION_TYPES: ReadonlySet<RelationType> = new Set<RelationType>([
	'parent',
	'child',
	'blocks',
	'depends_on',
	'relates_to'
]);

function parseRelations(value: unknown): Relation[] {
	if (!Array.isArray(value)) return [];
	const out: Relation[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue;
		const obj = entry as Record<string, unknown>;
		const type = obj['type'];
		const id = obj['id'];
		if (typeof type !== 'string' || !VALID_RELATION_TYPES.has(type as RelationType)) continue;
		const numId = typeof id === 'number' ? id : Number(id);
		if (!Number.isFinite(numId)) continue;
		out.push({ type: type as RelationType, id: numId });
	}
	return out;
}

function asString(value: unknown): string {
	if (value == null) return '';
	return typeof value === 'string' ? value : String(value);
}

function asStringOrNull(value: unknown): string | null {
	if (value == null || value === '') return null;
	return typeof value === 'string' ? value : String(value);
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((v) => (typeof v === 'string' ? v : String(v)));
}

/**
 * Parse the raw text of an issue file into an `Issue` + the on-disk location.
 *
 * The `integrityHash` field of the returned issue is the value stored in the
 * file (or `null` if missing/malformed). `integrityWarning` is set to `true`
 * whenever the stored hash is missing, malformed, or does not match a fresh
 * SHA-256 over the canonical form with the `integrity_hash` line stripped
 * (per ERS §3.1 FR-15).
 */
export async function parseIssueFile(text: string, sourcePath: string): Promise<LoadedIssue> {
	const parsed = parseFrontmatter(text);
	const fm = (parsed.data ?? {}) as Record<string, unknown>;

	const integrityHashRaw = fm['integrity_hash'];
	const integrityHash = typeof integrityHashRaw === 'string' ? integrityHashRaw : null;

	const issue: Issue = {
		id: typeof fm['id'] === 'number' ? fm['id'] : Number(fm['id'] ?? 0),
		title: asString(fm['title']),
		author: asString(fm['author']),
		creationDate: toIsoDate(fm['creation_date']),
		updatedDate: toIsoDate(fm['updated_date']),
		issueType: asString(fm['issue_type']),
		status: asString(fm['status']),
		assignee: asStringOrNull(fm['assignee']),
		labels: asStringArray(fm['labels']),
		relations: parseRelations(fm['relations']),
		startDate: toIsoDateOrNull(fm['start_date']),
		endDate: toIsoDateOrNull(fm['end_date']),
		duration: toNumberOrNull(fm['duration']),
		integrityHash,
		customFields: extractCustomFields(fm),
		sections: parseSections(parsed.content),
		integrityWarning: false
	};

	const computed = await computeIntegrityHash(stripIntegrityHashLine(text));
	issue.integrityWarning =
		integrityHash === null || !integrityHash.startsWith('sha256:') || integrityHash !== computed;

	return { issue, sourcePath };
}
