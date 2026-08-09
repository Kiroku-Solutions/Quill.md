import { renderSafeHtml } from '$lib/adapters/renderer';

let quillPolicy: unknown;
let defaultPolicy: unknown;

export function initDefaultPolicy() {
	if (typeof window === 'undefined') return;

	// @ts-expect-error - trustedTypes is not in standard lib without types
	if (!defaultPolicy && window.trustedTypes) {
		try {
			// @ts-expect-error - trustedTypes is not in standard lib
			defaultPolicy = window.trustedTypes.createPolicy('default', {
				createHTML: (s: string) => renderSafeHtml(s, 'mermaid')
			});
		} catch {
			// Policy might already exist
		}
	}
}

export function getQuillPolicy() {
	if (typeof window === 'undefined') return undefined;

	// @ts-expect-error - trustedTypes is not in standard lib without types
	if (!quillPolicy && window.trustedTypes) {
		try {
			// @ts-expect-error - trustedTypes is not in standard lib
			quillPolicy = window.trustedTypes.createPolicy('quill-md', {
				createHTML: (s: string) => s,
				createScript: (s: string) => s,
				createScriptURL: (s: string) => s
			});
		} catch {
			// Policy already exists or failed
		}
	}
	return quillPolicy as {
		createHTML: (s: string) => string;
		createScript: (s: string) => string;
		createScriptURL: (s: string) => string;
	};
}

export function createTrustedHtml(html: string) {
	const policy = getQuillPolicy();
	return policy ? policy.createHTML(html) : html;
}

export function createTrustedScript(script: string) {
	const policy = getQuillPolicy();
	return policy ? policy.createScript(script) : script;
}
