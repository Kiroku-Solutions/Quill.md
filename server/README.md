# Hocuspocus Server

This is the standalone Hocuspocus WebSocket server for real-time collaboration support in `quill.md`.

## Local Installation and Execution

To run locally (requires Node 22+ and pnpm):

```bash
pnpm install
pnpm start
```

## Docker Compose

For a production deployment using Docker:

```bash
docker compose up -d
```

The server will listen on port 1234 and mount a `data` volume for SQLite persistence.

## How to Connect

Since it is based on WebSockets, to connect to the Hocuspocus server from your client (`quill.md` or any other using `y-websocket` or `@hocuspocus/provider`), you must use the corresponding URL with the `ws://` protocol (unsecure connection, typically for local development) or `wss://` (secure connection via TLS/SSL, for production).

### Connecting from quill.md

You configure this directly from the quill.md user interface. You don't need to write any code to connect!

1. Open the quill.md settings in the UI.
2. Look for the synchronization or collaboration server settings.
3. Enter your WebSocket URL.

Depending on your environment, the URL will look like this:

**Local Development:**
If the server is running on your local machine, the connection URL will be:

```
ws://localhost:1234
```

**Production:**
If you host the server externally or in the cloud, you must use its public IP address or an associated domain. It is strongly recommended to use a reverse proxy (like Nginx or Traefik) to enable SSL (HTTPS/WSS). The URL would look like this:

```
wss://your-domain.com
# or with the port if you do not use a standard proxy (e.g. 443/80)
ws://SERVER_IP:1234
```

**Advanced: Custom Client Connection Example (JavaScript):**
If you are building a custom client, here is how you connect programmatically:

```javascript
import { HocuspocusProvider } from '@hocuspocus/provider';

const provider = new HocuspocusProvider({
	url: 'ws://localhost:1234', // Change this to your production URL (wss://...)
	name: 'document-name'
});
```
