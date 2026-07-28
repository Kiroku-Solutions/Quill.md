import yaml from 'js-yaml';

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

import crypto from 'node:crypto';

export async function serializeIssue(issue: Issue): Promise<string> {
	const frontmatter: any = {
		id: issue.id,
		title: issue.title,
		author: issue.author,
		creation_date: issue.creationDate,
		updated_date: issue.updatedDate,
		issue_type: issue.issueType,
		status: issue.status,
		assignee: issue.assignee,
		labels: issue.labels,
		relations: issue.relations
	};

	if (issue.startDate !== null) frontmatter.start_date = issue.startDate;
	if (issue.endDate !== null) frontmatter.end_date = issue.endDate;
	if (issue.duration !== null) frontmatter.duration = issue.duration;
	if (issue.sprintId !== null) frontmatter.sprint_id = issue.sprintId;
	if (issue.estimate !== null) frontmatter.estimate = issue.estimate;

	// Add custom fields at the top level
	for (const key of Object.keys(issue.customFields)) {
		frontmatter[key] = issue.customFields[key];
	}

	const yamlStrWithoutHash = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' });

	let bodyStrs = [];
	for (let i = 0; i < issue.sections.length; i++) {
		const sec = issue.sections[i];
		const body = sec.markdown.endsWith('\n') ? sec.markdown : `${sec.markdown}\n`;
		bodyStrs.push(`## ${sec.name}\n<!-- [SECTION_START: ${sec.name}] -->\n${body}<!-- [SECTION_END: ${sec.name}] -->\n`);
	}
	const bodyStr = bodyStrs.join('\n');

	let mdStrWithoutHash = `---\n${yamlStrWithoutHash}---\n\n${bodyStr}`;

	// Compute integrity hash using SHA-256 hex digest of the string
	const hash = crypto.createHash('sha256').update(mdStrWithoutHash, 'utf8').digest('hex');
	frontmatter.integrity_hash = `sha256:${hash}`;

	// Now dump it with the hash included
	const finalYamlStr = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' }).replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
	return `---\n${finalYamlStr}---\n\n${bodyStr}`;
}

export function buildIssueFilename(id: string, title: string): string {
	const safeTitle = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 50);
	return `${id}-${safeTitle}.md`;
}
