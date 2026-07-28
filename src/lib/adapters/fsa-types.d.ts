/**
 * Minimal ambient type declarations for the File System Access API members
 * that are not yet included in TypeScript's built-in DOM lib.
 *
 * Coverage is intentionally narrow — only the members used in this adapter
 * layer. The full spec lives at:
 *   https://fs.spec.whatwg.org/
 *   https://wicg.github.io/file-system-access/
 *
 * These are "ambient" declarations (no `import`/`export`) so they augment
 * the global scope for all modules in the compilation unit.
 */

/** Exposed by `window.showDirectoryPicker()` when the FSA API is available. */
interface ShowDirectoryPickerOptions {
	readonly id?: string;
	readonly mode?: 'read' | 'readwrite';
	readonly startIn?:
		FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

/** Result of `window.showDirectoryPicker()`. */
interface Window {
	showDirectoryPicker(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

/**
 * Extended `FileSystemDirectoryHandle` interface covering the methods
 * that are absent from the TypeScript DOM lib but present in the spec.
 */
interface FileSystemDirectoryHandle {
	/**
	 * Query the current permission state for this handle.
	 * @param options  Defaults to `{ mode: 'read' }`.
	 */
	queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;

	/**
	 * Request a new permission grant, showing the browser prompt if needed.
	 * @param options  Defaults to `{ mode: 'read' }`.
	 */
	requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/**
 * Extended `FileSystemHandle` interface covering the methods
 * that are absent from the TypeScript DOM lib but present in the spec.
 */
interface FileSystemHandle {
	/**
	 * Atomically rename or move this entry.
	 *
	 * Spec: https://fs.spec.whatwg.org/#dom-filesystemhandle-move
	 *
	 * @param newName  The new name for the entry.
	 */
	move(newName: string): Promise<void>;

	/**
	 * Atomically rename or move this entry to a new directory.
	 *
	 * Spec: https://fs.spec.whatwg.org/#dom-filesystemhandle-move
	 *
	 * @param newDirectory  The new parent directory for the entry.
	 * @param newName  The new name for the entry.
	 */
	move(newDirectory: FileSystemDirectoryHandle, newName: string): Promise<void>;
}
