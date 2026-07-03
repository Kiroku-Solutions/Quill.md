import fs from 'node:fs/promises';
import path from 'node:path';

function getTemplatesDir() {
  const dir = process.argv[2] || process.cwd();
  return path.join(dir, '.quill.md', 'templates');
}

export async function createTemplate(templateJsonStr: string) {
  const templatesDir = getTemplatesDir();
  try {
    const template = JSON.parse(templateJsonStr);
    
    if (!template.id || !template.name) {
      throw new Error('Template must have at least an "id" and a "name" field');
    }

    const filename = `${template.id}.json`;
    await fs.mkdir(templatesDir, { recursive: true });
    
    // Formatting JSON nicely
    await fs.writeFile(path.join(templatesDir, filename), JSON.stringify(template, null, '\t') + '\n');

    return {
      content: [{ type: "text" as const, text: `Successfully created template ${template.id} at ${filename}` }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: `Error creating template: ${error.message}` }],
      isError: true,
    };
  }
}
