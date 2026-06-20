/**
 * A YAML-compatible scalar, list, or mapping.
 *
 * Used to represent template-defined frontmatter values that don't have a fixed
 * type (anything outside the system keys defined in ERS §6.1.3).
 */
export type FrontmatterValue =
	| string
	| number
	| boolean
	| null
	| FrontmatterValue[]
	| { [key: string]: FrontmatterValue };
