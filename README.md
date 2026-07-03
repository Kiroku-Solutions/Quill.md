# quill\.md

A markdown-based, local-first issue tracker that travels with your repository.

## Capabilities

- **Local-First Architecture:** Reads and writes markdown files directly to your local file system via the File System Access API. Your issues live in `.quill.md/issues/` right next to your code.
- **Agile Methodologies on Demand:** Includes 20 built-in agile frameworks (Scrum, Kanban, SAFe, Spotify, etc.) natively translated to Spanish. The Setup Wizard instantly populates your workspace with the appropriate issue templates and workflows.
- **Dynamic Board Views:** Switch between List, Kanban, Gantt, and Graph views to visualize your workspace.
- **Data Integrity:** Computes and verifies SHA-256 hashes on every issue file to detect external modifications and prevent data corruption.
- **AI Integration (MCP):** Includes a standalone Model Context Protocol server (`quill-mcp-server`) that enables AI tools like Claude Desktop or Cursor to read and create issues directly in your local `.quill.md` workspace.

## Tech Stack

Built with SvelteKit \+ Svelte 5 (Runes mode), powered by [`sv`](https://github.com/sveltejs/cli). Tailwind CSS 4 is used for styling.

## Developing

```sh
# Use pnpm strictly
pnpm install
pnpm dev
```

## Building

```sh
pnpm build
pnpm preview
```

## Running the MCP Server

Connect your AI tools by pointing them to the built MCP server:

```sh
# Build the MCP server
cd quill-mcp-server
npm install
npm run build

# Start the server (pass the path to your repository root)
node dist/index.js "C:\path\to\your\repo"
```
