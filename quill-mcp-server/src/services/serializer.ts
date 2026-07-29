import yaml from 'js-yaml';
import crypto from 'node:crypto';

export interface Issue {
	id: string;
	title: string;
	author: string;
	creationDate: string;
	updatedDate: string;
	issueType: string;
	status: string;
	assignee: string | null;
	labels: string[];
	relations: Array<{ type: string; id: string }>;
	startDate: string | null;
	endDate: string | null;
	duration: number | null;
	sprintId: string | null;
	estimate: number | null;
	integrityHash: string | null;
	customFields: Record<string, unknown>;
	sections: Array<{ name: string; markdown: string }>;
	integrityWarning?: boolean;
}

const SYSTEM_FRONTMATTER_KEY_ORDER = [
	'id',
	'title',
	'author',
	'creation_date',
	'updated_date',
	'issue_type',
	'status',
	'assignee',
	'labels',
	'relations',
	'start_date',
	'end_date',
	'duration',
	'sprint_id',
	'estimate',
	'integrity_hash'
] as const;

function yamlValueFor(issue: Issue, yamlKey: string): unknown {
	switch (yamlKey) {
		case 'id':
			return issue.id || undefined;
		case 'title':
			return issue.title ? issue.title : undefined;
		case 'author':
			return issue.author ? issue.author : undefined;
		case 'creation_date':
			return issue.creationDate ? issue.creationDate : undefined;
		case 'updated_date':
			return issue.updatedDate ? issue.updatedDate : undefined;
		case 'issue_type':
			return issue.issueType ? issue.issueType : undefined;
		case 'status':
			return issue.status ? issue.status : undefined;
		case 'assignee':
			return issue.assignee ?? undefined;
		case 'labels':
			return issue.labels.length > 0 ? issue.labels : undefined;
		case 'relations':
			return issue.relations.length > 0 ? issue.relations : undefined;
		case 'start_date':
			return issue.startDate ?? undefined;
		case 'end_date':
			return issue.endDate ?? undefined;
		case 'duration':
			return issue.duration ?? undefined;
		case 'sprint_id':
			return issue.sprintId ?? undefined;
		case 'estimate':
			return issue.estimate ?? undefined;
		default:
			return undefined;
	}
}

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

const DUMP_OPTIONS = {
	lineWidth: -1,
	noRefs: true,
	sortKeys: false,
	quotingType: '"' as const,
	forceQuotes: false
};

function serializeSection(section: { name: string; markdown: string }): string {
	const body = section.markdown.endsWith('\n') ? section.markdown : `${section.markdown}\n`;
	return `## ${section.name}\n<!-- [SECTION_START: ${section.name}] -->\n${body}<!-- [SECTION_END: ${section.name}] -->\n`;
}

function serializeCanonical(issue: Issue): string {
	const fm = buildFrontmatter(issue, null);
	const yamlText = yaml.dump(fm, DUMP_OPTIONS);
	const body = issue.sections.map(serializeSection).join('\n');
	return `---\n${yamlText}---\n\n${body}`;
}

export async function serializeIssue(issue: Issue): Promise<string> {
	const canonical = serializeCanonical(issue);
	const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
	const fm = buildFrontmatter(issue, `sha256:${hash}`);
	const yamlText = yaml
		.dump(fm, DUMP_OPTIONS)
		.replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
	const body = issue.sections.map(serializeSection).join('\n');
	return `---\n${yamlText}---\n\n${body}`;
}

export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'untitled';
}

export function buildIssueFilename(id: string, title: string): string {
	return `${id}-${slugify(title)}.md`;
}
