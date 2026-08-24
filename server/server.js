import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? '1234');
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '8080');
const DB_PATH = process.env.DB_PATH ?? 'hocuspocus.sqlite';
const isProduction = process.env.NODE_ENV === 'production';
// How many days a document can sit untouched before being purged from SQLite
const STALE_DAYS = parseInt(process.env.STALE_DAYS ?? '7');
// Cleanup interval: once every 24 hours (in milliseconds)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// SQLite Pragmas — WAL mode persists across connections; set it once before
// Hocuspocus opens its own internal connection via the SQLite extension.
// ---------------------------------------------------------------------------
try {
	const setupDb = new Database(DB_PATH);
	setupDb.pragma('journal_mode = WAL');
	setupDb.pragma('busy_timeout = 5000');
	setupDb.pragma('synchronous = NORMAL');

	// --- Schema migration: add updated_at column for TTL-based cleanup ---
	// The extension-sqlite default schema is: documents(name VARCHAR, data BLOB)
	// We add updated_at so we know when each document was last written.
	const columns = setupDb.pragma('table_info(documents)');
	const hasUpdatedAt = columns.some((col) => col.name === 'updated_at');
	if (columns.length > 0 && !hasUpdatedAt) {
		setupDb.exec(`
			ALTER TABLE documents ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
			UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
		`);
		console.log('[hocuspocus] Migrated: added updated_at column to documents table.');
	}

	// Trigger: auto-update the timestamp whenever the extension writes a document.
	// Uses name (the UNIQUE key) since the table has no id column.
	setupDb.exec(`
		CREATE TRIGGER IF NOT EXISTS update_documents_timestamp
		AFTER UPDATE ON documents
		FOR EACH ROW
		BEGIN
			UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE name = OLD.name;
		END;
	`);

	setupDb.close();
	console.log(
		'[hocuspocus] SQLite configured (WAL, busy_timeout=5000, trigger, TTL cleanup ready).'
	);
} catch (err) {
	console.error('[hocuspocus] Failed to configure SQLite:', err.message);
	// Non-fatal: the server can still start with default settings
}

// ---------------------------------------------------------------------------
// Hocuspocus Server
// ---------------------------------------------------------------------------
const server = new Server({
	port: PORT,

	// Anti-DoS: limit resources consumed by unauthenticated connections
	maxUnauthenticatedQueueSize: 5 * 1024 * 1024, // 5 MiB buffered bytes
	maxUnauthenticatedQueueMessages: 1000,
	maxPendingDocuments: 100,

	async onAuthenticate({ token }) {
		if (isProduction) {
			if (!token) {
				throw new Error('Authentication required');
			}
			// TODO: Validate the token against the provider API (GitHub/GitLab).
			// For now, we require that a non-empty token is present so that
			// unauthenticated connections are always rejected in production.
			return {
				user: {
					name: 'Authenticated User',
					id: token.slice(0, 8)
				}
			};
		}

		// Dev mode: allow connections without a token for local testing
		const user = { name: 'Dev User', id: 'dev-1' };
		if (token) {
			user.name = 'Authenticated User';
			user.id = token.slice(0, 8);
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
			database: DB_PATH
		})
	]
});

// ---------------------------------------------------------------------------
// Document Cleanup — TTL-based garbage collection
// Deletes documents untouched for STALE_DAYS and VACUUMs to reclaim disk.
// Runs once every 24 hours. Safe because Git is the source of truth;
// if a client reconnects after cleanup, room.ts re-seeds from local content.
// ---------------------------------------------------------------------------
let lastCleanupResult = { deletedCount: 0, timestamp: null };

function runDocumentCleanup() {
	try {
		const db = new Database(DB_PATH);
		db.pragma('busy_timeout = 5000');

		// Delete documents not updated in the last STALE_DAYS days
		const result = db
			.prepare(
				`
			DELETE FROM documents
			WHERE updated_at < datetime('now', ? || ' days')
		`
			)
			.run(`-${STALE_DAYS}`);

		const deletedCount = result.changes;

		// VACUUM to reclaim freed disk space (only if we actually deleted something)
		if (deletedCount > 0) {
			db.exec('VACUUM');
		}

		db.close();

		lastCleanupResult = { deletedCount, timestamp: new Date().toISOString() };
		console.log(
			`[hocuspocus] Cleanup: purged ${deletedCount} stale document(s) (older than ${STALE_DAYS} days).`
		);
	} catch (err) {
		console.error('[hocuspocus] Cleanup failed:', err.message);
	}
}

// Schedule: run cleanup once immediately on startup, then every 24 hours
runDocumentCleanup();
const cleanupTimer = setInterval(runDocumentCleanup, CLEANUP_INTERVAL_MS);
// Prevent the timer from keeping the process alive during shutdown
cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Health Check HTTP Server
// Runs on a separate port so it never interferes with WebSocket traffic.
// Docker healthcheck hits this internally — no need to expose externally.
// ---------------------------------------------------------------------------
const healthServer = createServer((req, res) => {
	if (req.url === '/health' && req.method === 'GET') {
		const payload = {
			status: 'ok',
			env: isProduction ? 'production' : 'development',
			connections: server.getConnectionsCount(),
			documents: server.getDocumentsCount(),
			uptime: Math.round(process.uptime()),
			memory: process.memoryUsage(),
			cleanup: {
				staleDays: STALE_DAYS,
				lastRun: lastCleanupResult.timestamp,
				lastDeletedCount: lastCleanupResult.deletedCount
			}
		};
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(payload));
	} else {
		res.writeHead(404);
		res.end();
	}
});

healthServer.listen(HEALTH_PORT, () => {
	console.log(`[hocuspocus] Health check listening on http://localhost:${HEALTH_PORT}/health`);
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// server.destroy() flushes all pending debounced onStoreDocument calls so
// in-memory document edits are persisted to SQLite before the process exits.
// ---------------------------------------------------------------------------
let isShuttingDown = false;

async function shutdown(signal) {
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log(`[hocuspocus] ${signal} received — flushing documents to SQLite...`);

	clearInterval(cleanupTimer);

	try {
		await server.destroy();
		console.log('[hocuspocus] Hocuspocus server destroyed, documents flushed.');
	} catch (err) {
		console.error('[hocuspocus] Error during server.destroy():', err.message);
	}

	healthServer.close(() => {
		console.log('[hocuspocus] Health server closed.');
	});

	// Give healthServer a moment to close, then exit
	setTimeout(() => {
		console.log('[hocuspocus] Shutdown complete.');
		process.exit(0);
	}, 500);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server
	.listen()
	.then(() => {
		console.log(`[hocuspocus] WebSocket server listening on ws://localhost:${PORT}`);
		if (!isProduction) {
			console.log('[hocuspocus] Running in DEVELOPMENT mode — authentication is permissive.');
		}
	})
	.catch((err) => {
		console.error('[hocuspocus] Failed to start:', err);
		process.exit(1);
	});
