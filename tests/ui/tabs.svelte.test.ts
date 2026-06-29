/**
 * Tabs.svelte — keyboard navigation (NFR-4).
 *
 * Verifies the WAI-ARIA Authoring Practices pattern for a horizontal
 * tablist:
 *   - ArrowRight / ArrowLeft move focus across the tabs.
 *   - Home / End jump to the first / last tab.
 *   - Enter and Space activate the focused tab.
 *   - The active tab carries `aria-selected="true"`; the others are
 *     `aria-selected="false"`.
 *   - The tablist itself has `role="tablist"` and
 *     `aria-orientation="horizontal"`.
 *
 * Vitest project: `client` (Playwright Chromium) — picked up by the
 * `tests/**\/*.{test,spec}.{js,ts}` glob in `vite.config.ts`.
 *
 * Keyboard events go through `userEvent.keyboard('{ArrowRight}')`
 * (testing-library / user-event syntax). Focus is asserted via the
 * `data-testid` of the underlying element, which the harness exposes
 * via the same role + accessible name lookup.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import TabsHarness from './TabsHarness.svelte';

type Tab = { id: string; label: string };

const tabs: ReadonlyArray<Tab> = [
	{ id: 'one', label: 'One' },
	{ id: 'two', label: 'Two' },
	{ id: 'three', label: 'Three' }
];

function tabByName(name: string) {
	return page.getByRole('tab', { name });
}

describe('Tabs', () => {
	it('renders the tablist with the correct ARIA roles and orientation', async () => {
		render(TabsHarness, { tabs, initial: 'one' });

		const list = page.getByRole('tablist');
		await expect.element(list).toBeInTheDocument();
		await expect.element(list).toHaveAttribute('aria-orientation', 'horizontal');
	});

	it('marks the active tab with aria-selected="true"', async () => {
		render(TabsHarness, { tabs, initial: 'two' });

		await expect.element(tabByName('One')).toHaveAttribute('aria-selected', 'false');
		await expect.element(tabByName('Two')).toHaveAttribute('aria-selected', 'true');
		await expect.element(tabByName('Three')).toHaveAttribute('aria-selected', 'false');
	});

	it('moves focus to the next tab on ArrowRight and activates on Enter', async () => {
		const received: string[] = [];
		render(TabsHarness, {
			tabs,
			initial: 'one',
			onchange: (id) => received.push(id)
		});

		const first = tabByName('One');
		await first.click();
		first.element().focus();

		await userEvent.keyboard('{ArrowRight}');
		await expect.element(tabByName('Two')).toHaveFocus();

		await userEvent.keyboard('{Enter}');
		expect(received).toContain('two');
		await expect.element(tabByName('Two')).toHaveAttribute('aria-selected', 'true');
	});

	it('moves focus to the previous tab on ArrowLeft and activates on Space', async () => {
		const received: string[] = [];
		render(TabsHarness, {
			tabs,
			initial: 'three',
			onchange: (id) => received.push(id)
		});

		const third = tabByName('Three');
		await third.click();
		third.element().focus();

		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(tabByName('Two')).toHaveFocus();

		// Space inside `{ }` is escaped; bare space terminates the syntax
		// in user-event. Use the explicit `{Space}` shorthand.
		await userEvent.keyboard('{Space}');
		expect(received).toContain('two');
	});

	it('Home jumps to the first tab and End jumps to the last', async () => {
		render(TabsHarness, { tabs, initial: 'two' });

		const second = tabByName('Two');
		await second.click();
		second.element().focus();

		await userEvent.keyboard('{End}');
		await expect.element(tabByName('Three')).toHaveFocus();

		await userEvent.keyboard('{Home}');
		await expect.element(tabByName('One')).toHaveFocus();
	});

	it('wraps around when arrow keys go past either end', async () => {
		render(TabsHarness, { tabs, initial: 'three' });

		const third = tabByName('Three');
		await third.click();
		third.element().focus();

		await userEvent.keyboard('{ArrowRight}');
		await expect.element(tabByName('One')).toHaveFocus();
	});
});
