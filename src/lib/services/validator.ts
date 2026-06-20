import type { Config, Issue, RelationType, Template } from '../types/index.ts';
import { RELATION_TYPES } from '../types/index.ts';

const STRICT_RELATION_TYPES: ReadonlySet<RelationType> = new Set<RelationType>([
	'parent',
	'child',
	'blocks',
	'depends_on'
]);

export interface ValidationError {
	/** Field key (frontmatter key for fields, section key for sections). */
	field: string;
	message: string;
}

export interface ValidationContext {
	templates: readonly Template[];
	config: Config;
	allIssues: readonly Issue[];
}

export interface ValidationResult {
	ok: boolean;
	errors: ValidationError[];
}

function pushError(out: ValidationError[], field: string, message: string): void {
	out.push({ field, message });
}

function isEmptyValue(value: unknown): boolean {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

/**
 * Detect cycles in the directed graph formed by `parent` / `child` /
 * `blocks` / `depends_on` relations. `relates_to` edges are ignored per
 * ERS §3.1 FR-9. Returns one error per issue that participates in any
 * detected cycle.
 */
function detectCycles(issues: readonly Issue[]): Map<number, number[]> {
	const errors = new Map<number, number[]>();
	const byId = new Map<number, Issue>();
	for (const issue of issues) byId.set(issue.id, issue);

	const adjacency = new Map<number, number[]>();
	for (const issue of issues) {
		const edges: number[] = [];
		for (const rel of issue.relations) {
			if (!STRICT_RELATION_TYPES.has(rel.type)) continue;
			if (!byId.has(rel.id)) continue; // dangling edges are reported separately
			edges.push(rel.id);
		}
		adjacency.set(issue.id, edges);
	}

	const visited = new Set<number>();
	const onStack = new Set<number>();
	const stack: number[] = [];

	function visit(id: number): void {
		if (onStack.has(id)) {
			const start = stack.indexOf(id);
			if (start >= 0) {
				const cycle = stack.slice(start).concat(id);
				for (const node of cycle) {
					const existing = errors.get(node) ?? [];
					existing.push(id);
					errors.set(node, existing);
				}
			}
			return;
		}
		if (visited.has(id)) return;
		visited.add(id);
		onStack.add(id);
		stack.push(id);
		for (const next of adjacency.get(id) ?? []) visit(next);
		stack.pop();
		onStack.delete(id);
	}

	for (const id of adjacency.keys()) visit(id);
	return errors;
}

/**
 * Validate an issue against the project templates, config, and the rest of
 * the issue set (for relation targets and cycle detection). Pure function;
 * does not throw on validation failure — it returns a structured result
 * that the UI can render.
 */
export function validateIssue(issue: Issue, ctx: ValidationContext): ValidationResult {
	const errors: ValidationError[] = [];

	const template = ctx.templates.find((t) => t.id === issue.issueType);
	if (!template) {
		pushError(errors, 'issue_type', `Unknown issue type: "${issue.issueType}"`);
	} else {
		for (const field of template.fields) {
			if (!field.obligatory) continue;
			const value = (issue.customFields as Record<string, unknown>)[field.key];
			if (isEmptyValue(value)) {
				pushError(errors, field.key, `${field.name} is required`);
			}
		}
		for (const section of template.sections) {
			if (!section.obligatory) continue;
			const found = issue.sections.find((s) => s.name === section.name);
			if (!found || found.markdown.trim() === '') {
				pushError(errors, section.key, `${section.name} is required`);
			}
		}
	}

	if (issue.title.trim() === '') {
		pushError(errors, 'title', 'Title is required');
	}
	if (issue.creationDate.trim() === '') {
		pushError(errors, 'creation_date', 'Creation date is required');
	}
	if (issue.updatedDate.trim() === '') {
		pushError(errors, 'updated_date', 'Updated date is required');
	}
	if (issue.author.trim() === '') {
		pushError(errors, 'author', 'Author is required');
	}
	if (issue.id <= 0) {
		pushError(errors, 'id', 'Id must be a positive integer');
	}

	if (!ctx.config.statuses.some((s) => s.id === issue.status)) {
		pushError(errors, 'status', `Unknown status: "${issue.status}"`);
	}

	const ids = new Set(ctx.allIssues.map((i) => i.id));
	for (let i = 0; i < issue.relations.length; i++) {
		const rel = issue.relations[i];
		if (!rel) continue;
		if (!RELATION_TYPES.includes(rel.type)) {
			pushError(errors, `relations[${i}].type`, `Unknown relation type: "${rel.type}"`);
			continue;
		}
		if (rel.id === issue.id) {
			pushError(errors, `relations[${i}].id`, `An issue cannot relate to itself`);
			continue;
		}
		if (!ids.has(rel.id)) {
			pushError(errors, `relations[${i}].id`, `Relation target ${rel.id} does not exist`);
		}
	}

	const cycles = detectCycles(ctx.allIssues);
	const myCycle = cycles.get(issue.id);
	if (myCycle && myCycle.length > 0) {
		pushError(
			errors,
			'relations',
			`Relation cycle detected involving issues ${myCycle.join(' → ')}`
		);
	}

	return { ok: errors.length === 0, errors };
}
