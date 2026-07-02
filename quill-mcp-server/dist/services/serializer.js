import yaml from 'js-yaml';
export function serializeIssue(issue) {
    const frontmatter = {
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
    if (issue.startDate !== null)
        frontmatter.startDate = issue.startDate;
    if (issue.endDate !== null)
        frontmatter.endDate = issue.endDate;
    if (issue.duration !== null)
        frontmatter.duration = issue.duration;
    if (issue.sprintId !== null)
        frontmatter.sprintId = issue.sprintId;
    if (issue.estimate !== null)
        frontmatter.estimate = issue.estimate;
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
export function buildIssueFilename(id, title) {
    const safeTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
    return `${id}-${safeTitle}.md`;
}
