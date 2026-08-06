import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import PresenceBar from './PresenceBar.svelte';

vi.mock('$lib/ui/strings', () => ({
	t: (key: string, opts?: { default?: string }) => opts?.default || key
}));

describe('PresenceBar.svelte', () => {
	it('does not render when peerCount is 0', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const presence = { peerCount: 0, peers: [] } as any;
		render(PresenceBar, { presence });

		await expect.element(page.getByTestId('presence-bar')).not.toBeInTheDocument();
	});

	it('renders avatars with initials for peers', async () => {
		const presence = {
			peerCount: 2,
			peers: [
				{ clientId: 1, name: 'Alice Smith', color: '#ff0000' },
				{ clientId: 2, name: 'Bob Jones', color: '#00ff00' }
			]
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		render(PresenceBar, { presence });

		// Initials should be 'AS' and 'BJ'
		await expect.element(page.getByText('AS')).toBeInTheDocument();
		await expect.element(page.getByText('BJ')).toBeInTheDocument();
	});

	it('handles missing names safely', async () => {
		const presence = {
			peerCount: 1,
			peers: [{ clientId: 1, name: '', color: '#ff0000' }]
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		render(PresenceBar, { presence });

		await expect.element(page.getByText('?')).toBeInTheDocument();
	});
});
