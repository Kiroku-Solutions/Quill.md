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

export function serializeIssue(issue: Issue): string {
  const frontmatter: any = {
    id: issue.id,
    title: issue.title,
    author: issue.author,
    creationDate: issue.creationDate,
    updatedDate: issue.updatedDate,
    issueType: issue.issueType,
    status: issue.status,
    assignee: issue.assignee,
    labels: issue.labels,
    relations: issue.relations,
  };

  if (issue.startDate !== null) frontmatter.startDate = issue.startDate;
  if (issue.endDate !== null) frontmatter.endDate = issue.endDate;
  if (issue.duration !== null) frontmatter.duration = issue.duration;
  if (issue.sprintId !== null) frontmatter.sprintId = issue.sprintId;
  if (issue.estimate !== null) frontmatter.estimate = issue.estimate;

  if (Object.keys(issue.customFields).length > 0) {
    frontmatter.customFields = issue.customFields;
  }

  // Placeholder for hash
  frontmatter.integrityHash = issue.integrityHash || null;

  const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });

  let mdStr = `---\n${yamlStr}---\n`;

  for (let i = 0; i < issue.sections.length; i++) {
    const sec = issue.sections[i];
    mdStr += `\n# ${sec.name}\n\n${sec.markdown}\n`;
  }

  return mdStr;
}

export function buildIssueFilename(id: number, title: string): string {
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${id}-${safeTitle}.md`;
}
