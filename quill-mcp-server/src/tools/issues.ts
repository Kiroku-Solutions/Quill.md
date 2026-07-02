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
            filename: file,
          });
        } catch (e) {
          // ignore parsing error
        }
      }
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(issues, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error reading issues: ${error.message}` }],
      isError: true,
    };
  }
}

export async function readIssue(issueId: number) {
  const issuesDir = getIssuesDir();
  try {
    const files = await fs.readdir(issuesDir);
    const file = files.find(f => f.startsWith(`${issueId}-`) && f.endsWith('.md'));
    if (!file) {
      return {
        content: [{ type: "text" as const, text: `Issue ID ${issueId} not found` }],
        isError: true,
      };
    }
    const content = await fs.readFile(path.join(issuesDir, file), 'utf-8');
    return {
      content: [{ type: "text" as const, text: content }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error reading issue: ${error.message}` }],
      isError: true,
    };
  }
}

export async function createIssue(
  title: string,
  issueType: string,
  status: string,
  description: string,
  parentId?: number
) {
  const issuesDir = getIssuesDir();
  try {
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
      relations: parentId ? [{ type: 'child', id: parentId }] : [],
      startDate: null,
      endDate: null,
      duration: null,
      sprintId: null,
      estimate: null,
      integrityHash: null,
      customFields: {},
      sections: [
        { name: 'Description', markdown: description }
      ]
    };

    const serialized = serializeIssue(issue);
    const filename = buildIssueFilename(issue.id, issue.title);
    await fs.mkdir(issuesDir, { recursive: true });
    await fs.writeFile(path.join(issuesDir, filename), serialized);

    return {
      content: [{ type: "text" as const, text: `Successfully created issue ${newId}: ${filename}\n\n${serialized}` }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error creating issue: ${error.message}` }],
      isError: true,
    };
  }
}
