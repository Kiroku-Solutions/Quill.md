import fs from 'node:fs/promises';
import path from 'node:path';

function getQuillDir() {
  const dir = process.argv[2] || process.cwd();
  return path.join(dir, '.quill.md');
}

export async function initPreset(presetId: string) {
  const quillDir = getQuillDir();
  const templatesDir = path.join(quillDir, 'templates');
  const issuesDir = path.join(quillDir, 'issues');

  try {
    // Only 'scrum' is currently supported in this basic initialization, but we can map others later.
    // We provide a basic valid Scrum config.
    const config = {
      product_goal: "Build and ship increments of value that meet the Definition of Done every Sprint.",
      definition_of_done: [
        "Code is peer-reviewed and merged to the trunk.",
        "Unit tests pass and coverage meets the team threshold."
      ],
      statuses: [
        { id: "open", name: "Open", color: "#6b7280", category: "todo" },
        { id: "ready", name: "Ready", color: "#0ea5e9", category: "todo" },
        { id: "in_progress", name: "In progress", color: "#3b82f6", category: "doing" },
        { id: "in_review", name: "In review", color: "#f59e0b", category: "doing" },
        { id: "done", name: "Done", color: "#10b981", category: "done" }
      ],
      default_status: "open",
      labels: [],
      users: [],
      kanban: { columns: ["open", "ready", "in_progress", "in_review", "done"] },
      gantt: { group_by: "issue_type", default_view: "weeks" },
      remote: { cors_proxy: "https://cors.isomorphic-git.org" }
    };

    const epicTemplate = {
      id: "epic", name: "Epic", icon: "book-open", color: "#8b5cf6", default_status: "open",
      fields: [],
      sections: [
        { id: 1, key: "description", name: "Description", obligatory: true, default: "" },
        { id: 2, key: "acceptance", name: "Acceptance criteria", obligatory: true, default: "" }
      ]
    };

    const userStoryTemplate = {
      id: "user-story", name: "User Story", icon: "book-open", color: "#3b82f6", default_status: "open",
      fields: [
        { id: 1, key: "story_points", name: "Story points", type: "select", obligatory: true, options: ["1", "2", "3", "5", "8", "13", "21"] }
      ],
      sections: [
        { id: 1, key: "user_story", name: "User story", obligatory: true, default: "**As a** ___\\n**I want** ___\\n**so that** ___." },
        { id: 2, key: "acceptance", name: "Acceptance criteria", obligatory: true, default: "" }
      ]
    };

    const taskTemplate = {
      id: "task", name: "Task", icon: "check-square", color: "#10b981", default_status: "open",
      fields: [],
      sections: [
        { id: 1, key: "description", name: "Description", obligatory: true, default: "" }
      ]
    };

    await fs.mkdir(quillDir, { recursive: true });
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(issuesDir, { recursive: true });

    await fs.writeFile(path.join(quillDir, 'config.json'), JSON.stringify(config, null, 2));
    await fs.writeFile(path.join(templatesDir, 'epic.json'), JSON.stringify(epicTemplate, null, 2));
    await fs.writeFile(path.join(templatesDir, 'user-story.json'), JSON.stringify(userStoryTemplate, null, 2));
    await fs.writeFile(path.join(templatesDir, 'task.json'), JSON.stringify(taskTemplate, null, 2));

    return {
      content: [{ type: "text" as const, text: `Successfully initialized preset ${presetId} in ${quillDir}` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error initializing preset: ${error.message}` }],
      isError: true
    };
  }
}
