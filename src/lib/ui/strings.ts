import { i18n } from './i18n/store.svelte';
import type { Params, Leaf } from './i18n/types';
import type { Translations } from './i18n/en';

/**
 * i18n string map + `t` helper
 *
 * Exposes a reactive `t(key, params)` helper.
 * Relies on Svelte 5 runes under the hood.
 */

import { en } from './i18n/en';

// Keep for backwards compatibility with types, pointing to English structure
export type Strings = Translations;
export type StringKey = string;
export const STRINGS = en;

/**
 * Walk active language dictionary by dotted path. If the leaf is a function, call it
 * with the params object. If the key is missing, return `[[key]]`
 * AND log a `console.warn` in dev.
 */
export function t(key: string, params?: Params): string {
	// Accessing i18n.t evaluates the reactive state, making any Svelte component
	// that calls this function reactive to language changes.
	const activeDictionary = i18n.t;
	const leaf = resolveKey(activeDictionary, key) as Leaf | undefined;

	if (typeof leaf === 'function') {
		return leaf(params ?? {});
	}
	if (typeof leaf === 'string') {
		return leaf;
	}
	if (import.meta.env.DEV) {
		console.warn(`[quill-md] t: missing key "${key}" in language "${i18n.locale}"`);
	}
	return `[[${key}]]`;
}

function resolveKey(root: unknown, key: string): unknown {
	const parts = key.split('.');
	let cursor: unknown = root;
	for (const part of parts) {
		if (cursor === null || cursor === undefined) return undefined;
		if (typeof cursor !== 'object') return undefined;
		const desc = Object.getOwnPropertyDescriptor(cursor as Record<string, unknown>, part);
		if (!desc) return undefined;
		cursor = desc.value;
	}
	return cursor;
}
