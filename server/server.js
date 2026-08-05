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

	async onConnect(data) {
		console.log(`[server] New connection from ${data.socketId}`);
	},

	async onDisconnect(data) {
		console.log(`[server] Disconnected: ${data.socketId}`);
	},

	async onLoadDocument(data) {
		console.log(`[server] Loading document: ${data.documentName}`);
	},

	extensions: [
		new SQLite({
			database: 'hocuspocus.sqlite'
		})
	]
});

server.listen().then(({ port }) => {
	console.log(`Hocuspocus server listening on ws://0.0.0.0:${port}`);
});
