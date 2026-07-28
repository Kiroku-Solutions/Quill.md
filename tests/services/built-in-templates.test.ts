/**
 * Tests for `src/lib/services/built-in-templates.ts`.
 *
 * The built-in template bundle is the six ERS §6.4 templates (Epic,
 * Use Case, User Story, Task, Bug, Sprint) that ship with the application and are offered
 * through the first-run wizard (FR-11). The tests pin:
 *  - the bundle has exactly six entries;
 *  - the six ids match the ERS Appendix C table;
 *  - `getBuiltInTemplate` finds each one and returns `undefined` for
 *    unknown ids;
 *  - `defaultConfig()` returns the ERS §6.3.1 shape;
 *  - `defaultConfig()` returns a fresh object every call (no shared
 *    mutation surface).
 */
import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_TEMPLATES,
	defaultConfig,
	getBuiltInTemplate
} from '$lib/services/built-in-templates';

const EXPECTED_IDS = ['epic', 'use-case', 'user-story', 'task', 'bug', 'sprint'] as const;

describe('BUILT_IN_TEMPLATES', () => {
	it('has exactly six entries', () => {
		expect(BUILT_IN_TEMPLATES).toHaveLength(6);
	});

	it('contains the six ERS Appendix C ids in declaration order', () => {
		expect(BUILT_IN_TEMPLATES.map((t) => t.id)).toEqual([...EXPECTED_IDS]);
	});

	it('each entry has the required type-level metadata fields', () => {
		for (const tpl of BUILT_IN_TEMPLATES) {
			expect(tpl.id).toBeTypeOf('string');
			expect(tpl.name).toBeTypeOf('string');
			expect(tpl.icon).toBeTypeOf('string');
			expect(tpl.color).toMatch(/^#[0-9a-fA-F]{6}$/);
			expect(tpl.default_status).toBeTypeOf('string');
			expect(Array.isArray(tpl.fields)).toBe(true);
			expect(Array.isArray(tpl.sections)).toBe(true);
		}
	});
});

describe('getBuiltInTemplate', () => {
	it.each(EXPECTED_IDS)('finds the %s template by id', (id) => {
		const t = getBuiltInTemplate(id);
		expect(t).toBeDefined();
		expect(t?.id).toBe(id);
	});

	it('returns undefined for an unknown id', () => {
		expect(getBuiltInTemplate('not-a-template')).toBeUndefined();
		expect(getBuiltInTemplate('')).toBeUndefined();
	});
});

describe('defaultConfig', () => {
	it('returns the ERS §6.3.1 shape', () => {
		const cfg = defaultConfig();
		expect(cfg.statuses.map((s) => s.id)).toEqual([
			'open',
			'in_progress',
			'in_review',
			'done',
			'closed'
		]);
		expect(cfg.default_status).toBe('open');
		expect(cfg.labels.map((l) => l.id)).toEqual(['frontend', 'backend', 'docs', 'security']);
		expect(cfg.users).toEqual([{ id: 'local-user', name: 'Local user' }]);
		expect(cfg.kanban.columns).toEqual(['open', 'in_progress', 'in_review', 'done']);
		expect(cfg.gantt.group_by).toBe('issue_type');
		expect(cfg.gantt.default_view).toBe('months');
		expect(cfg.remote.provider).toBe('github');
		expect(cfg.remote.edit_branch).toBe('quill-md');
	});

	it('returns a fresh object on every call (no shared mutation)', () => {
		const a = defaultConfig();
		const b = defaultConfig();
		expect(a).not.toBe(b);
		expect(a.statuses).not.toBe(b.statuses);
		a.statuses[0]!.name = 'mutated';
		expect(b.statuses[0]!.name).toBe('Open');
	});
});
