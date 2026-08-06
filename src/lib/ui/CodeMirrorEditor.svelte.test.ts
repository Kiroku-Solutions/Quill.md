import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import CodeMirrorEditor from './CodeMirrorEditor.svelte';
import * as Y from 'yjs';

// We mock y-codemirror.next because awareness object creation in tests
// might require full provider mocking which we did in room.test.ts
vi.mock('y-codemirror.next', () => ({
	yCollab: vi.fn().mockReturnValue([])
}));

describe('CodeMirrorEditor.svelte', () => {
	it('renders with initial value', async () => {
		render(CodeMirrorEditor, { value: '# Hello World' });
		await expect.element(page.getByTestId('codemirror-editor')).toBeInTheDocument();
		// In a real browser, CodeMirror renders lines as separate divs.
		await expect.element(page.getByText('Hello World')).toBeInTheDocument();
	});

	it('triggers onchange when content changes', async () => {
		const onchange = vi.fn();
		render(CodeMirrorEditor, { value: 'initial', onchange });

		const editor = page.getByRole('textbox');
		await editor.click();

		// Type to trigger updateListener
		await userEvent.keyboard(' test');

		// We expect our callback to have been called at least once
		expect(onchange).toHaveBeenCalled();
	});

	it('binds to Y.Text without throwing if ytext is provided', async () => {
		const doc = new Y.Doc();
		const ytext = doc.getText('test');
		ytext.insert(0, 'From Yjs');

		// Passing a dummy awareness object to satisfy the prop check in the component
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dummyAwareness = {} as any;

		render(CodeMirrorEditor, {
			value: 'initial',
			ytext,
			awareness: dummyAwareness
		});

		// Wait for CodeMirror to sync the initial Yjs state.
		// Since yCollab is mocked, the initial doc parameter in EditorState.create
		// should still render 'From Yjs'.
		await expect.element(page.getByText('From Yjs')).toBeInTheDocument();
	});
});
