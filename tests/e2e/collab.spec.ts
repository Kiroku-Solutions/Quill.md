import { test, expect } from '@playwright/test';

const mockFSAScript = `
	const originalPut = IDBObjectStore.prototype.put;
	IDBObjectStore.prototype.put = function(value, key) {
		if (value && typeof value === 'object' && value.handle && value.handle.kind === 'directory') {
			const req = {
				readyState: 'done',
				result: undefined,
				error: null,
				onsuccess: null,
				onerror: null,
				addEventListener: function(type, cb) {
					if (type === 'success') {
						setTimeout(() => cb({ target: req }), 0);
					}
				}
			};
			setTimeout(() => {
				if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
			}, 0);
			return req;
		}
		return originalPut.call(this, value, key);
	};

	window.showDirectoryPicker = async () => {
		const tree = {
			'.quill.md': {
				'config.json': JSON.stringify({
					product_goal: '',
					definition_of_done: [],
					default_status: 'Open',
					statuses: [{ id: 'Open', name: 'Open', color: '#000000', category: 'todo' }],
					labels: [],
					users: [],
					kanban: { columns: ['Open'] },
					gantt: { group_by: 'none', default_view: 'month' },
					remote: {},
					collab: { enabled: true, serverUrl: 'ws://localhost:1234' }
				}),
				'templates': {
					'Bug.json': JSON.stringify({
						id: 'Bug',
						name: 'Bug',
						icon: 'bug',
						color: '#ff0000',
						default_status: 'Open',
						fields: [],
						sections: []
					})
				},
				'issues': {
					'COLLAB-1.md': '---\\nid: COLLAB-1\\nissue_type: Bug\\nstatus: Open\\ntitle: Collab Test\\nauthor: MockUser\\ncreation_date: 2024-01-01T00:00:00Z\\nupdated_date: 2024-01-01T00:00:00Z\\n---\\n<!-- [SECTION_START: Description] -->\\nInitial description\\n<!-- [SECTION_END: Description] -->'
				}
			}
		};

		// Attach tree to window so we can inspect it in tests
		window.__MOCK_FSA_TREE = tree;

		function createDirHandle(name, obj) {
			return {
				kind: 'directory',
				name,
				queryPermission: async () => 'granted',
				requestPermission: async () => 'granted',
				getFileHandle: async (fileName, opts) => {
					if (!(fileName in obj)) {
						if (opts?.create) {
							obj[fileName] = '';
						} else {
							const err = new Error('Not found');
							err.name = 'NotFoundError';
							throw err;
						}
					}
					const content = obj[fileName];
					if (typeof content !== 'string') {
						const err = new Error('Type mismatch');
						err.name = 'TypeMismatchError';
						throw err;
					}
					return {
						kind: 'file',
						name: fileName,
						getFile: async () => new File([obj[fileName]], fileName),
						createWritable: async () => ({
							write: async (data) => {
								if (typeof data === 'string') {
									obj[fileName] = data;
								} else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
									obj[fileName] = new TextDecoder().decode(data);
								} else if (data && data.type === 'write') {
									// FSA write() can take { type: 'write', data: ... }
									if (typeof data.data === 'string') {
										obj[fileName] = data.data;
									} else if (data.data instanceof ArrayBuffer || ArrayBuffer.isView(data.data)) {
										obj[fileName] = new TextDecoder().decode(data.data);
									}
								}
							},
							close: async () => {}
						})
					};
				},
				getDirectoryHandle: async (dirName, opts) => {
					if (!(dirName in obj)) {
						if (opts?.create) {
							obj[dirName] = {};
						} else {
							const err = new Error('Not found');
							err.name = 'NotFoundError';
							throw err;
						}
					}
					const content = obj[dirName];
					if (typeof content === 'string') {
						const err = new Error('Type mismatch');
						err.name = 'TypeMismatchError';
						throw err;
					}
					return createDirHandle(dirName, content);
				},
				entries: async function* () {
					for (const [key, value] of Object.entries(obj)) {
						if (typeof value === 'string') {
							yield [key, {
								kind: 'file',
								name: key,
								getFile: async () => new File([value], key)
							}];
						} else {
							yield [key, createDirHandle(key, value)];
						}
					}
				}
			};
		}

		return createDirHandle('mock-quill-repo', tree);
	};
`;

test('Two-tab collab: Syncs via BroadcastChannel', async ({ context }) => {
	const pageA = await context.newPage();
	pageA.on('console', (msg) => console.log('Page A:', msg.text()));
	const pageB = await context.newPage();
	pageB.on('console', (msg) => console.log('Page B:', msg.text()));

	// Clear all IndexedDB databases in the context
	await pageA.goto('http://localhost:4173/');
	await pageA.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	// Page A navigates to home
	await pageA.goto('/');
	pageA.on('pageerror', (err) => console.log('Page A Error:', err));
	pageB.on('pageerror', (err) => console.log('Page B Error:', err));

	await pageA.addInitScript(mockFSAScript);
	await pageB.addInitScript(mockFSAScript);

	await pageA.goto('/');
	await pageB.goto('/');

	// Open the local directory in both tabs
	await pageA.getByRole('button', { name: /Open Local Folder/i }).click();
	await pageB.getByRole('button', { name: /Open Local Folder/i }).click();

	// Wait for the UI to settle after navigation
	await pageA.waitForURL('**/local');

	// Open the issue in Tab A
	await pageA.getByText('Collab Test').click();
	await pageA.getByRole('tab', { name: 'Write' }).click();
	await expect(pageA.getByTestId('codemirror-editor')).toContainText('Initial description');

	// Wait for Tab A's collab room to finish its 5s initialization timeout
	// This prevents Tab A and Tab B from concurrently seeding the document and
	// causing a Yjs Map CRDT resolution where one Y.Text is orphaned.
	await pageA.waitForTimeout(6000);

	// Open the issue in Tab B
	await pageB.getByText('Collab Test').click();
	await pageB.getByRole('tab', { name: 'Write' }).click();
	await expect(pageB.getByTestId('codemirror-editor')).toContainText('Initial description');

	// In Tab A, type a new line
	const editorA = pageA.getByTestId('codemirror-editor').getByRole('textbox');
	await editorA.focus();
	await editorA.press('Control+A');
	await editorA.press('Backspace');
	await editorA.pressSequentially('Sync Test\n');

	// Tab B should automatically receive the update via BroadcastChannel
	await expect(pageB.getByTestId('codemirror-editor').getByRole('textbox')).toContainText(
		'Sync Test',
		{ timeout: 10000 }
	);
});

test('Save after collab edit: Persists Y.Doc to disk', async ({ page }) => {
	page.on('console', (msg) => console.log('Page:', msg.text()));

	// Clear all IndexedDB databases
	await page.goto('http://localhost:4173/');
	await page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		for (const db of dbs) {
			if (db.name) indexedDB.deleteDatabase(db.name);
		}
	});

	await page.addInitScript(mockFSAScript);
	await page.goto('/');

	// Open the local directory
	await page.getByRole('button', { name: /Open Local Folder/i }).click();
	await page.waitForURL('**/local');

	// Open the issue
	await page.getByText('Collab Test').click();
	await page.getByRole('tab', { name: 'Write' }).click();
	await expect(page.getByTestId('codemirror-editor')).toContainText('Initial description');

	// Type in the editor
	const editor = page.getByTestId('codemirror-editor').getByRole('textbox');
	await editor.focus();
	await editor.press('Control+A');
	await editor.press('Backspace');
	await editor.pressSequentially('New collab content\n');

	// Wait a moment for debouncing or state updates if any (though y-codemirror is synchronous to Y.Doc)
	await page.waitForTimeout(100);

	// Click Save
	await page.getByRole('button', { name: 'Save' }).click();

	// Ensure the save button goes back to idle/disabled or is no longer dirty
	// Since we mock the save, it should succeed quickly. Wait for isDirty to clear if indicated by UI.
	// Or just wait a little bit for the write to finish
	await page.waitForTimeout(300);

	// Read the mock file system to verify what was saved
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mockTree = await page.evaluate(() => (window as any).__MOCK_FSA_TREE);
	console.log('Mock tree:', JSON.stringify(mockTree, null, 2));
	const savedContent = mockTree['.quill.md']?.['issues']?.['open']?.['COLLAB-1-collab-test.md'];

	expect(savedContent).toContain('New collab content');
});
