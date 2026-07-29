import yaml from 'js-yaml';
import crypto from 'node:crypto';
const SYSTEM_FRONTMATTER_KEY_ORDER = [
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
];
function yamlValueFor(issue, yamlKey) {
    switch (yamlKey) {
        case 'id':
            return issue.id || undefined;
        case 'title':
            return issue.title ? issue.title : undefined;
        case 'author':
            return issue.author ? issue.author : undefined;
        case 'creation_date':
            return issue.creationDate ? issue.creationDate : undefined;
        case 'updated_date':
            return issue.updatedDate ? issue.updatedDate : undefined;
        case 'issue_type':
            return issue.issueType ? issue.issueType : undefined;
        case 'status':
            return issue.status ? issue.status : undefined;
        case 'assignee':
            return issue.assignee ?? undefined;
        case 'labels':
            return issue.labels.length > 0 ? issue.labels : undefined;
        case 'relations':
            return issue.relations.length > 0 ? issue.relations : undefined;
        case 'start_date':
            return issue.startDate ?? undefined;
        case 'end_date':
            return issue.endDate ?? undefined;
        case 'duration':
            return issue.duration ?? undefined;
        case 'sprint_id':
            return issue.sprintId ?? undefined;
        case 'estimate':
            return issue.estimate ?? undefined;
        default:
            return undefined;
    }
}
function buildFrontmatter(issue, hash) {
    const out = {};
    for (const yamlKey of SYSTEM_FRONTMATTER_KEY_ORDER) {
        if (yamlKey === 'integrity_hash')
            continue;
        const value = yamlValueFor(issue, yamlKey);
        if (value === undefined)
            continue;
        out[yamlKey] = value;
    }
    for (const [key, value] of Object.entries(issue.customFields)) {
        if (value === undefined)
            continue;
        out[key] = value;
    }
    if (hash !== null) {
        out['integrity_hash'] = hash;
    }
    return out;
}
const DUMP_OPTIONS = {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false
};
function serializeSection(section) {
    const body = section.markdown.endsWith('\n') ? section.markdown : `${section.markdown}\n`;
    return `## ${section.name}\n<!-- [SECTION_START: ${section.name}] -->\n${body}<!-- [SECTION_END: ${section.name}] -->\n`;
}
function serializeCanonical(issue) {
    const fm = buildFrontmatter(issue, null);
    const yamlText = yaml.dump(fm, DUMP_OPTIONS);
    const body = issue.sections.map(serializeSection).join('\n');
    return `---\n${yamlText}---\n\n${body}`;
}
export async function serializeIssue(issue) {
    const canonical = serializeCanonical(issue);
    const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    const fm = buildFrontmatter(issue, `sha256:${hash}`);
    const yamlText = yaml
        .dump(fm, DUMP_OPTIONS)
        .replace(/^integrity_hash: (.*)$/m, 'integrity_hash: "$1"');
    const body = issue.sections.map(serializeSection).join('\n');
    return `---\n${yamlText}---\n\n${body}`;
}
export function slugify(title) {
    const slug = title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'untitled';
}
export function buildIssueFilename(id, title) {
    return `${id}-${slugify(title)}.md`;
}
