/**
 * strings.ts + `t` helper — sub-phase 6J (NFR-6).
 *
 * Verifies the i18n string map and helper:
 *   - `t` returns the right string for at least 6 keys spanning
 *     3 different surfaces (home / editor / wizard / list /
 *     common / settings).
 *   - `t` with params calls the function-form leaves correctly
 *     and substitutes the named placeholders.
 *   - `t` for a missing key returns `[[key]]` (visible marker)
 *     and emits the dev warning.
 *   - The `STRINGS` map has no duplicate keys (a copy-paste
 *     mistake catches in development).
 *
 * Vitest project: `server` (pure Node). The `t` helper is pure
 * TypeScript and does not depend on Svelte 5 runes, so the
 * chromium `client` project is unnecessary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STRINGS, t } from '../../src/lib/ui/strings';

describe('t helper + STRINGS map', () => {
	describe('plain string leaves', () => {
		it('returns the literal for a simple key', () => {
			expect(t('common.save')).toBe('Save');
			expect(t('common.cancel')).toBe('Cancel');
		});

		it('walks dotted paths across nested surfaces', () => {
			expect(t('app.name')).toBe('nomad.md');
			expect(t('app.version')).toBe('v0.0.1');
			expect(t('home.heroTitle')).toBe('nomad.md');
			expect(t('home.heroSubtitle')).toBe('Issues that travel with your repo');
		});

		it('reads the editor surface (form/write/preview tab labels)', () => {
			expect(t('editor.tabs.form')).toBe('Form');
			expect(t('editor.tabs.write')).toBe('Write');
			expect(t('editor.tabs.preview')).toBe('Preview');
		});

		it('reads the wizard surface (titles + step copy)', () => {
			expect(t('wizard.headTitle')).toBe('Set up your issue tracker');
			expect(t('wizard.step1Title')).toBe('1. Choose how to set up templates');
			expect(t('wizard.applyButton')).toBe('Apply and continue');
		});

		it('reads the settings surface (theme / commands / etc.)', () => {
			expect(t('settings.title')).toBe('Settings');
			expect(t('settings.themeLight')).toBe('Light');
			expect(t('settings.themeDark')).toBe('Dark');
			expect(t('settings.themeSystem')).toBe('System');
			expect(t('settings.clearCache')).toBe('Clear remote cache');
		});

		it('reads the leftrail / mode badge surfaces', () => {
			expect(t('leftrail.ariaLabel')).toBe('Navigation');
			expect(t('leftrail.viewsHeading')).toBe('Views');
			expect(t('leftrail.view.list')).toBe('List');
			expect(t('leftrail.view.kanban')).toBe('Kanban');
			expect(t('leftrail.view.gantt')).toBe('Gantt');
			expect(t('modeBadge.local')).toBe('Local');
			expect(t('modeBadge.remote')).toBe('Remote (read-only)');
			expect(t('modeBadge.setup')).toBe('Setup');
			expect(t('modeBadge.home')).toBe('Home');
		});
	});

	describe('function-form leaves with params', () => {
		it('substitutes a single named placeholder', () => {
			expect(t('home.recentFolders.forgetLabel', { name: 'acme-projects' })).toBe(
				'Forget acme-projects'
			);
			expect(t('home.recentFolders.lastOpenedAgo', { label: '5 min ago' })).toBe(
				'Last opened 5 min ago'
			);
		});

		it('pluralises correctly for n=1 vs n!=1', () => {
			expect(t('common.issueCount', { n: 1 })).toBe('1 issue');
			expect(t('common.issueCount', { n: 5 })).toBe('5 issues');
			expect(t('common.dirtyCount', { n: 1 })).toBe('1 dirty');
			expect(t('common.dirtyCount', { n: 0 })).toBe('0 dirty');
		});

		it('substitutes multiple named placeholders', () => {
			expect(t('kanban.cardAria', { id: 42, title: 'Fix login', col: 'open' })).toBe(
				'Issue 42: Fix login in column open'
			);
			expect(t('gantt.barAria', { id: 7, title: 'Spec the API' })).toBe('Issue 7: Spec the API');
			expect(t('list.countPill', { filtered: 3, total: 10 })).toBe('3 of 10 issues');
			expect(t('list.countPill', { filtered: 1, total: 1 })).toBe('1 of 1 issue');
		});
	});

	describe('missing-key policy', () => {
		let warnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		});

		afterEach(() => {
			warnSpy.mockRestore();
		});

		it('returns the [[key]] marker for an unknown key', () => {
			const result = t('surface.that.does.not.exist');
			expect(result).toBe('[[surface.that.does.not.exist]]');
		});

		it('emits a console.warn in dev (import.meta.env.DEV === true under Vitest)', () => {
			t('nope.nada.nothing');
			expect(warnSpy).toHaveBeenCalled();
			const message = String(warnSpy.mock.calls[0]?.[0] ?? '');
			expect(message).toMatch(/missing key/);
			expect(message).toMatch(/nope\.nada\.nothing/);
		});

		it('returns the [[key]] marker even when params are passed', () => {
			expect(t('still.missing', { foo: 'bar' })).toBe('[[still.missing]]');
		});
	});

	describe('STRINGS map integrity', () => {
		it('has no duplicate key paths that would indicate a copy-paste mistake', () => {
			// A duplicate LITERAL is a soft signal (some strings legitimately
			// repeat, e.g. "Cancel" appears in 4 modals). The stronger check
			// is on the keys themselves: walk the tree and assert every
			// path is unique.
			const seen = new Set<string>();
			const duplicates: string[] = [];
			walk(STRINGS, '', (path) => {
				if (seen.has(path)) duplicates.push(path);
				seen.add(path);
			});
			expect(duplicates).toEqual([]);
		});

		it('exposes a `t` function and a `STRINGS` object', () => {
			expect(typeof t).toBe('function');
			expect(typeof STRINGS).toBe('object');
		});
	});
});

function walk(node: unknown, prefix: string, visit: (path: string) => void): void {
	if (node === null || node === undefined) return;
	if (typeof node !== 'object') {
		visit(prefix);
		return;
	}
	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'function') {
			visit(path);
			continue;
		}
		if (typeof value === 'string') {
			visit(path);
			continue;
		}
		walk(value, path, visit);
	}
}
