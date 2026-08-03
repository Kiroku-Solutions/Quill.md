import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Base theme extending Tailwind variables
const baseTheme = EditorView.theme({
	'&': {
		color: 'var(--foreground)',
		backgroundColor: 'transparent'
	},
	'.cm-content': {
		caretColor: 'var(--primary)',
		fontFamily: 'var(--font-mono)'
	},
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
	'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
		{ backgroundColor: 'var(--muted)' },
	'.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--foreground)' },
	'.cm-panels.cm-panels-top': { borderBottom: '2px solid var(--border)' },
	'.cm-panels.cm-panels-bottom': { borderTop: '2px solid var(--border)' },
	'.cm-searchMatch': {
		backgroundColor: 'var(--warning)',
		outline: '1px solid var(--warning)'
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'var(--secondary)',
		color: 'var(--secondary-foreground)'
	},
	'.cm-activeLine': { backgroundColor: 'transparent' },
	'.cm-selectionMatch': { backgroundColor: 'var(--muted)' },
	'&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
		backgroundColor: 'var(--muted)',
		outline: '1px solid var(--border)'
	},
	'.cm-gutters': {
		backgroundColor: 'transparent',
		color: 'var(--muted-foreground)',
		border: 'none'
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'transparent',
		color: 'var(--foreground)'
	},
	'.cm-foldPlaceholder': {
		backgroundColor: 'transparent',
		border: 'none',
		color: 'var(--muted-foreground)'
	},
	'.cm-tooltip': {
		border: 'none',
		backgroundColor: 'var(--surface)'
	},
	'.cm-tooltip .cm-tooltip-arrow:before': {
		borderTopColor: 'transparent',
		borderBottomColor: 'transparent'
	},
	'.cm-tooltip .cm-tooltip-arrow:after': {
		borderTopColor: 'var(--surface)',
		borderBottomColor: 'var(--surface)'
	},
	'.cm-tooltip-autocomplete': {
		'& > ul > li[aria-selected]': {
			backgroundColor: 'var(--muted)',
			color: 'var(--foreground)'
		}
	}
});

// Syntax highlighting for markdown
const syntaxTheme = HighlightStyle.define([
	{ tag: t.heading1, class: 'text-2xl font-bold text-foreground mt-6 mb-4' },
	{ tag: t.heading2, class: 'text-xl font-bold text-foreground mt-5 mb-3' },
	{ tag: t.heading3, class: 'text-lg font-bold text-foreground mt-4 mb-2' },
	{ tag: t.heading4, class: 'text-base font-bold text-foreground mt-3 mb-2' },
	{ tag: t.heading5, class: 'text-sm font-bold text-foreground mt-2 mb-1' },
	{ tag: t.heading6, class: 'text-xs font-bold text-foreground mt-2 mb-1' },
	{ tag: t.strong, class: 'font-bold' },
	{ tag: t.emphasis, class: 'italic' },
	{ tag: t.strikethrough, class: 'line-through' },
	{ tag: t.link, class: 'text-primary underline' },
	{ tag: t.url, class: 'text-primary underline opacity-80' },
	{ tag: t.processingInstruction, class: 'text-muted-foreground' },
	{ tag: t.meta, class: 'text-muted-foreground' },
	{ tag: t.comment, class: 'text-muted-foreground italic' },
	{ tag: t.list, class: 'ml-4' },
	{ tag: t.quote, class: 'border-l-4 border-border pl-4 italic text-muted-foreground' },
	{ tag: t.monospace, class: 'font-mono text-sm bg-muted/50 rounded px-1' },
	{ tag: t.keyword, class: 'text-primary' },
	{ tag: t.variableName, class: 'text-secondary' },
	{ tag: t.string, class: 'text-success' },
	{ tag: t.number, class: 'text-warning' },
	{ tag: t.bool, class: 'text-primary font-bold' }
]);

export const quillTheme = [baseTheme, syntaxHighlighting(syntaxTheme)];

// In this setup, we rely on the CSS variables which adapt to the theme based on the `dark` class
// on the html element (or prefers-color-scheme). So the theme object itself is largely theme-agnostic.
// CodeMirror still has a darkTheme boolean flag that is helpful for base styles.
export const quillDarkTheme = [
	EditorView.theme({}, { dark: true }),
	baseTheme,
	syntaxHighlighting(syntaxTheme)
];
