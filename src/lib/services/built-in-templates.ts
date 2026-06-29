/**
 * Built-in template bundle (ERS §6.4 / Appendix C).
 *
 * These four templates — Epic, User Story, Task, Bug — are bundled with
 * the application and offered through the first-run wizard (FR-11).
 * Selecting one writes its JSON verbatim into `.nomad.md/templates/`.
 *
 * The shapes mirror ERS Appendix B.2-B.5 exactly so the existing
 * `assertTemplate` validator (in `template-loader.ts`) accepts them
 * without a separate "built-in" branch.
 */

import type { Config, Template } from '../types/index.ts';

/** The four built-in templates, in declaration order. */
export const BUILT_IN_TEMPLATES: readonly Template[] = [
	{
		id: 'epic',
		name: 'Epic',
		icon: 'flame',
		color: '#f97316',
		default_status: 'open',
		fields: [
			{ id: 1, key: 'owner', name: 'Owner', type: 'user', obligatory: true },
			{
				id: 2,
				key: 'labels',
				name: 'Labels',
				type: 'multi-select',
				obligatory: false,
				options_source: 'config.labels'
			},
			{ id: 3, key: 'relations', name: 'Relations', type: 'relations', obligatory: false }
		],
		sections: [
			{ id: 1, key: 'summary', name: 'Summary', obligatory: true, default: '' },
			{ id: 2, key: 'goals', name: 'Goals', obligatory: false, default: '' },
			{
				id: 3,
				key: 'success_criteria',
				name: 'Success criteria',
				obligatory: true,
				default: ''
			}
		]
	},
	{
		id: 'user-story',
		name: 'User Story',
		icon: 'book-open',
		color: '#0ea5e9',
		default_status: 'open',
		fields: [
			{ id: 1, key: 'user', name: 'As a', type: 'text', obligatory: true },
			{ id: 2, key: 'action', name: 'I want', type: 'text', obligatory: true },
			{ id: 3, key: 'objective', name: 'So that', type: 'text', obligatory: true },
			{ id: 4, key: 'assignee', name: 'Assignee', type: 'user', obligatory: false },
			{
				id: 5,
				key: 'labels',
				name: 'Labels',
				type: 'multi-select',
				obligatory: false,
				options_source: 'config.labels'
			},
			{ id: 6, key: 'relations', name: 'Relations', type: 'relations', obligatory: false }
		],
		sections: [
			{ id: 1, key: 'description', name: 'Description', obligatory: true, default: '' },
			{
				id: 2,
				key: 'acceptance_criteria',
				name: 'Acceptance criteria',
				obligatory: true,
				default: ''
			}
		]
	},
	{
		id: 'task',
		name: 'Task',
		icon: 'check-square',
		color: '#10b981',
		default_status: 'open',
		fields: [
			{
				id: 1,
				key: 'estimate',
				name: 'Estimate (hours)',
				type: 'number',
				obligatory: false
			},
			{ id: 2, key: 'assignee', name: 'Assignee', type: 'user', obligatory: false },
			{
				id: 3,
				key: 'labels',
				name: 'Labels',
				type: 'multi-select',
				obligatory: false,
				options_source: 'config.labels'
			},
			{ id: 4, key: 'relations', name: 'Relations', type: 'relations', obligatory: false }
		],
		sections: [
			{ id: 1, key: 'description', name: 'Description', obligatory: true, default: '' },
			{ id: 2, key: 'notes', name: 'Notes', obligatory: false, default: '' }
		]
	},
	{
		id: 'bug',
		name: 'Bug',
		icon: 'bug',
		color: '#e74c3c',
		default_status: 'open',
		fields: [
			{
				id: 1,
				key: 'severity',
				name: 'Severity',
				type: 'select',
				obligatory: true,
				options: ['low', 'medium', 'high', 'critical']
			},
			{
				id: 2,
				key: 'priority',
				name: 'Priority',
				type: 'select',
				obligatory: true,
				options: ['p0', 'p1', 'p2', 'p3']
			},
			{ id: 3, key: 'assignee', name: 'Assignee', type: 'user', obligatory: false },
			{
				id: 4,
				key: 'labels',
				name: 'Labels',
				type: 'multi-select',
				obligatory: false,
				options_source: 'config.labels'
			},
			{ id: 5, key: 'relations', name: 'Relations', type: 'relations', obligatory: false }
		],
		sections: [
			{ id: 1, key: 'description', name: 'Description', obligatory: true, default: '' },
			{
				id: 2,
				key: 'steps_to_reproduce',
				name: 'Steps to reproduce',
				obligatory: true,
				default: ''
			},
			{
				id: 3,
				key: 'expected_actual',
				name: 'Expected vs. actual',
				obligatory: false,
				default: ''
			}
		]
	}
];

/** Look up a built-in template by its id (e.g. `'bug'`). */
export function getBuiltInTemplate(id: string): Template | undefined {
	return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}

/**
 * The default `Config` written by the wizard when none is present
 * (ERS §6.3.1). The Kanban column set and status colour palette match
 * the ERS example.
 */
export function defaultConfig(): Config {
	return {
		statuses: [
			{ id: 'open', name: 'Open', color: '#22c55e' },
			{ id: 'in_progress', name: 'In progress', color: '#3b82f6' },
			{ id: 'in_review', name: 'In review', color: '#f59e0b' },
			{ id: 'done', name: 'Done', color: '#10b981' },
			{ id: 'closed', name: 'Closed', color: '#6b7280' }
		],
		default_status: 'open',
		labels: [
			{ id: 'frontend', name: 'Frontend', color: '#a855f7' },
			{ id: 'backend', name: 'Backend', color: '#0ea5e9' },
			{ id: 'docs', name: 'Docs', color: '#64748b' },
			{ id: 'security', name: 'Security', color: '#ef4444' }
		],
		users: [{ id: 'local-user', name: 'Local user' }],
		kanban: {
			columns: ['open', 'in_progress', 'in_review', 'done']
		},
		gantt: {
			group_by: 'issue_type',
			default_view: 'months'
		},
		remote: {
			cors_proxy: 'https://cors.isomorphic-git.org'
		}
	};
}
