# quill\.md

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)
[![Svelte v5](https://img.shields.io/badge/Svelte-v5-%23FF3E00.svg?logo=svelte)](https://svelte.dev/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

A markdown-based, local-first issue tracker that travels with your repository.

## Capabilities

- **Local-First Architecture:** Reads and writes markdown files directly to your local file system via the File System Access API. Your issues live in `.quill.md/issues/` right next to your code.
- **Agile Methodologies on Demand:** Includes 20 built-in agile frameworks (Scrum, Kanban, SAFe, Spotify, etc.) natively translated to Spanish. The Setup Wizard instantly populates your workspace with the appropriate issue templates and workflows.
- **Dynamic Board Views:** Switch between List, Kanban, Gantt, and Graph views to visualize your workspace.
- **UML & Diagrams:** Built-in support for rendering Mermaid.js diagrams directly from Markdown blocks. Agentic workflows can seamlessly save UML/Mermaid images as renderable text blocks.
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

## Community

- **Contributing**: Please read our [Contributing Guide](./CONTRIBUTING.md) to learn about our development process, tech stack rules, and how to submit pull requests.
- **Code of Conduct**: We expect all contributors to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md).
- **Security**: For reporting vulnerabilities, see our [Security Policy](./SECURITY.md).

## License & Trademark

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

You are free to:

- Use this software for your own personal or internal projects.
- Self-host the software on your own servers for non-commercial purposes.
- Modify the source code for your own non-commercial use.

You may **NOT**:

- Use this software for any commercial purpose (e.g., selling it, offering it as a SaaS product, or using it to directly generate revenue).
- Remove the copyright notices.
- Distribute forks or modified versions using the "quill.md" name, logos, or branding (which are trademarks of Kiroku Solutions).

See the [LICENSE](./LICENSE) file for the full text of the license.
