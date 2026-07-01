import type { FrontmatterValue } from './frontmatter.ts';

/** ERS §6.2.1: the closed set of field types a template can declare. */
export type FieldType =
	| 'text'
	| 'longtext'
	| 'date'
	| 'number'
	| 'select'
	| 'multi-select'
	| 'user'
	| 'relations';

export const FIELD_TYPES: readonly FieldType[] = [
	'text',
	'longtext',
	'date',
	'number',
	'select',
	'multi-select',
	'user',
	'relations'
] as const;

/**
 * A single field declaration on a template (ERS §6.2.1).
 *
 * `options` is required when `type` is `select` or `multi-select`.
 * `options_source` is used by `multi-select` of labels to pull the option
 * list from `config.labels` at render time.
 * `allow_cycle` only applies to `relations`; defaults to `false`.
 */
export interface TemplateField {
	id: number;
	key: string;
	type: FieldType;
	name: string;
	obligatory: boolean;
	default?: FrontmatterValue;
	options?: string[];
	options_source?: string;
	allow_cycle?: boolean;
	// If undefined or empty, any category is allowed.
	// Keys are template IDs, values are array of allowed relation types.
	// If a category has an empty array [], all relation types are allowed for that category.
	allowed_targets?: Record<string, string[]>;
}

/** A single section declaration on a template (ERS §6.2.2). */
export interface TemplateSection {
	id: number;
	key: string;
	name: string;
	obligatory: boolean;
	default?: string;
}

/** ERS §6.2.3: the type-level metadata for one issue type. */
export interface Template {
	id: string;
	name: string;
	icon: string;
	color: string;
	default_status: string;
	fields: TemplateField[];
	sections: TemplateSection[];
}
