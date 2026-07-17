import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { serializeIssue, buildIssueFilename, Issue } from '../services/serializer.js';

function getIssuesDir() {
	const dir = process.argv[2] || process.cwd();
	return path.join(dir, '.quill.md', 'issues');
}

export async function listIssues() {
	const issuesDir = getIssuesDir();
	try {
		const files = await fs.readdir(issuesDir);
		const issues = [];
		for (const file of files) {
			if (!file.endsWith('.md')) continue;
			const content = await fs.readFile(path.join(issuesDir, file), 'utf-8');
			const match = content.match(/^---\n([\s\S]*?)\n---/);
			if (match) {
				try {
					const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
					issues.push({
						id: frontmatter.id,
						title: frontmatter.title,
						issueType: frontmatter.issueType,
						status: frontmatter.status,
						filename: file
					});
				} catch (e) {
					// ignore parsing error
				}
			}
		}
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(issues, null, 2) }]
		};
	} catch (error: any) {
		return {
			content: [{ type: 'text' as const, text: `Error reading issues: ${error.message}` }],
			isError: true
		};
	}
}

export async function readIssue(issueId: number) {
	const issuesDir = getIssuesDir();
	try {
		const files = await fs.readdir(issuesDir);
		const file = files.find((f) => f.startsWith(`${issueId}-`) && f.endsWith('.md'));
		if (!file) {
			return {
				content: [{ type: 'text' as const, text: `Issue ID ${issueId} not found` }],
				isError: true
			};
		}
		const content = await fs.readFile(path.join(issuesDir, file), 'utf-8');
		return {
			content: [{ type: 'text' as const, text: content }]
		};
	} catch (error: any) {
		return {
			content: [{ type: 'text' as const, text: `Error reading issue: ${error.message}` }],
			isError: true
		};
	}
}

export async function createIssue(
	title: string,
	issueType: string,
	status: string,
	sections: Record<string, string>,
	relations?: Array<{ type: string; id: number }>,
	customFields?: Record<string, unknown>
) {
	const issuesDir = getIssuesDir();
	try {
		// --- STRICT VALIDATION ---
		const dir = process.argv[2] || process.cwd();
		const templatePath = path.join(dir, '.quill.md', 'templates', `${issueType}.json`);

		let template: any;
		try {
			const templateContent = await fs.readFile(templatePath, 'utf-8');
			template = JSON.parse(templateContent);
		} catch (e) {
			throw new Error(
				`Strict Validation Failed: Template for issue type '${issueType}' does not exist.`
			);
		}

		if (template.fields && Array.isArray(template.fields)) {
			for (const field of template.fields) {
				if (field.obligatory === true) {
					if (field.key === 'status' && !status) {
						throw new Error(
							`Strict Validation Failed: The system field 'status' is obligatory for '${issueType}'.`
						);
					}
					if (field.id > 0) {
						if (
							!customFields ||
							customFields[field.key] === undefined ||
							customFields[field.key] === null ||
							customFields[field.key] === ''
						) {
							throw new Error(
								`Strict Validation Failed: The custom field '${field.key}' is obligatory for '${issueType}'. You must provide it in the customFields parameter.`
							);
						}
					}
				}
			}
		}

		if (template.sections && Array.isArray(template.sections)) {
			for (const section of template.sections) {
				if (section.obligatory === true) {
					if (
						!sections ||
						sections[section.key] === undefined ||
						sections[section.key].trim() === ''
					) {
						throw new Error(
							`Strict Validation Failed: The section '${section.key}' is obligatory for '${issueType}'. You must provide markdown content for it.`
						);
					}
				}
			}
		}
		// --- END STRICT VALIDATION ---

		// Generate new ID
		let maxId = 0;
		const files = await fs.readdir(issuesDir).catch(() => []);
		for (const file of files) {
			const match = file.match(/^(\d+)-/);
			if (match) {
				const id = parseInt(match[1], 10);
				if (id > maxId) maxId = id;
			}
		}
		const newId = maxId + 1;

		const issueSections = Object.entries(sections).map(([name, markdown]) => ({
			name,
			markdown
		}));

		const issue: Issue = {
			id: newId,
			title,
			author: 'AI Agent (MCP)',
			creationDate: new Date().toISOString().split('T')[0],
			updatedDate: new Date().toISOString().split('T')[0],
			issueType,
			status,
			assignee: null,
			labels: ['ai-generated'],
			relations: relations || [],
			startDate: null,
			endDate: null,
			duration: null,
			sprintId: null,
			estimate: null,
			integrityHash: null,
			customFields: customFields || {},
			sections: issueSections
		};

		const serialized = await serializeIssue(issue);
		const filename = buildIssueFilename(issue.id, issue.title);
		await fs.mkdir(issuesDir, { recursive: true });
		await fs.writeFile(path.join(issuesDir, filename), serialized);

		return {
			content: [
				{
					type: 'text' as const,
					text: `Successfully created issue ${newId}: ${filename}\n\n${serialized}`
				}
			]
		};
	} catch (error: any) {
		return {
			content: [{ type: 'text' as const, text: `Error creating issue: ${error.message}` }],
			isError: true
		};
	}
}
