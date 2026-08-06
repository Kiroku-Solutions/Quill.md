import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

const server = new Server({
	port: parseInt(process.env.PORT ?? '1234'),

	async onAuthenticate({ token }) {
		// In dev mode, allow connections without a token
		const user = { name: 'Dev User', id: 'dev-1' };
		if (token) {
			// TODO: In production, validate the token against the provider API (GitHub/GitLab)
			user.name = 'Authenticated User';
		}
		return { user };
	},

	async onConnect() {
		// Event handler for new connections
	},

	async onDisconnect() {
		// Event handler for disconnections
	},

	async onLoadDocument() {
		// Event handler for document loading
	},

	extensions: [
		new SQLite({
			database: process.env.DB_PATH ?? 'hocuspocus.sqlite'
		})
	]
});

server.listen().catch(console.error);
