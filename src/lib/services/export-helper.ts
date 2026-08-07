import type { Issue } from '$lib/types';
import type { ExportDocument } from './exporter';

/**
 * Builds ExportDocument objects from a list of issues, injecting contextual
 * relation information into the generated Markdown to preserve module hierarchy.
 *
 * @param issues The list of issues to export
 * @param getIssueTitle A resolver function to lookup titles for related issues (e.g. from the store)
 */
export function buildExportDocuments(
	issues: Issue[],
	getIssueTitle: (id: string) => string | null,
	options?: { includeRelations?: boolean }
): ExportDocument[] {
	return issues.map((issue) => {
		const parts: string[] = [];

		// Inject Context / Relations section if there are relations and requested
		if (options?.includeRelations && issue.fields.relations && issue.fields.relations.length > 0) {
			parts.push(`## Contexto / Relaciones`);

			const relationLines = issue.fields.relations.map((r) => {
				const title = getIssueTitle(r.id) ?? r.id;
				// Output format: - **parent**: Backend Rewrite (id)
				return `- **${r.type}**: ${title} (${r.id})`;
			});

			parts.push(relationLines.join('\n'));
		}

		// Append the actual issue sections
		const sectionsMarkdown = issue.sections.map((s) => `## ${s.name}\n${s.markdown}`).join('\n\n');
		if (sectionsMarkdown.trim().length > 0) {
			parts.push(sectionsMarkdown);
		}

		return {
			title: issue.fields.title,
			markdown: parts.join('\n\n')
		};
	});
}
