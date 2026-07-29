import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import crypto from 'node:crypto';
import { serializeIssue, buildIssueFilename, Issue } from '../services/serializer.js';

function getIssuesDir() {
	const dir = process.argv[2] || process.cwd();
	return path.join(dir, '.quill.md', 'issues');
}

export async function listIssues() {
	const issuesDir = getIssuesDir();
	try {
		const issues = [];
		const dirs = [issuesDir, path.join(issuesDir, 'open'), path.join(issuesDir, 'closed')];
		for (const dir of dirs) {
			let files: string[] = [];
			try {
				files = await fs.readdir(dir);
			} catch {
				continue;
			}
			for (const file of files) {
				if (!file.endsWith('.md')) continue;
				const content = await fs.readFile(path.join(dir, file), 'utf-8');
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
					} catch {
						// ignore parsing error
					}
				}
			}
		}
		return {
			content: [{ type: 'text' as const, text: JSON.stringify(issues, null, 2) }]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error reading issues: ${msg}` }],
			isError: true
		};
	}
}

export async function readIssue(issueId: string) {
	const issuesDir = getIssuesDir();
	try {
		const dirs = [issuesDir, path.join(issuesDir, 'open'), path.join(issuesDir, 'closed')];
		let foundContent: string | null = null;
		for (const dir of dirs) {
			let files: string[] = [];
			try {
				files = await fs.readdir(dir);
			} catch {
				continue;
			}
			const file = files.find((f) => f.startsWith(`${issueId}-`) && f.endsWith('.md'));
			if (file) {
				foundContent = await fs.readFile(path.join(dir, file), 'utf-8');
				break;
			}
		}
		if (!foundContent) {
			return {
				content: [{ type: 'text' as const, text: `Issue ID ${issueId} not found` }],
				isError: true
			};
		}
		return {
			content: [{ type: 'text' as const, text: foundContent }]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error reading issue: ${msg}` }],
			isError: true
		};
	}
}

export async function createIssue(
	title: string,
	issueType: string,
	status: string,
	sections: Record<string, string>,
	relations?: Array<{ type: string; id: string }>,
	customFields?: Record<string, unknown>
) {
	const issuesDir = getIssuesDir();
	try {
		// --- STRICT VALIDATION ---
		const dir = process.argv[2] || process.cwd();
		const templatePath = path.join(dir, '.quill.md', 'templates', `${issueType}.json`);

		let template: Record<string, unknown>;
		try {
			const templateContent = await fs.readFile(templatePath, 'utf-8');
			template = JSON.parse(templateContent);
		} catch (e) {
			throw new Error(
				`Strict Validation Failed: Template for issue type '${issueType}' does not exist.`,
				{ cause: e }
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

		const newId = crypto.randomUUID();

		const issueSections = Object.entries(sections).map(([key, markdown]) => {
			let tplSecName = key;
			if (template.sections && Array.isArray(template.sections)) {
				const tplSec = template.sections.find((s: Record<string, unknown>) => s.key === key);
				if (tplSec && typeof tplSec.name === 'string') {
					tplSecName = tplSec.name;
				}
			}
			return {
				name: tplSecName,
				markdown
			};
		});

		if (customFields) {
			const systemKeys = new Set([
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
			]);
			for (const k of Object.keys(customFields)) {
				if (systemKeys.has(k)) {
					delete customFields[k];
				}
			}
		}

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

		let category = 'open';
		try {
			const configContent = await fs.readFile(path.join(dir, '.quill.md', 'config.json'), 'utf-8');
			const config = JSON.parse(configContent);
			const st = config?.statuses?.find((s: Record<string, unknown>) => s.id === status);
			if (st && (st.category === 'done' || st.category === 'cancelled')) {
				category = 'closed';
			}
		} catch {
			if (
				status === 'done' ||
				status === 'closed' ||
				status === 'cancelled' ||
				status === 'rejected'
			) {
				category = 'closed';
			}
		}

		const targetDir = path.join(issuesDir, category);
		await fs.mkdir(targetDir, { recursive: true });
		await fs.writeFile(path.join(targetDir, filename), serialized);

		return {
			content: [
				{
					type: 'text' as const,
					text: `Successfully created issue ${newId}: ${filename}\n\n${serialized}`
				}
			]
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: 'text' as const, text: `Error creating issue: ${msg}` }],
			isError: true
		};
	}
}
