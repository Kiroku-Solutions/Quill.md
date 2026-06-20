import type { FrontmatterValue } from './frontmatter.ts';

/**
 * FR-9 relation type taxonomy.
 *
 * - `parent` / `child`: strict one-to-many hierarchy.
 * - `blocks` / `depends_on`: directed dependency (synonymous in reverse).
 * - `relates_to`: non-directional soft link.
 */
export type RelationType = 'parent' | 'child' | 'blocks' | 'depends_on' | 'relates_to';

export interface Relation {
	type: RelationType;
	id: number;
}

/** All relation types in declaration order. Used by the validator. */
export const RELATION_TYPES: readonly RelationType[] = [
	'parent',
	'child',
	'blocks',
	'depends_on',
	'relates_to'
] as const;

/**
 * A named Markdown section in the body of an issue file (ERS §6.1.4).
 * `markdown` is the verbatim text between the section markers, including any
 * blank lines and inner formatting. Empty sections are allowed.
 */
export interface IssueSection {
	name: string;
	markdown: string;
}

/**
 * The canonical in-memory representation of an issue (ERS §6.1).
 *
 * System fields (defined by the ERS) are first-class. Template-defined
 * additional fields are kept in `customFields` keyed by their `key`; the
 * service layer is responsible for serializing them back in their original
 * order on save.
 *
 * `integrityWarning` is the FR-15 flag: `true` if the file's stored
 * `integrity_hash` was missing or did not match on load. The flag is purely
 * informational; the issue can still be edited and saved.
 */
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
	relations: Relation[];
	startDate: string | null;
	endDate: string | null;
	duration: number | null;
	integrityHash: string | null;
	customFields: Record<string, FrontmatterValue>;
	sections: IssueSection[];
	integrityWarning: boolean;
}

/**
 * The order in which system frontmatter keys are emitted by the serializer.
 * Custom fields follow in their original insertion order after these.
 *
 * This is the canonical layout (ERS Appendix B.6). Any key not in this list
 * is treated as a template-defined custom field.
 */
export const SYSTEM_FRONTMATTER_KEY_ORDER = [
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
	'integrity_hash'
] as const;

export type SystemFrontmatterKey = (typeof SYSTEM_FRONTMATTER_KEY_ORDER)[number];

/**
 * Mapping from camelCase (TS) to snake_case (YAML) for every system field.
 * Used by the parser and serializer so the type layer stays idiomatic while
 * the on-disk format follows the ERS convention.
 */
export interface FieldNameMap {
	id: 'id';
	title: 'title';
	author: 'author';
	creationDate: 'creation_date';
	updatedDate: 'updated_date';
	issueType: 'issue_type';
	status: 'status';
	assignee: 'assignee';
	labels: 'labels';
	relations: 'relations';
	startDate: 'start_date';
	endDate: 'end_date';
	duration: 'duration';
	integrityHash: 'integrity_hash';
}

export const FIELD_TO_YAML: FieldNameMap = {
	id: 'id',
	title: 'title',
	author: 'author',
	creationDate: 'creation_date',
	updatedDate: 'updated_date',
	issueType: 'issue_type',
	status: 'status',
	assignee: 'assignee',
	labels: 'labels',
	relations: 'relations',
	startDate: 'start_date',
	endDate: 'end_date',
	duration: 'duration',
	integrityHash: 'integrity_hash'
};

/**
 * An issue paired with the on-disk location it was loaded from.
 *
 * `sourcePath` is set by the loader and is required for update and delete
 * operations. It is not part of the serialized file format.
 */
export interface LoadedIssue {
	issue: Issue;
	sourcePath: string;
}

/**
 * Convention for the date fields stored in the frontmatter (ERS §6.1.3).
 * We use the `YYYY-MM-DD` form of ISO 8601, which is also what js-yaml emits
 * for date-like scalars under the default schema.
 */
export type IsoDateString = string;
