/** ERS §6.3: workflow configuration for one project. */

/** A workflow status. `id` is referenced by `issue.status` and by kanban columns. */
export interface Status {
	id: string;
	name: string;
	color: string;
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

export interface RemoteConfig {
	cors_proxy: string;
}

export interface Config {
	statuses: Status[];
	default_status: string;
	labels: Label[];
	users: User[];
	kanban: KanbanConfig;
	gantt: GanttConfig;
	remote: RemoteConfig;
}
