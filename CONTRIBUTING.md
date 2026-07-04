# Contributing to quill.md

First off, thank you for considering contributing to `quill.md`!

## Tech Stack & Conventions

This project uses modern, strict tooling. Before contributing, please note the following:

- **Framework**: SvelteKit + Svelte 5 (Runes mode is forced project-wide). **Never use `export let` or `<slot>`. Use `$props()`, `$state()`, and `{@render children()}`.**
- **Package Manager**: **`pnpm` is strictly required.** Do not use `npm` or `yarn`. (Node engine strictness is enforced via `.npmrc`).
- **Styling**: Tailwind CSS 4. Configured directly via CSS imports in `src/routes/layout.css` (no `tailwind.config.js`).
- **TypeScript**: Strict mode enabled.

## Local Development Setup

1. **Clone the repository**:

   ```sh
   git clone <your-fork-url>
   cd AgnosticIssuer
   ```

2. **Install dependencies**:

   ```sh
   pnpm install
   ```

3. **Start the development server**:
   ```sh
   pnpm dev
   ```

## Workflow & Commands

Before submitting a Pull Request, ensure your code passes the following checks locally (we have no CI hooks, so you must run these manually):

| Task                 | Command                                                   |
| -------------------- | --------------------------------------------------------- |
| **Pre-commit check** | `pnpm check && pnpm lint && pnpm test`                    |
| Typecheck            | `pnpm check` (runs `svelte-kit sync` then `svelte-check`) |
| Lint & Format        | `pnpm lint` (`prettier --check . && eslint .`)            |
| Format Code          | `pnpm format`                                             |
| Unit Tests           | `pnpm test`                                               |

## Testing Architecture

Our tests are split into three environments (configured in `vite.config.ts`):

- **Client**: Playwright + Chromium (headless). Tests UI and File System Access API components.
- **Server**: Node environment. Tests the core logic, ISO-git, and services.
- **Renderer**: Node + JSDOM for testing the markdown renderer.

If you add a test that requires `window` (e.g. `isFsaAvailable()`), ensure it's named `*.svelte.test.ts` so it runs in the client browser environment, otherwise it will fail in the Node server environment.

## Pull Request Process

1. Fork the repo and create your branch from `main`.
2. Ensure you have followed the strict runes mode for Svelte 5.
3. If you've added code that should be tested, add tests.
4. Update the documentation if you've changed APIs or features.
5. Ensure the test suite passes (`pnpm check && pnpm lint && pnpm test`).
6. Open a Pull Request using our template.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
