import { dump } from 'js-yaml';
import type { Issue, IssueSection } from '../types/index.ts';
import { FIELD_TO_YAML, SYSTEM_FRONTMATTER_KEY_ORDER } from '../types/index.ts';
import { computeIntegrityHash } from './integrity.ts';

/**
 * Serialize one section as `<!-- [SECTION_START: name] -->\n<body>\n<!-- [SECTION_END: name] -->`.
 * A trailing newline is appended so consecutive sections are separated by a
 * blank line on round-trip.
 */
function serializeSection(section: IssueSection): string {
	const body = section.markdown.endsWith('\n') ? section.markdown : `${section.markdown}\n`;
	return `<!-- [SECTION_START: ${section.name}] -->\n${body}<!-- [SECTION_END: ${section.name}] -->\n`;
}

/**
 * Build the YAML mapping for the frontmatter in the canonical order:
 *   1. System keys from `SYSTEM_FRONTMATTER_KEY_ORDER`, EXCEPT `integrity_hash`
 *      (which is computed and appended after the hash is known).
 *   2. Template-defined custom fields in their insertion order.
 *   3. `integrity_hash`, last.
 *
 * `null` and `undefined` are filtered out so we don't emit empty fields.
 * The serializer is therefore lossy on `null`-valued fields — they vanish from
 * the frontmatter instead of being written as `key: null`. This matches the
 * ERS Appendix B.6 example, where absent fields are simply absent.
 *
 * Loose `unknown` typing is intentional: the dump step accepts any
 * JSON-compatible value (numbers, strings, arrays, mappings), and we want to
 * allow `Relation[]` and other domain-shaped arrays through without TS-level
 * gymnastics at every call site.
 */
function buildFrontmatter(issue: Issue, hash: string | null): Record<string, unknown> {
	const out: Record<string, unknown> = {};

	for (const yamlKey of SYSTEM_FRONTMATTER_KEY_ORDER) {
		if (yamlKey === 'integrity_hash') continue;
		const value = yamlValueFor(issue, yamlKey);
		if (value === undefined) continue;
		out[yamlKey] = value;
	}

	for (const [key, value] of Object.entries(issue.customFields)) {
		if (value === undefined) continue;
		out[key] = value;
	}

	if (hash !== null) {
		out['integrity_hash'] = hash;
	}

	return out;
}

/** Pull the YAML-compatible value for a system key out of the Issue. */
function yamlValueFor(issue: Issue, yamlKey: string): unknown {
	const f = issue.fields;
	switch (yamlKey) {
		case FIELD_TO_YAML.id:
			return issue.id > 0 ? issue.id : undefined;
		case FIELD_TO_YAML.title:
			return f.title ? f.title : undefined;
		case FIELD_TO_YAML.author:
			return f.author ? f.author : undefined;
		case FIELD_TO_YAML.creationDate:
			return f.creationDate ? f.creationDate : undefined;
		case FIELD_TO_YAML.updatedDate:
			return f.updatedDate ? f.updatedDate : undefined;
		case FIELD_TO_YAML.issueType:
			return f.issueType ? f.issueType : undefined;
		case FIELD_TO_YAML.status:
			return f.status ? f.status : undefined;
		case FIELD_TO_YAML.assignee:
			return f.assignee ?? undefined;
		case FIELD_TO_YAML.labels:
			return f.labels.length > 0 ? f.labels : undefined;
		case FIELD_TO_YAML.relations:
			return f.relations.length > 0 ? f.relations : undefined;
		case FIELD_TO_YAML.startDate:
			return f.startDate ?? undefined;
		case FIELD_TO_YAML.endDate:
			return f.endDate ?? undefined;
		case FIELD_TO_YAML.duration:
			return f.duration ?? undefined;
		case FIELD_TO_YAML.sprintId:
			return f.sprintId ?? undefined;
		case FIELD_TO_YAML.estimate:
			return f.estimate ?? undefined;
		default:
			return undefined;
	}
}

/** YAML dump options: stable key order, no line wrapping, no anchors. */
const DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"' as const,
	forceQuotes: false
};

/**
 * Force-quote the `integrity_hash` value. The string contains a colon which
 * YAML would otherwise misparse as a mapping; js-yaml usually handles this
 * but we belt-and-brace the ERS §6.1.3 explicit requirement that it be quoted.
 */
function quoteIntegrityHash(yamlText: string): string {
	return yamlText.replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
}

/** Serialize the issue WITHOUT an integrity hash — used to compute the hash. */
function serializeCanonical(issue: Issue): string {
	const fm = buildFrontmatter(issue, null);
	const yamlText = dump(fm, DUMP_OPTIONS);
	const body = issue.sections.map(serializeSection).join('\n');
	return `---\n${yamlText}---\n\n${body}`;
}

/**
 * Serialize the issue WITH an integrity hash. The hash is computed over the
 * canonical form (no hash line) and then injected as the last frontmatter
 * key, producing the final file contents.
 */
export async function serializeIssue(issue: Issue): Promise<string> {
	const canonical = serializeCanonical(issue);
	const hash = await computeIntegrityHash(canonical);
	const fm = buildFrontmatter(issue, hash);
	const yamlText = quoteIntegrityHash(dump(fm, DUMP_OPTIONS));
	const body = issue.sections.map(serializeSection).join('\n');
	return `---\n${yamlText}---\n\n${body}`;
}

/** Exposed for tests and the integrity verifier: the canonical form with no hash. */
export function canonicalForm(issue: Issue): string {
	return serializeCanonical(issue);
}
