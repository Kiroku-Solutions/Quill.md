import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listIssues, readIssue, createIssue } from './tools/issues.js';
import { createTemplate } from './tools/templates.js';
import { initPreset } from './tools/init.js';

const server = new McpServer({
	name: 'quill-mcp-server',
	version: '1.0.0'
});

server.tool(
	'quill_init_preset',
	"Initializes a Quill.md project with a base preset (e.g. 'scrum'). Creates config.json and base templates.",
	{
		presetId: z.string().describe("The ID of the preset to initialize (e.g. 'scrum')"),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ presetId, projectDir }) => {
		return await initPreset(presetId, projectDir);
	}
);

server.tool(
	'quill_list_issues',
	'Lists all issues in the local Quill.md repository.',
	{
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ projectDir }) => {
		return await listIssues(projectDir);
	}
);

server.tool(
	'quill_read_issue',
	'Reads the full content of a specific Quill.md issue.',
	{
		issueId: z.string().describe('The ID of the issue to read'),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ issueId, projectDir }) => {
		return await readIssue(issueId, projectDir);
	}
);

server.tool(
	'quill_create_issue',
	'Creates a new issue in the Quill.md repository. Use this to translate requirements into epics, stories, and tasks.',
	{
		title_text: z.string().describe('The title of the issue'),
		issueType: z.string().describe('The type of issue (e.g. epic, user-story, task)'),
		status: z.string().describe('The status (e.g. open, in_progress, done)'),
		sections: z
			.record(z.string())
			.describe('A dictionary mapping section names to their markdown content'),
		relations: z
			.array(z.object({ type: z.string(), id: z.string() }))
			.optional()
			.describe('Array of relations to other issues'),
		customFields: z.record(z.any()).optional().describe('Optional dictionary for custom fields'),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ title_text, issueType, status, sections, relations, customFields, projectDir }) => {
		return await createIssue(
			title_text,
			issueType,
			status,
			sections,
			relations,
			customFields,
			projectDir
		);
	}
);

server.tool(
	'quill_create_template',
	'Creates a new issue template in the Quill.md repository. Pass the complete JSON definition of the template as a string.',
	{
		templateJson: z
			.string()
			.describe(
				"The JSON string representing the template object (must include at least 'id' and 'name')"
			),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ templateJson, projectDir }) => {
		return await createTemplate(templateJson, projectDir);
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('Quill.md MCP Server running on stdio');
}

main().catch(console.error);
