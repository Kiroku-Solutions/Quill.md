/** ERS §6.3: workflow configuration for one project. */

/** A workflow status. `id` is referenced by `issue.status` and by kanban columns. */
export interface Status {
	id: string;
	name: string;
	color: string;
	category: 'todo' | 'doing' | 'done' | 'cancelled';
}

/** A label in the project catalog. Referenced by `issue.labels[]`. */
export interface Label {
	id: string;
	name: string;
	color: string;
}

/** A user in the project catalog. Referenced by `issue.assignee` / template `user` fields. */
export interface User {
	id: string;
	name: string;
}

export interface KanbanConfig {
	columns: string[];
}

export interface GanttConfig {
	group_by: string;
	default_view: string;
}

/**
 * Remote-mode configuration. v0 required a `cors_proxy` field because the
 * isomorphic-git transport went through a CORS proxy. The provider
 * REST APIs ship permissive CORS, so the field is now optional and
 * legacy values are ignored.
 *
 * v1 additions (FR-5/FR-16/FR-17):
 *  - `provider`: explicit provider id ('github' or 'gitlab') when the user
 *    wants to override URL-based auto-detection.
 *  - `edit_branch`: branch the app commits to (default `quill-md`).
 *  - `custom_base_url`: self-hosted instances — base URL for the API.
 *  - `commit_author_name` / `commit_author_email`: optional overrides for
 *    the commit author identity (otherwise derived from the provider's
 *    authenticated user).
 */
export interface RemoteConfig {
	cors_proxy?: string;
	provider?: 'github' | 'gitlab';
	edit_branch?: string;
	custom_base_url?: string;
	commit_author_name?: string;
	commit_author_email?: string;
}

export interface Config {
	product_goal: string;
	definition_of_done: string[];
	statuses: Status[];
	default_status: string;
	labels: Label[];
	users: User[];
	kanban: KanbanConfig;
	gantt: GanttConfig;
	remote: RemoteConfig;
}
