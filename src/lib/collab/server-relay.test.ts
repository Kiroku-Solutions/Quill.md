import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Server } from '@hocuspocus/server';
import { createIssueYDoc } from './ydoc-factory';
import type { Issue } from '../types/issue';
import { serializeYDoc } from './ydoc-serializer';

// Create a dummy issue to test with
const createMockIssue = (): Issue => ({
	id: 'TEST-123',
	fields: {
		title: 'Collab Test',
		author: 'Alice',
		creationDate: '2026-08-05',
		updatedDate: '2026-08-05',
		issueType: 'Bug',
		status: 'Open',
		assignee: null,
		labels: [],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		sprintId: null,
		estimate: null
	},
	customFields: {},
	sections: [{ name: 'Description', markdown: 'Initial description' }],
	integrityHash: 'abc123hash',
	integrityWarning: false
});

describe('Server Relay Sync', () => {
	let server: Server;
	let port = 0; // 0 allows OS to pick random port

	beforeAll(async () => {
		// Start in-process Hocuspocus server
		server = new Server({
			port: 0, // dynamic port
			async onAuthenticate() {
				// Accept any token for the test
				return { user: { name: 'TestUser' } };
			}
		});

		await server.listen();
		port = server.address.port;
	});

	afterAll(async () => {
		await server.destroy();
	});

	it('should sync Y.Doc state between two connected providers and converge deterministically', async () => {
		const issue = createMockIssue();

		// Setup Doc A
		const docA = createIssueYDoc(issue);
		const providerA = new HocuspocusProvider({
			url: `ws://127.0.0.1:${port}`,
			name: 'room-test-1',
			document: docA,
			token: 'tokenA'
		});

		await new Promise<void>((resolve) => {
			providerA.on('synced', resolve);
		});

		// Setup Doc B (unseeded, as it joins an existing room)
		const docB = new Y.Doc();
		const providerB = new HocuspocusProvider({
			url: `ws://127.0.0.1:${port}`,
			name: 'room-test-1',
			document: docB,
			token: 'tokenB'
		});

		await new Promise<void>((resolve) => {
			providerB.on('synced', resolve);
		});

		// Perform concurrent edits
		const descA = docA.getMap('sections').get('Description') as Y.Text;
		const descB = docB.getMap('sections').get('Description') as Y.Text;

		// Client A inserts text
		descA.insert(0, 'A-Edit ');

		// Client B inserts text at a different position
		descB.insert(descB.length, ' B-Edit');

		// Wait for both docs to sync up again.
		// Since we can't easily await 'synced' for specific updates,
		// we use a small polling mechanism or wait for a timeout.
		await new Promise<void>((resolve) => {
			const interval = setInterval(() => {
				if (descA.toString() === descB.toString()) {
					clearInterval(interval);
					resolve();
				}
			}, 20);
			// Fallback timeout in case they never converge (test failure)
			setTimeout(() => {
				clearInterval(interval);
				resolve();
			}, 2000);
		});

		// Verify convergence
		expect(descA.toString()).toBe(descB.toString());
		expect(descA.toString()).toContain('A-Edit');
		expect(descA.toString()).toContain('B-Edit');

		// Verify serialisation remains identical
		const serializedA = serializeYDoc(docA);
		const serializedB = serializeYDoc(docB);

		expect(serializedA.sections[0].markdown).toBe(serializedB.sections[0].markdown);

		providerA.destroy();
		providerB.destroy();
	});
});
