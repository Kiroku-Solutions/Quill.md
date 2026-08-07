import fs from 'fs';

const files = [
	'tests/a11y/keyboard-nav.test.ts',
	'tests/a11y/step-6.a11y.test.ts',
	'tests/ui/app-shell.svelte.test.ts',
	'tests/ui/form-fields.svelte.test.ts',
	'tests/ui/kanban-dnd.svelte.test.ts',
	'tests/ui/list-keyboard.svelte.test.ts',
	'tests/ui/recent-folders.svelte.test.ts',
	'tests/ui/settings-panel.svelte.test.ts'
];

files.forEach((file) => {
	let content = fs.readFileSync(file, 'utf8');
	content = content.replace(/exportDocs: \[\],/g, 'exportPayload: null,');
	fs.writeFileSync(file, content);
});
console.log('Done fixing exportPayload mock!');
