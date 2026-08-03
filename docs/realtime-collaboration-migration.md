# Real-Time Collaboration Migration — Implementation Plan

| Field       | Value                     |
| ----------- | ------------------------- |
| Document ID | `MIG-realtime-collab-001` |
| Version     | 2.0.0                     |
| Status      | Draft                     |
| Date        | 2026-08-03                |
| Author      | AI / Camilo (review)      |
| Project     | quill\.md                 |

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [State of the Art](#2-state-of-the-art)
3. [Architectural Constraints](#3-architectural-constraints)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Stage 0 — Foundation: CodeMirror 6 Editor](#5-stage-0--foundation-codemirror-6-editor)
6. [Stage 1 — CRDT Data Layer (Yjs)](#6-stage-1--crdt-data-layer-yjs)
7. [Stage 2 — Server Relay Sync (Hocuspocus)](#7-stage-2--server-relay-sync-hocuspocus)
8. [Stage 3 — Presence & Awareness UX](#8-stage-3--presence--awareness-ux)
9. [Stage 4 — Git Reconciliation](#9-stage-4--git-reconciliation)
10. [Stage 5 — Configuration & Settings](#10-stage-5--configuration--settings)
11. [Stage 6 — Offline & Resilience](#11-stage-6--offline--resilience)
12. [Stage 7 — Testing & Verification](#12-stage-7--testing--verification)
13. [Dependency Inventory](#13-dependency-inventory)
14. [Risk Register](#14-risk-register)
15. [ERS Amendments Required](#15-ers-amendments-required)
16. [Follow-Ups & Future Work](#16-follow-ups--future-work)

---

## 1. Motivation

quill\.md currently supports multi-user editing only through Git's
optimistic-concurrency model: when two users save the same file, the
second writer gets a `RemoteConflictError` (409) and must manually
pull-to-refresh before retrying. This workflow is adequate for
asynchronous collaboration but creates friction when two or more users
work on the same issue simultaneously — a common scenario during
grooming sessions, pair reviews, or standup triage.

**Goal**: Enable real-time, multi-cursor, Google-Docs-style editing of
issue sections (Markdown body) and frontmatter fields, while preserving
Git as the persistent source of truth and honouring the ERS constraints
(especially C-1 No Backend).

### 1.1 Opt-in Nature (Zero Degradation for Small Projects)

It is critical that this migration **does not eliminate or degrade the
current state of quill.md**. For small projects, individuals, or teams
that do not want to deploy and manage a server, quill.md will continue
to function **exactly as it does today**. The existing asynchronous,
Git-based optimistic-concurrency model remains the default. Real-time
collaboration is strictly an **opt-in feature** enabled via the project
settings.

---

## 2. State of the Art

### 2.1 CRDT Libraries

| Library   | Language    | History Model     | Ecosystem Maturity        | Bundle Size (gzipped) |
| --------- | ----------- | ----------------- | ------------------------- | --------------------- |
| **Yjs**   | JavaScript  | GC (checkpoints)  | ★★★★★ (industry standard) | ~15 KB                |
| Automerge | Rust + WASM | Full DAG          | ★★★★☆                     | ~250 KB               |
| Loro      | Rust + WASM | Full (Fugue algo) | ★★★☆☆ (emerging)          | ~180 KB               |

**Decision**: **Yjs** is selected because:

- Native JS — no WASM bootstrap latency, smallest bundle.
- Mature editor bindings: `y-codemirror.next` (CodeMirror 6), `y-prosemirror` (Tiptap/ProseMirror).
- Ready-to-use network providers: `@hocuspocus/provider`, `y-websocket`, `y-indexeddb`.
- Awareness protocol built-in for presence/cursors.
- Battle-tested at scale (Notion, JupyterLab, Hocuspocus).

### 2.2 Editor Frameworks

| Editor           | CM6 Binding         | Markdown Support            | Svelte 5 Compatibility              | Bundle  |
| ---------------- | ------------------- | --------------------------- | ----------------------------------- | ------- |
| **CodeMirror 6** | `y-codemirror.next` | `@codemirror/lang-markdown` | Imperative API, works via `onMount` | ~120 KB |
| Tiptap           | `y-prosemirror`     | Via `tiptap-markdown`       | Svelte adapter exists               | ~200 KB |
| Monaco           | `y-monaco`          | Partial                     | Heavy, overkill                     | ~2 MB   |

**Decision**: **CodeMirror 6** — lightest bundle, first-class Markdown
mode, the `y-codemirror.next` binding is maintained by the Yjs core team.

### 2.3 Network Transport

| Transport        | Requires Server? | Auth Built-in | Persistence   | Privacy                        | Complexity |
| ---------------- | ---------------- | ------------- | ------------- | ------------------------------ | ---------- |
| y-webrtc         | Signaling only   | ❌            | ❌            | P2P encrypted                  | Medium     |
| y-websocket      | Full relay       | ❌            | ❌            | Server sees data               | Low        |
| **Hocuspocus**   | Full relay       | ✅ hooks      | ✅ extensions | Server sees data (self-hosted) | Low–Medium |
| BroadcastChannel | No (same origin) | N/A           | N/A           | Same browser                   | Trivial    |

**Decision**: **`@hocuspocus/provider`** as the primary provider
(WebSocket relay to a self-hosted Hocuspocus server) +
**BroadcastChannel** for zero-config same-browser multi-tab sync.
Hocuspocus provides auth hooks, persistence, and debounced saves —
features that y-webrtc requires building from scratch.

**Rationale for Hocuspocus over y-webrtc**:

- **Auth by design**: `onAuthenticate` hook validates the user's PAT
  before allowing sync — no custom auth layer needed.
- **Persistence**: `onStoreDocument` / `@hocuspocus/extension-sqlite`
  persists Y.Doc state across server restarts — no document loss.
- **NAT traversal solved**: WebSocket connections work through all
  firewalls and proxies. No need for TURN/STUN ICE servers.
- **Open source, self-hosted**: Teams run `docker run` — same model as
  any self-hosted tool.
- **Yjs native**: Hocuspocus is built on Yjs; `@hocuspocus/provider`
  replaces `y-webrtc` as a drop-in Yjs provider with awareness support.

---

## 3. Architectural Constraints

These are the existing ERS constraints that shape the design:

| Constraint                  | Impact on Collaboration Feature                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C-1 (No backend)**        | quill\.md ships no backend. **By default, quill.md continues to operate purely client-side** against the Git provider. Real-time collaboration is an opt-in feature that requires a **self-hosted Hocuspocus server** as an external dependency. The app falls back to the standard Git-sync workflow if the server is unreachable or disabled. |
| **C-6 (Token hygiene)**     | The PAT is sent **only** during the WebSocket handshake as the `token` parameter of `HocuspocusProvider`. It is validated by the server's `onAuthenticate` hook and never stored or forwarded. Presence metadata carries only `{ name, color, cursor }`.                                                                                        |
| **C-7 (Provider Strategy)** | The collaboration layer is provider-agnostic. Git reconciliation flows through the existing `WritableDirectoryAdapter` / `CommitQueueStore` pipeline.                                                                                                                                                                                           |
| **NFR-2 (Security)**        | Document content travels over **WSS** (TLS-encrypted WebSocket). The Hocuspocus server validates user identity via `onAuthenticate` before allowing sync. Self-hosting means data never leaves the team's infrastructure.                                                                                                                       |
| **NFR-3 (Privacy)**         | The Hocuspocus server is the only new external endpoint. It is opt-in and self-hosted. The app must not silently connect to any third-party endpoint.                                                                                                                                                                                           |

---

## 4. High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  UI Layer                                                            │
│  ┌─────────────────────┐  ┌─────────────────────────────────────┐    │
│  │ CodeMirrorEditor.   │  │ PresenceBar.svelte                  │    │
│  │ svelte              │  │  (avatars, cursor colors, online    │    │
│  │ (replaces Textarea) │  │   count)                            │    │
│  └────────┬────────────┘  └─────────────┬───────────────────────┘    │
│           │                             │                            │
│           ▼                             ▼                            │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │  Collaboration Layer (NEW)                               │        │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │        │
│  │  │ CollabStore   │  │ Y.Doc        │  │ Awareness      │ │        │
│  │  │ (Svelte 5    │  │ ┌──────────┐ │  │ Protocol       │ │        │
│  │  │  runes)      │  │ │ Y.Map    │ │  │ (cursors,      │ │        │
│  │  │              │  │ │ (fields) │ │  │  presence)     │ │        │
│  │  │              │  │ ├──────────┤ │  │                │ │        │
│  │  │              │  │ │ Y.Text   │ │  │                │ │        │
│  │  │              │  │ │ (section │ │  │                │ │        │
│  │  │              │  │ │  bodies) │ │  │                │ │        │
│  │  │              │  │ └──────────┘ │  └────────────────┘ │        │
│  │  └──────────────┘  └──────┬───────┘                     │        │
│  │                           │                              │        │
│  │  ┌────────────────────────▼─────────────────────────┐   │        │
│  │  │  Network Providers                               │   │        │
│  │  │  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │   │        │
│  │  │  │ Hocuspocus   │  │ Broadcast   │  │ y-index  │ │   │        │
│  │  │  │ Provider     │  │ Channel     │  │ eddb     │ │   │        │
│  │  │  │ (WebSocket)  │  │ (multi-tab) │  │ (offline │ │   │        │
│  │  │  │              │  │             │  │  persist)│ │   │        │
│  │  │  └──────┬───────┘  └─────────────┘  └──────────┘ │   │        │
│  │  └─────────┼────────────────────────────────────────┘   │        │
│  └────────────┼────────────────────────────────────────────┘        │
│               │                                                      │
│               │  WSS (TLS-encrypted WebSocket)                       │
│               ▼                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  Hocuspocus Server (self-hosted, external)                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  onAuthenticate(token)  →  validate PAT against Git provider  │  │
│  │  onStoreDocument()      →  SQLite persistence                 │  │
│  │  onLoadDocument()       →  restore Y.Doc from SQLite          │  │
│  │  Yjs sync protocol      →  relay updates between clients      │  │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│  State Layer (existing)                                              │
│  issuesStore ← editor.patchSection() ← Y.Text.observe()             │
│  configStore, templatesStore                                         │
├──────────────────────────────────────────────────────────────────────┤
│  Adapter Layer (existing)                                            │
│  LocalFsAdapter / RemoteWritableAdapter / CommitQueueStore           │
│  ← serialise Y.Doc → Markdown on save                               │
└──────────────────────────────────────────────────────────────────────┘
```

**Data flow summary**:

1. User opens an issue → `editor.open(id)` clones `LoadedIssue` into `draft`.
2. If collaboration is enabled, a `Y.Doc` is created and seeded with the draft's Markdown sections and frontmatter fields.
3. The `Y.Doc` is bound to the CodeMirror editor via `y-codemirror.next`.
4. `HocuspocusProvider` connects to the self-hosted Hocuspocus server via WSS, authenticates with the user's PAT, and joins the room (room = hash of `provider/owner/repo/branch/issueId`). The server relays `Y.Doc` sync updates between connected clients.
5. Remote cursors and selections are rendered in the CodeMirror gutter via the Awareness protocol (managed by `HocuspocusProvider.awareness`).
6. On **Save**, the `Y.Doc` is serialised back into the canonical Markdown format, the `integrity_hash` is recomputed, and the file is written through the existing `WritableDirectoryAdapter` pipeline.
7. On **Close** (or after an inactivity timeout), the `Y.Doc` is destroyed, the `HocuspocusProvider` is disconnected, and the awareness state is cleared.

---

## 5. Stage 0 — Foundation: CodeMirror 6 Editor ✅ [COMPLETED]

**Goal**: Replace the raw `<Textarea>` Markdown editor with a
CodeMirror 6 instance. This stage introduces **zero** collaboration
logic — it is purely an editor upgrade that can be shipped and tested
independently.

### 5.1 New modules

| File                                 | Purpose                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/ui/CodeMirrorEditor.svelte` | Svelte 5 wrapper around CodeMirror 6 `EditorView`. Props: `value`, `onchange`, `readonly`, `class`, `language`. Uses `onMount` for lifecycle, not `$state` on the view (CM6 is imperative).   |
| `src/lib/ui/codemirror-theme.ts`     | Custom CodeMirror theme that matches quill\.md's Tailwind design tokens (`--color-foreground`, `--color-background`, `--color-primary`, etc.). Supports dark mode via `EditorView.darkTheme`. |

### 5.2 Modified modules

| File                                    | Change                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/EditorPanel.svelte` | Replace `<Textarea>` import with `<CodeMirrorEditor>` in the "Write" tab. The `oninput` handler becomes an `onchange` callback that calls `editor.patchSection(name, newValue)`. |
| `src/lib/components/WikiView.svelte`    | Replace `<Textarea>` with `<CodeMirrorEditor>`.                                                                                                                                  |
| `src/lib/components/TodoView.svelte`    | Replace `<Textarea>` with `<CodeMirrorEditor>`.                                                                                                                                  |
| `src/lib/components/AdrView.svelte`     | Replace `<Textarea>` with `<CodeMirrorEditor>`.                                                                                                                                  |
| `src/lib/ui/Textarea.svelte`            | **Not deleted** — still used by non-Markdown fields (e.g. `longtext` form fields in `FormFields.svelte`).                                                                        |

### 5.3 Dependencies added

```
pnpm add codemirror @codemirror/lang-markdown @codemirror/language-data @codemirror/state @codemirror/view
```

### 5.4 Implementation detail

```svelte
<!-- CodeMirrorEditor.svelte (simplified) -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { quillTheme, quillDarkTheme } from './codemirror-theme';

	type Props = {
		value: string;
		onchange?: (value: string) => void;
		readonly?: boolean;
		class?: string;
	};

	let { value, onchange, readonly = false, class: cls = '' }: Props = $props();
	let container: HTMLDivElement;
	let view: EditorView;

	onMount(() => {
		view = new EditorView({
			doc: value,
			extensions: [
				basicSetup,
				markdown(),
				EditorView.editable.of(!readonly),
				EditorView.updateListener.of((update) => {
					if (update.docChanged && onchange) {
						onchange(update.state.doc.toString());
					}
				}),
				// Theme selection based on prefers-color-scheme or the theme store
				quillTheme
			],
			parent: container
		});

		return () => view.destroy();
	});
</script>

<div bind:this={container} class="cm-wrapper {cls}" data-testid="codemirror-editor"></div>
```

### 5.5 Verification

- All existing tests pass (the textarea → CM6 swap is UI-only; the data
  model and serialisation are untouched).
- Manual: open an issue, switch to "Write" tab → CM6 editor renders with
  Markdown syntax highlighting. Type, save, reload — round-trip is
  byte-identical.

### 5.6 Vite config considerations

CodeMirror's ESM packages sometimes trigger Vite's tree-shaking
incorrectly. Add to `vite.config.ts`:

```ts
optimizeDeps: {
	include: ['codemirror', '@codemirror/state', '@codemirror/view'];
}
```

---

## 6. Stage 1 — CRDT Data Layer (Yjs)

**Goal**: Introduce Yjs as the in-memory collaborative data model for
an open issue. No network transport yet — this stage wires Yjs to the
editor and the issues store locally.

### 6.1 New modules

| File                                | Purpose                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/collab/ydoc-factory.ts`    | `createIssueYDoc(issue: Issue): Y.Doc` — seeds a `Y.Doc` from a parsed `Issue`. Creates `Y.Map('fields')` for frontmatter and `Y.Map('sections')` containing `Y.Text` entries keyed by section name. |
| `src/lib/collab/ydoc-serializer.ts` | `serializeYDoc(doc: Y.Doc, template: Template): Issue` — reads the `Y.Doc` and reconstructs the canonical `Issue` object (the inverse of `ydoc-factory`). Used on save.                              |
| `src/lib/collab/index.ts`           | Barrel export for the collaboration layer.                                                                                                                                                           |

### 6.2 Modified modules

| File                                 | Change                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/ui/CodeMirrorEditor.svelte` | Add an optional `ytext?: Y.Text` prop. When present, the CM6 instance uses `yCollab(ytext, awareness)` from `y-codemirror.next` instead of the plain `updateListener`. The `value` prop becomes the fallback for non-collaborative mode. |
| `src/lib/state/editor.svelte.ts`     | `EditorStore` gains `ydoc: Y.Doc                                                                                                                                                                                                         | null`and`awareness: Awareness | null`as`$state.raw`slots.`open(id)`creates the`Y.Doc`via`createIssueYDoc(draft.issue)`. `save()`uses`serializeYDoc(ydoc)`instead of`cloneIssueFields(draft.issue)`when a`Y.Doc`is active.`close()`calls`ydoc.destroy()`. |

### 6.3 Dependencies added

```
pnpm add yjs y-codemirror.next
```

### 6.4 Y.Doc structure

```
Y.Doc
├── Y.Map('meta')
│   ├── 'id'         → string
│   ├── 'title'      → string
│   ├── 'status'     → string
│   ├── 'assignee'   → string | null
│   ├── 'labels'     → Y.Array<string>
│   ├── 'relations'  → Y.Array<Y.Map>
│   └── ... (all Issue.fields keys)
│
├── Y.Map('customFields')
│   └── ... (template-defined keys)
│
└── Y.Map('sections')
    ├── 'Description'    → Y.Text
    ├── 'Steps to Reproduce' → Y.Text
    └── ... (one Y.Text per IssueSection.name)
```

### 6.5 Observer pattern

The `Y.Doc` is the authoritative source of truth while the editor is
open. `Y.Text.observe()` and `Y.Map.observeDeep()` drive the
`editor.isDirty` flag. The existing `editor.patchSection(name, markdown)`
verb is retired in favour of direct `Y.Text` mutations via the CM6
binding. `patchField(key, value)` continues to work but writes to the
`Y.Map('meta')` or `Y.Map('customFields')` instead of the plain draft
clone.

### 6.6 Verification

- Single-user: open issue → edit in CM6 → save → reload → diff shows
  same content.
- Unit test: `createIssueYDoc(issue)` → `serializeYDoc(doc)` round-trip
  produces a semantically equivalent `Issue`.

---

## 7. Stage 2 — Server Relay Sync (Hocuspocus)

**Goal**: Enable live sync of the `Y.Doc` between peers editing the
same issue via a self-hosted Hocuspocus WebSocket server.

### 7.1 New modules

| File                        | Purpose                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/collab/room.ts`    | `createRoom(ydoc: Y.Doc, roomSeed: string, config: CollabConfig): { provider: HocuspocusProvider, cleanup: () => void }`. Generates a deterministic room name from `sha256(providerId + '/' + owner + '/' + repo + '/' + branch + '/' + issueId)`. Connects via `@hocuspocus/provider` to the configured Hocuspocus server URL. |
| `src/lib/collab/types.ts`   | `CollabConfig` interface: `{ enabled: boolean, serverUrl: string, token?: string, displayName?: string }`.                                                                                                                                                                                                                      |
| `server/server.ts`          | **[NEW directory]** Main entry point for the self-hosted Hocuspocus server. Configures `onAuthenticate` (validates PAT against Git provider API), `onStoreDocument` / `onLoadDocument` (SQLite persistence via `@hocuspocus/extension-sqlite`).                                                                                 |
| `server/package.json`       | Standalone Node.js package with `@hocuspocus/server` and `@hocuspocus/extension-sqlite` as dependencies.                                                                                                                                                                                                                        |
| `server/Dockerfile`         | Multi-stage Docker build (Node 22 slim) for self-hosted deployment.                                                                                                                                                                                                                                                             |
| `server/docker-compose.yml` | One-command deployment: `docker compose up`. Mounts a volume for SQLite data persistence.                                                                                                                                                                                                                                       |
| `server/README.md`          | Deployment guide for self-hosting (Docker, bare Node.js, environment variables).                                                                                                                                                                                                                                                |

### 7.2 Modified modules

| File                                 | Change                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/state/editor.svelte.ts`     | `open(id)` now calls `createRoom()` when `collabConfig.enabled === true`. The `HocuspocusProvider` is stored in a non-reactive closure variable (same pattern as the PAT in `mode.svelte.ts`). `close()` calls `provider.destroy()`. |
| `src/lib/ui/CodeMirrorEditor.svelte` | Receives `awareness` prop from the `HocuspocusProvider`. Passes it to `yCollab(ytext, awareness, { undoManager })`.                                                                                                                  |

### 7.3 Dependencies added

Client-side:

```
pnpm add @hocuspocus/provider
```

Server-side (in `server/`):

```
npm install @hocuspocus/server @hocuspocus/extension-sqlite
```

### 7.4 Room naming & authentication

The room name is a SHA-256 hash of the issue's canonical path within
the repository. This prevents enumeration (room names are opaque to
the Hocuspocus server). Authentication is handled server-side via the
`onAuthenticate` hook — the user's PAT is sent as the `token` parameter
during the WebSocket handshake and validated against the Git provider
API. No separate passwords or shared secrets are needed.

### 7.5 Server implementation

```ts
// server/server.ts
import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

const server = new Server({
	port: parseInt(process.env.PORT ?? '1234'),

	async onAuthenticate({ token, documentName }) {
		if (!token) {
			throw new Error('Authentication token required');
		}
		// Validate the PAT against the Git provider API.
		// Returns user context (name, id) for use in other hooks.
		const user = await validateTokenAgainstProvider(token);
		return { user };
	},

	extensions: [
		new SQLite({
			database: process.env.DB_PATH ?? 'data/hocuspocus.sqlite'
		})
	]
});

server.listen();
```

### 7.6 Client-side provider

```ts
// src/lib/collab/room.ts
import { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';
import type { CollabConfig } from './types';
import { sha256Hex } from '$lib/services/crypto';
import { deterministicColor } from './colors';

export function createRoom(
	ydoc: Y.Doc,
	roomSeed: string,
	config: CollabConfig
): { provider: HocuspocusProvider; cleanup: () => void } {
	const roomName = sha256Hex(roomSeed);
	const provider = new HocuspocusProvider({
		url: config.serverUrl,
		name: roomName,
		document: ydoc,
		token: config.token,
		connect: true,
		broadcast: true // BroadcastChannel for multi-tab sync
	});

	provider.awareness.setLocalStateField('user', {
		name: config.displayName ?? 'Anonymous',
		color: deterministicColor(provider.awareness.clientID)
	});

	return {
		provider,
		cleanup: () => {
			provider.awareness.destroy();
			provider.destroy();
		}
	};
}
```

### 7.7 Connection handling & fallback

If the Hocuspocus server is unreachable (network error, DNS failure),
the `HocuspocusProvider` automatically retries with exponential backoff.
The app continues in **single-player mode** during disconnection — no
error banner is shown, collaboration is a best-effort feature. The
`CollabStore` exposes a reactive `connectionState` derived from the
provider's `status` event:

```ts
provider.on('status', ({ status }: { status: string }) => {
	// status: 'connecting' | 'connected' | 'disconnected'
	collabStore.connectionState = status;
});
```

### 7.8 BroadcastChannel (same-origin multi-tab)

The `HocuspocusProvider`'s `broadcast: true` option enables the
built-in `BroadcastChannel` transport. This provides instant,
zero-config sync between tabs in the same browser without needing
the Hocuspocus server — useful for a developer who has the same issue
open in two tabs.

### 7.9 Docker deployment

```dockerfile
# server/Dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 1234
VOLUME ["/app/data"]
CMD ["node", "server.js"]
```

```yaml
# server/docker-compose.yml
services:
  hocuspocus:
    build: .
    ports:
      - '1234:1234'
    environment:
      - NODE_ENV=production
      - PORT=1234
      - DB_PATH=/app/data/hocuspocus.sqlite
    volumes:
      - hocuspocus-data:/app/data
    restart: unless-stopped

volumes:
  hocuspocus-data:
```

Teams deploy with a single command:

```bash
cd server && docker compose up -d
```

### 7.10 Verification

- Open the same issue in two browser tabs → edits in one tab appear in
  the other with < 100 ms latency (via BroadcastChannel).
- Open the same issue in two different browsers (connected to the same
  Hocuspocus server) → edits sync via WebSocket relay.
- Stop the Hocuspocus server → app continues to work in single-player
  mode with no errors. Reconnects automatically when the server comes
  back.
- Restart the Hocuspocus server → Y.Doc state is restored from SQLite.
  Clients reconnect and resume from last synced state.

---

## 8. Stage 3 — Presence & Awareness UX

**Goal**: Show who is online, where their cursor is, and what they are
selecting, using Yjs's Awareness protocol.

### 8.1 New modules

| File                                        | Purpose                                                                                                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/collab/awareness-store.svelte.ts`  | `CollabPresenceStore` — reactive Svelte 5 store that subscribes to `provider.awareness` and exposes `peers: { clientId, name, color, cursor }[]`. Uses `$state.raw` for the peer list and `$derived` for `peerCount`. |
| `src/lib/collab/colors.ts`                  | A palette of 12 distinguishable cursor colors (colorblind-safe). Each peer gets a deterministic color from `hash(clientId) % palette.length`.                                                                         |
| `src/lib/components/PresenceBar.svelte`     | A horizontal bar at the top of the `EditorPanel` showing avatar circles for each online peer, with their name on hover tooltip. The local user's circle is always first.                                              |
| `src/lib/components/PresenceCursors.svelte` | (Handled by `y-codemirror.next` — remote cursor decorations are built-in. This component adds Tailwind styling to the CM6 cursor widgets.)                                                                            |

### 8.2 Modified modules

| File                                    | Change                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/components/EditorPanel.svelte` | Mounts `<PresenceBar>` below the header when `collabStore.peerCount > 0`. |
| `src/lib/state/editor.svelte.ts`        | Exposes `collabPresence: CollabPresenceStore                              | null` for the UI to read. |

### 8.3 Awareness state shape

```ts
// Each peer broadcasts:
awareness.setLocalStateField('user', {
	name: 'Camilo', // from provider's authenticated user, or a setting
	color: '#e06c75', // from colors.ts palette
	cursor: null // managed automatically by y-codemirror.next
});
```

### 8.4 Throttling

Awareness updates are throttled to 50 ms (default in Hocuspocus's
awareness handling). Cursor movements faster than this are coalesced.
This keeps bandwidth low (< 1 KB/s per peer) while maintaining a
responsive experience.

### 8.5 Verification

- Two tabs open → both show each other's avatar in `PresenceBar`.
- User A types in the Description section → User B sees User A's cursor
  in real-time, color-coded, with the user's name label.
- User B closes the tab → User A's `PresenceBar` updates within 2 s
  (awareness timeout).

---

## 9. Stage 4 — Git Reconciliation

**Goal**: Bridge the real-time Y.Doc state with the persistent Git
source of truth. This is the most architecturally sensitive stage.

### 9.1 Save flow (Y.Doc → Git)

When the user clicks **Save** (or auto-save triggers):

1. `serializeYDoc(ydoc, template)` reconstructs the `Issue` object from
   the `Y.Doc`'s `Y.Map` and `Y.Text` contents.
2. The `Issue` is serialised to Markdown via the existing
   `serializeIssueFile()` in `src/lib/services/serializer.ts`.
3. The `integrity_hash` is recomputed via `computeIntegrity()` in
   `src/lib/services/integrity.ts`.
4. The file is written through the existing `WritableDirectoryAdapter`
   pipeline (Local: FSA; Remote: `RemoteWritableAdapter` →
   `CommitQueueStore` → provider REST API).

**No change** to the adapter or commit-queue layer. The serialisation
step is the only new seam.

### 9.2 Load flow (Git → Y.Doc)

When a user opens an issue (`editor.open(id)`):

1. The `LoadedIssue` is deep-cloned from `issues.byId` (existing flow).
2. A `Y.Doc` is seeded from the clone via `createIssueYDoc(issue)`.
3. If another peer is already in the same room, the `Y.Doc` states are
   merged automatically by Yjs's CRDT merge. The local seed is treated
   as the "initial state" and remote deltas are applied on top.
4. If the Yjs merge produces content that differs from the file on disk
   (because the other peer has unsaved edits), the editor shows an
   informational banner: _"Another user has unsaved edits on this issue.
   Their changes will be included when either of you saves."_

### 9.3 Conflict handling

| Scenario                                                   | Resolution                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two peers edit simultaneously, one saves                   | The saver's `Y.Doc` state (which includes both peers' edits via CRDT merge) is serialised and committed. The non-saver's `Y.Doc` is already in sync (same CRDT state).                                                              |
| Peer A saves, Peer B was offline                           | Peer B's local `Y.Doc` has diverged. On reconnect, `HocuspocusProvider` syncs the states via the server. The CRDT merge produces a consistent document. The next save captures the merged state.                                    |
| Git-level conflict (409)                                   | Handled by the existing `RemoteConflictError` flow. The `CommitQueueStore` preserves the local draft. The user clicks "Refresh" → `refreshRemote(pat)` fetches the latest state → the `Y.Doc` is re-seeded → CRDT merge reconciles. |
| External edit (someone edits the `.md` directly on GitHub) | On next `refreshRemote`, the file is re-parsed. If the `integrity_hash` mismatches, the existing `integrityWarning` banner fires. The user re-opens the issue, which re-seeds the `Y.Doc` from the new content.                     |

### 9.4 Modified modules

| File                             | Change                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/state/editor.svelte.ts` | `save()` branches: if `ydoc` is non-null, it serialises from the `Y.Doc` instead of the plain draft clone. |
| `src/lib/services/serializer.ts` | No change — receives an `Issue` object regardless of source.                                               |
| `src/lib/services/integrity.ts`  | No change — operates on the serialised string.                                                             |

---

## 10. Stage 5 — Configuration & Settings

**Goal**: Expose collaboration settings in the UI and in
`.quill.md/config.json`.

### 10.1 Config schema extension

Add a `collaboration` key to `Config` in `src/lib/types/config.ts`:

```ts
export interface CollaborationConfig {
	/** Enable real-time collaboration (default: false). */
	enabled?: boolean;
	/** Hocuspocus server WebSocket URL (e.g. 'wss://collab.myteam.com'). */
	server_url?: string;
	/** Display name for presence (overrides provider user name). */
	display_name?: string;
}

export interface Config {
	// ... existing fields ...
	collaboration?: CollaborationConfig;
}
```

### 10.2 Settings panel

Add a "Collaboration" section to `SettingsPanel.svelte`:

- Toggle: "Enable real-time collaboration" (`config.collaboration.enabled`)
- Input: "Hocuspocus server URL" (e.g. `wss://collab.myteam.com`)
- Input: "Display name" (optional, defaults to provider user name)
- Advisory text: _"When enabled, your browser connects to the configured
  Hocuspocus server via WebSocket. Document content is transmitted over
  TLS-encrypted WebSocket to your self-hosted server. Only users with a
  valid token can join a collaboration session."_

### 10.3 User identity for collaboration

The user's display name for presence is sourced from (in priority
order):

1. `config.collaboration.display_name` (per-project override)
2. The authenticated provider user's display name (from
   `fetchResult.author.name`)
3. `'Anonymous'` (Local Edit Mode, no config)

### 10.4 Modified modules

| File                                      | Change                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/types/config.ts`                 | Add `CollaborationConfig` interface and `collaboration?` field to `Config`.          |
| `src/lib/services/config-loader.ts`       | Parse `collaboration` key with defaults (`enabled: false`, `server_url: undefined`). |
| `src/lib/components/SettingsPanel.svelte` | Add collaboration settings section.                                                  |
| `src/lib/ui/strings.ts`                   | Add i18n keys for collaboration UI strings.                                          |

---

## 11. Stage 6 — Offline & Resilience

**Goal**: Ensure collaboration degrades gracefully and the user's
work is never lost.

### 11.1 y-indexeddb persistence

Add `y-indexeddb` to persist the `Y.Doc` state locally. If the user
closes the tab and reopens the issue, the `Y.Doc` is restored from
IndexedDB (with any edits that were not yet saved to Git). On
reconnect, `HocuspocusProvider` syncs the local state with the server.

DB name: `quill-md-collab-{roomName}` (one DB per issue session).
Cleanup: on `editor.close()`, if the `Y.Doc` is not dirty, destroy
the IndexedDB entry. If dirty (unsaved edits), keep it for 24 h,
then GC.

### 11.2 Dependencies added

```
pnpm add y-indexeddb
```

### 11.3 Degradation matrix

| Failure                                | Behaviour                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hocuspocus server unreachable          | Single-player mode. Collab indicator shows "offline". Edits saved normally to Git. `HocuspocusProvider` auto-reconnects with exponential backoff. |
| WebSocket connection drops mid-session | Provider auto-reconnects. Y.Doc state is synced on reconnect via Hocuspocus's built-in state vector exchange. Cursors reappear once reconnected.  |
| Hocuspocus server restarts             | `@hocuspocus/extension-sqlite` restores Y.Doc state. Clients reconnect and resume from last synced state. No data loss.                           |
| IndexedDB unavailable                  | `Y.Doc` lives only in memory (same as Stage 1). A warning is logged but no user-facing error.                                                     |
| Git save fails (409)                   | Existing `RemoteConflictError` flow. The `Y.Doc` in memory is preserved. User refreshes and retries.                                              |

### 11.4 Modified modules

| File                     | Change                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `src/lib/collab/room.ts` | Add `IndexeddbPersistence` from `y-indexeddb` alongside `HocuspocusProvider`. Both are destroyed on cleanup. |

---

## 12. Stage 7 — Testing & Verification

### 12.1 Unit tests (`server` project)

| Test file                                | Covers                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/collab/ydoc-factory.test.ts`    | `createIssueYDoc` → seeds `Y.Doc` correctly from an `Issue`.                               |
| `src/lib/collab/ydoc-serializer.test.ts` | `serializeYDoc` → reconstructs `Issue` from `Y.Doc`.                                       |
| `src/lib/collab/ydoc-roundtrip.test.ts`  | `createIssueYDoc` → mutate `Y.Text` → `serializeYDoc` → `parseIssueFile` round-trip.       |
| `src/lib/collab/room.test.ts`            | Room name generation is deterministic; `HocuspocusProvider` config is correctly assembled. |

### 12.2 Browser tests (`client` project)

| Test file                                       | Covers                                          |
| ----------------------------------------------- | ----------------------------------------------- |
| `src/lib/ui/CodeMirrorEditor.svelte.test.ts`    | Renders, accepts input, fires `onchange`.       |
| `src/lib/components/PresenceBar.svelte.test.ts` | Renders peer avatars from mock awareness state. |

### 12.3 Integration tests

| Test                   | Approach                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-tab collab         | Playwright: open two tabs with the same issue. Type in Tab A → assert content appears in Tab B via `BroadcastChannel` (no Hocuspocus server needed). |
| Save after collab edit | Open issue → mutate via `Y.Text.insert()` → call `save()` → assert written file matches expected Markdown.                                           |
| Server relay sync      | Start an in-process Hocuspocus server. Connect two `HocuspocusProvider` instances to it. Verify Y.Doc state converges.                               |

### 12.4 Manual verification

- Two browsers, same Hocuspocus server: cursors visible, edits sync.
- Stop Hocuspocus server mid-session: cursors disappear, local editing
  continues. Restart server → clients reconnect, cursors reappear.
- Save from both browsers: first save succeeds; second gets 409, shows
  conflict banner, refresh resolves.

---

## 13. Dependency Inventory

### 13.1 Client-side packages (in client bundle)

| Package                     | Version | Size (gzip) | Purpose                       | License |
| --------------------------- | ------- | ----------- | ----------------------------- | ------- |
| `yjs`                       | ^13.x   | ~15 KB      | CRDT engine                   | MIT     |
| `y-codemirror.next`         | ^0.3.x  | ~5 KB       | CM6 ↔ Yjs binding             | MIT     |
| `@hocuspocus/provider`      | ^4.x    | ~12 KB      | Hocuspocus WebSocket provider | MIT     |
| `y-indexeddb`               | ^9.x    | ~3 KB       | Offline persistence           | MIT     |
| `codemirror`                | ^6.x    | ~30 KB      | Editor core                   | MIT     |
| `@codemirror/lang-markdown` | ^6.x    | ~15 KB      | Markdown mode                 | MIT     |
| `@codemirror/language-data` | ^6.x    | ~10 KB      | Nested language support       | MIT     |
| `@codemirror/state`         | ^6.x    | ~25 KB      | Editor state                  | MIT     |
| `@codemirror/view`          | ^6.x    | ~50 KB      | Editor view                   | MIT     |

**Total bundle impact**: ~162 KB gzipped (code-split; loaded only when
the editor panel is open). Slightly smaller than the y-webrtc variant
because `@hocuspocus/provider` does not bundle WebRTC/STUN/TURN
polyfills.

### 13.2 Server-side packages (in `server/`, not in client bundle)

| Package                        | Version | Purpose                            | License |
| ------------------------------ | ------- | ---------------------------------- | ------- |
| `@hocuspocus/server`           | ^4.x    | Hocuspocus WebSocket server        | MIT     |
| `@hocuspocus/extension-sqlite` | ^4.x    | SQLite persistence for Y.Doc state | MIT     |

---

## 14. Risk Register

| Risk                                             | Likelihood | Impact | Mitigation                                                                                                                                                                                           |
| ------------------------------------------------ | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hocuspocus server unavailability**             | Medium     | Medium | Graceful degradation to single-player. Auto-reconnect with exponential backoff. Docker restart policy `unless-stopped`. BroadcastChannel covers same-browser multi-tab regardless.                   |
| **Hocuspocus server as single point of failure** | Medium     | Medium | SQLite persistence survives restarts. `@hocuspocus/extension-redis` available for horizontal scaling in future. Docker health checks for uptime monitoring.                                          |
| **Server sees document content**                 | N/A        | Medium | Self-hosted — data stays within team infrastructure. WSS (TLS) in transit. `onAuthenticate` prevents unauthorized access. Collaboration is opt-in.                                                   |
| **CRDT merge produces unexpected Markdown**      | Low        | High   | Extensive round-trip tests (`ydoc-roundtrip.test.ts`). The serialiser uses the same `serializeIssueFile` as today — Yjs only changes _how_ the `Issue` object is produced, not how it is serialised. |
| **Bundle size regression**                       | Low        | Low    | Code-split the collab layer behind a dynamic `import()`. Load only when the editor opens and `collaboration.enabled === true`.                                                                       |
| **CodeMirror Vite tree-shaking issues**          | Medium     | Low    | `optimizeDeps.include` in `vite.config.ts`. Known workaround, well-documented.                                                                                                                       |

---

## 15. ERS Amendments Required

The following ERS sections need amendments to accommodate real-time
collaboration. These should be authored as an ERS v4.0.0 revision.

| Section    | Amendment                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.2 Scope | Add "Real-time collaborative editing via self-hosted Hocuspocus server" to the In Scope list.                                                                                                                                                                                                                    |
| §2.4 C-1   | Add clarification: _"The app MAY connect to a self-hosted Hocuspocus WebSocket server for real-time collaboration when the feature is enabled. The server URL is configurable and the feature is opt-in. This is analogous to the Git provider — quill\.md ships no backend but connects to external services."_ |
| §3.1       | Add `FR-18: Real-time collaborative editing` with the full spec.                                                                                                                                                                                                                                                 |
| §3.2 NFR-2 | Add: _"Document content transmitted via WSS is TLS-encrypted. The Hocuspocus server authenticates users via token before allowing sync."_                                                                                                                                                                        |
| §3.2 NFR-3 | Add the Hocuspocus server as a permitted external endpoint (self-hosted, opt-in, alongside provider REST APIs).                                                                                                                                                                                                  |
| §5.1       | Add the Collaboration Layer and Hocuspocus Server to the architecture diagram.                                                                                                                                                                                                                                   |
| §5.3       | Add Yjs, `@hocuspocus/provider`, y-codemirror.next, y-indexeddb, CodeMirror 6 to the client technology stack. Add `@hocuspocus/server`, `@hocuspocus/extension-sqlite` to the server-side stack.                                                                                                                 |
| §6.3       | Document the `collaboration` key in `config.json`.                                                                                                                                                                                                                                                               |

---

## 16. Follow-Ups & Future Work

These items are explicitly **out of scope** for this migration but are
natural next steps:

1. **Redis horizontal scaling**: Use `@hocuspocus/extension-redis` to
   synchronise Y.Doc state across multiple Hocuspocus server instances
   for high-availability deployments.

2. **Webhooks on collaborative edits**: Use Hocuspocus's `onChange` hook
   to trigger external notifications (Slack, email, CI pipelines) when
   issues are edited collaboratively.

3. **Rate limiting & production hardening**: Configure Hocuspocus's
   built-in `maxConnections` and `maxUnauthenticatedQueueSize` for
   production deployments with many concurrent users.

4. **Cloudflare Workers runtime**: Hocuspocus v4 supports `crossws` for
   running on Cloudflare Workers + Durable Objects — a future option for
   teams wanting serverless collaboration infrastructure.

5. **Tiptap (rich-text) editor**: Replace CodeMirror with Tiptap for a
   WYSIWYG Markdown experience. The `Y.Doc` binding (`y-prosemirror`) is
   a drop-in replacement for `y-codemirror.next`.

6. **Real-time Kanban**: Extend the `Y.Doc` model to cover the Kanban
   board's column state, so drag-and-drop is synced in real-time (not
   just via Git commits).

7. **Collaborative frontmatter editing**: Stage 1's `Y.Map('meta')` lays
   the groundwork, but the FormFields UI does not yet bind to the
   `Y.Map`. A future stage would replace the `patchField` verb with
   `Y.Map.set()` calls so field edits are also synced in real-time.

8. **Presence on List/Kanban/Gantt views**: Show which users are
   currently viewing which view, and which issue they have open, via a
   global `Y.Doc` (one per repository, not per issue).

9. **Conflict-free auto-save**: Instead of requiring "Save", auto-commit
   after a configurable idle period (e.g. 30 s) when the `Y.Doc` is
   dirty and no other peer is actively typing.
