import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listIssues, readIssue, createIssue } from "./tools/issues.js";

const server = new McpServer({
  name: "quill-mcp-server",
  version: "1.0.0"
});

server.tool(
  "quill_list_issues",
  "Lists all issues in the local Quill.md repository.",
  async () => {
    return await listIssues();
  }
);

server.tool(
  "quill_read_issue",
  "Reads the full content of a specific Quill.md issue.",
  {
    issueId: z.number().describe("The ID of the issue to read"),
  },
  async ({ issueId }) => {
    return await readIssue(issueId);
  }
);

server.tool(
  "quill_create_issue",
  "Creates a new issue in the Quill.md repository. Use this to translate requirements into epics, stories, and tasks.",
  {
    title_text: z.string().describe("The title of the issue"),
    issueType: z.string().describe("The type of issue (e.g. epic, story, task)"),
    status: z.string().describe("The status (e.g. open, in-progress, done)"),
    description: z.string().describe("The full markdown description"),
    parentId: z.number().optional().describe("Optional ID of the parent issue (for hierarchy)"),
  },
  async ({ title_text, issueType, status, description, parentId }) => {
    return await createIssue(title_text, issueType, status, description, parentId);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Quill.md MCP Server running on stdio");
}

main().catch(console.error);
