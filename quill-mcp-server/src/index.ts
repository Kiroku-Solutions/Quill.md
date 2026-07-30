import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { listIssues, readIssue, createIssue } from './tools/issues.js';
import { createTemplate } from './tools/templates.js';
import { initPreset } from './tools/init.js';
import { createWikiPage, createAdr } from './tools/docs.js';

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

server.tool(
	'quill_create_wiki_page',
	'Creates a new Wiki page in the Quill.md repository (.quill.md/wiki). Use this for general documentation or specifications.',
	{
		title: z.string().describe('The title of the Wiki page (used for the filename)'),
		content: z.string().describe('The markdown content of the Wiki page'),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ title, content, projectDir }) => {
		return await createWikiPage(title, content, projectDir);
	}
);

server.tool(
	'quill_create_adr',
	'Creates a new Architecture Decision Record (ADR) in the Quill.md repository (.quill.md/adr).',
	{
		title: z.string().describe('The title of the ADR (e.g. "0001-use-svelte-for-frontend")'),
		status: z.string().describe('The status of the ADR (e.g. Proposed, Accepted, Superseded)'),
		context: z.string().describe('The context or background of the decision'),
		decision: z.string().describe('The decision that was made'),
		consequences: z.string().describe('The consequences of the decision'),
		projectDir: z.string().optional().describe('Optional absolute path to the project directory.')
	},
	async ({ title, status, context, decision, consequences, projectDir }) => {
		return await createAdr(title, status, context, decision, consequences, projectDir);
	}
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('Quill.md MCP Server running on stdio');
}

main().catch(console.error);
