import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Server } from '@hocuspocus/server';
import { createIssueYDoc, isYDocSeeded } from '$lib/collab/ydoc-factory';
import { serializeYDoc } from '$lib/collab/ydoc-serializer';
import type { Issue } from '$lib/types/issue';
import ws from 'ws';

// Required for HocuspocusProvider in Node environment
Object.assign(global, { WebSocket: ws });

const createMockIssue = (): Issue => ({
	id: 'TEST-123',
	fields: {
		title: 'Test Issue',
		author: 'Alice',
		creationDate: '2026-08-05',
		updatedDate: '2026-08-05',
		issueType: 'Bug',
		status: 'Open',
		assignee: null,
		labels: ['bug'],
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

describe('Real-time Collaboration Integration', () => {
	let server: Server;
	const PORT = 12345;
	const SERVER_URL = `ws://localhost:${PORT}`;

	beforeAll(async () => {
		server = new Server({
			port: PORT,
			// Mock authentication that accepts any token for testing
			async onAuthenticate({ token }) {
				if (token !== 'valid-token') {
					throw new Error('Unauthorized');
				}
				return { user: { name: 'Test User' } };
			}
		});
		await server.listen();
	});

	afterAll(async () => {
		await server.destroy();
	});

	it('Server relay sync: synchronizes two Y.Docs via Hocuspocus server', async () => {
		const docA = new Y.Doc();
		const docB = new Y.Doc();

		const providerA = new HocuspocusProvider({
			url: SERVER_URL,
			name: 'test-room',
			document: docA,
			token: 'valid-token'
		});

		const providerB = new HocuspocusProvider({
			url: SERVER_URL,
			name: 'test-room',
			document: docB,
			token: 'valid-token'
		});

		// Wait for both to sync
		await new Promise<void>((resolve) => {
			let synced = 0;
			const onSync = () => {
				synced++;
				if (synced === 2) resolve();
			};
			providerA.on('synced', onSync);
			providerB.on('synced', onSync);
		});

		// Client A creates an issue and mutates it
		const issueA = createMockIssue();
		createIssueYDoc(issueA, docA);

		// Wait for network relay (Client B receives the update)
		await new Promise<void>((resolve) => {
			docB.once('update', () => resolve());
		});

		// Client B should now have the seeded document
		expect(isYDocSeeded(docB)).toBe(true);

		const reconstructedB = serializeYDoc(docB);
		expect(reconstructedB.fields.title).toBe('Test Issue');
		expect(reconstructedB.sections[0].markdown).toBe('Initial description');

		// Client B edits
		const sectionsMapB = docB.getMap('sections');
		const descB = sectionsMapB.get('Description') as Y.Text;
		descB.insert(descB.length, ' - edited by B');

		// Wait for relay (Client A receives the edit from Client B)
		await new Promise<void>((resolve) => {
			docA.once('update', () => resolve());
		});

		// Client A should see the edit
		const reconstructedA = serializeYDoc(docA);
		expect(reconstructedA.sections[0].markdown).toBe('Initial description - edited by B');

		providerA.destroy();
		providerB.destroy();
	});

	it('Save after collab edit: mutating Y.Text results in valid serialized Issue', () => {
		const issue = createMockIssue();
		const ydoc = createIssueYDoc(issue);

		const sectionsMap = ydoc.getMap('sections');
		const descText = sectionsMap.get('Description') as Y.Text;

		descText.insert(descText.length, '\nAppended line');

		const savedIssue = serializeYDoc(ydoc);
		expect(savedIssue.sections[0].markdown).toBe('Initial description\nAppended line');
		expect(savedIssue.integrityHash).toBe(issue.integrityHash); // Integrity hash preserved for serialization
	});
});
