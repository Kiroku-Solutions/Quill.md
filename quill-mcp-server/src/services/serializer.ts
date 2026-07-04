import yaml from 'js-yaml';

export interface Issue {
	id: number;
	title: string;
	author: string;
	creationDate: string;
	updatedDate: string;
	issueType: string;
	status: string;
	assignee: string | null;
	labels: string[];
	relations: Array<{ type: string; id: number }>;
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

	if (Object.keys(issue.customFields).length > 0) {
		frontmatter.custom_fields = issue.customFields;
	}

	// Generate the YAML without integrity_hash first
	const yamlStrWithoutHash = yaml.dump(frontmatter, { lineWidth: -1 });

	let mdStrWithoutHash = `---\n${yamlStrWithoutHash}---\n`;

	for (let i = 0; i < issue.sections.length; i++) {
		const sec = issue.sections[i];
		mdStrWithoutHash += `\n<!-- [SECTION_START: ${sec.name}] -->\n\n${sec.markdown}\n\n<!-- [SECTION_END: ${sec.name}] -->\n`;
	}

	// Compute integrity hash using SHA-256 hex digest of the string
	const hash = crypto.createHash('sha256').update(mdStrWithoutHash, 'utf8').digest('hex');
	frontmatter.integrity_hash = `sha256:${hash}`;

	// Now dump it with the hash included
	const finalYamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
	let finalMdStr = `---\n${finalYamlStr}---\n`;

	for (let i = 0; i < issue.sections.length; i++) {
		const sec = issue.sections[i];
		finalMdStr += `\n<!-- [SECTION_START: ${sec.name}] -->\n\n${sec.markdown}\n\n<!-- [SECTION_END: ${sec.name}] -->\n`;
	}

	return finalMdStr;
}

export function buildIssueFilename(id: number, title: string): string {
	const safeTitle = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 50);
	return `${id}-${safeTitle}.md`;
}
