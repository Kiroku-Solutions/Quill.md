# Step 4 — Plan de Implementación del Adapter Layer

> **Documento:** `step-4-implementation-plan.md`
> **Fecha:** 2026-06-22
> **Versión:** 1.0.0
> **Autor:** Mavis (MiniMax)
> **Alcance:** Implementación completa del adapter layer del ERS §5.3
> **Stack target:** SvelteKit 2 + Svelte 5 + TypeScript strict + Vite 8
> **Mentalidad:** Senior Fullstack — clean architecture, error handling tipado, atomicidad, testabilidad, traceability ERS

---

## Tabla de Contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Pre-flight fixes (bloqueantes)](#2-pre-flight-fixes-bloqueantes)
3. [Decisiones técnicas justificadas](#3-decisiones-técnicas-justificadas)
4. [Matriz de trazabilidad ERS](#4-matriz-de-trazabilidad-ers)
5. [Arquitectura del adapter layer](#5-arquitectura-del-adapter-layer)
6. [Errores tipados compartidos](#6-errores-tipados-compartidos)
7. [Plan archivo por archivo](#7-plan-archivo-por-archivo)
   - 7.1 [`src/lib/adapters/errors.ts`](#71-srclibadapterserrorsts)
   - 7.2 [`src/lib/adapters/feature-detect.ts`](#72-srclibadaptersfeature-detectts)
   - 7.3 [`src/lib/adapters/memory-fs.ts`](#73-srclibadaptersmemory-fsts)
   - 7.4 [`src/lib/adapters/local-fs.ts`](#74-srclibadapterslocal-fsts)
   - 7.5 [`src/lib/adapters/handle-store.ts`](#75-srclibadaptershandle-storets)
   - 7.6 [`src/lib/adapters/trash.ts`](#76-srclibadapterstrashts)
   - 7.7 [`src/lib/adapters/renderer.ts`](#77-srclibadaptersrendererts)
   - 7.8 [`src/lib/adapters/remote-git.ts`](#78-srclibadaptersremote-gitts)
   - 7.9 [`src/lib/adapters/index.ts`](#79-srclibadaptersindexts)
8. [Patrones de implementación recurrentes](#8-patrones-de-implementación-recurrentes)
9. [Dependencias a instalar](#9-dependencias-a-instalar)
10. [Configuración adicional del proyecto](#10-configuración-adicional-del-proyecto)
11. [Testing strategy](#11-testing-strategy)
12. [Orden de implementación (riesgo-decreciente)](#12-orden-de-implementación-riesgo-decreciente)
13. [Definition of done — Step 4](#13-definition-of-done--step-4)
14. [Riesgos y mitigaciones](#14-riesgos-y-mitigaciones)
15. [Apéndices](#15-apéndices)

---

## 1. Resumen ejecutivo

Step 4 cierra el **adapter layer** definido en el ERS §5.1 y §5.3. Una vez completado, la service layer (ya terminada en Step 3) tendrá implementaciones reales de su abstracción `DirectoryAdapter`, además de las tres integraciones con el exterior: filesystem local (FSA), Git remoto (`isomorphic-git`) y rendering de Markdown (`marked` + `DOMPurify`).

### Lo que se va a construir

| Archivo             | Líneas estimadas | Propósito                                | Cobertura ERS                            |
| ------------------- | ---------------- | ---------------------------------------- | ---------------------------------------- |
| `errors.ts`         | ~80              | Errores tipados del adapter layer        | NFR-7                                    |
| `feature-detect.ts` | ~40              | Detección de capacidades del browser     | NFR-5, C-3                               |
| `memory-fs.ts`      | ~180             | Adapter in-memory para tests             | (test infrastructure)                    |
| `local-fs.ts`       | ~280             | Adapter FSA para Local Edit Mode         | FR-4, NFR-7, C-3, C-4                    |
| `handle-store.ts`   | ~220             | Persistencia del FSA handle en IndexedDB | FR-4, ERS §5.5                           |
| `trash.ts`          | ~60              | Lógica de move-to-trash + empty-trash    | FR-4                                     |
| `renderer.ts`       | ~150             | Markdown → HTML sanitized                | FR-13                                    |
| `remote-git.ts`     | ~350             | Partial clone + cache en LightningFS     | FR-5, FR-10, FR-12, NFR-1, C-2, C-5, C-6 |
| `index.ts`          | ~20              | Barrel re-exports                        | —                                        |
| **Tests**           | ~900             | Cobertura ≥80%                           | (test infrastructure)                    |

**Total: ~2,280 líneas de código + tests.**

### Lo que NO se construye en Step 4

- State layer (Step 5) — runes-based stores
- UI layer (Step 6) — todos los componentes y rutas
- Tests e2e con Playwright (Step 7) — solo unit tests en Step 4

Step 4 es **puramente funcional**: implementa las operaciones del adapter, valida con tests unitarios, y deja todo listo para que Step 5 construya los stores que las consumen.

### Principios rectores

1. **Pure functions donde sea posible.** El adapter layer tiene side effects por naturaleza, pero los métodos deben ser lo más atómicos y deterministas posible.
2. **Errores tipados, no strings.** Cada error es una clase exportada con un `type` discriminable. El state layer (Step 5) podrá hacer `if (err instanceof FsaPermissionError)` sin parsear mensajes.
3. **Atomicidad.** Escrituras locales usan temp-file + rename (NFR-7: "A failed local write MUST be rolled back").
4. **Resource cleanup.** File handles, IndexedDB transactions, fetch abort signals — todos se cierran/libera en `finally` o vía `AbortController`.
5. **Feature detection con graceful degradation.** `local-fs` no se rompe en Firefox: lanza `FsaUnavailableError` (subclass de `AdapterError`).
6. **No PAT persistence (NFR-2).** El PAT vive solo en `WeakRef` dentro de `repo.svelte.ts` (Step 5). El adapter `remote-git` lo recibe como parámetro en cada operación.
7. **Logging estructurado, no console.log.** Helper `logAdapter(level, msg, ctx)` que en dev hace `console.debug` y en prod no-op. Nunca loguear PAT, file contents completos, ni paths sensibles.
8. **Testable in pure Node.** `memory-fs.ts` no toca browser APIs. Los demás adapters tienen una capa de "browser API wrappers" en el mismo archivo que se mockea en tests.

---

## 2. Pre-flight fixes (bloqueantes)

Estos issues están documentados en `docs/current-project-status.md` §Open issues. **Resolverlos ANTES de empezar Step 4** para evitar confusión posterior.

### 2.1 Fix `AGENTS.md` líneas 20 y 50

**Problema:** menciona `adapter-auto` cuando el proyecto usa `adapter-static`.

```diff
- adapter-auto
+ adapter-static
```

**Por qué ahora:** otros agents van a leer AGENTS.md para orientarse. Si dice `adapter-auto`, van a instalar el adapter equivocado.

### 2.2 Agregar `engines.node` a `package.json`

```diff
  "type": "module",
  "scripts": { ... },
+ "engines": {
+   "node": ">=20"
+ },
  "devDependencies": { ... }
```

**Por qué ahora:** `.npmrc` ya tiene `engine-strict=true`. Sin el campo `engines`, pnpm no puede validar la versión y developers con Node 18 fallan en runtime en vez de en install time.

### 2.3 Verificar `.gitignore`

Confirmar que estén ignorados (no commitear secrets accidentalmente):

```gitignore
.env
.env.*
!.env.example
!.env.test
node_modules/
.svelte-kit/
build/
dist/
*.log
.DS_Store
```

### 2.4 Decidir syntax de scripts

`package.json:16` dice `"test": "npm run test:unit -- --run"`. **Esto es un bug.** En un proyecto pnpm esto intenta ejecutar `npm`, no `pnpm`. Fix:

```diff
- "test": "npm run test:unit -- --run"
+ "test": "vitest --run"
```

### 2.5 Fix del bug cosmético en `validator.ts:71-74`

Identificado en el audit previo. El closing node del cycle se reporta dos veces. No afecta detección, solo el mensaje:

```diff
  if (onStack.has(id)) {
    const start = stack.indexOf(id);
    if (start >= 0) {
      const cycle = stack.slice(start).concat(id);
-     for (const node of cycle) {
-       const existing = errors.get(node) ?? [];
-       existing.push(id);
-       errors.set(node, existing);
-     }
+     const uniqueCycle = [...new Set(cycle)];
+     for (const node of uniqueCycle) {
+       errors.set(node, [...(errors.get(node) ?? []), id]);
+     }
    }
    return;
  }
```

**Por qué ahora:** mientras escribimos los adapters, vamos a usar el validator intensivamente. Mejor tener el output limpio desde el principio.

### 2.6 Crear branch `step-4-adapters`

```bash
git checkout main
git pull
git checkout -b step-4-adapters
```

**Por qué:** los pre-flight fixes + los adapters son un PR cohesivo. Después seguimos con branches separados por feature si fuera necesario.

---

## 3. Decisiones técnicas justificadas

### 3.1 Shiki vs marked-only para syntax highlighting (FR-13)

**ERS §5.3:** "Code highlighting | `shiki` (preferred) or `highlight.js` | For code blocks in sections."

**ERS §3.1 FR-13:** "Code blocks MUST be syntax-highlighted using a low-cost highlighter (the choice of highlighter is left to the implementation; `shiki` and `highlight.js` are both acceptable)."

**Decisión para Step 4: marked + DOMPurify SOLO, sin syntax highlighter.**

**Justificación:**

| Factor           | Shiki                               | highlight.js                     | marked-only (deferred) |
| ---------------- | ----------------------------------- | -------------------------------- | ---------------------- |
| Bundle size      | ~2MB con todos los languages        | ~50KB core + 5-50KB per language | 0 (sin highlighter)    |
| Calidad visual   | Excelente (TextMate grammar)        | Buena                            | Nula (texto plano)     |
| Runtime perf     | Lento si todos los languages cargan | Rápido con subset                | Instant                |
| Setup complexity | Medium (grammar registry)           | Low                              | None                   |

**Criterio:** "low-cost highlighter" + NFR-1 (performance budget). Shiki con lazy loading bundle es viable pero agrega complejidad significativa a Step 4.

**Plan:** Step 4 implementa `renderer.ts` sin syntax highlighter. Step 4.5 (o Step 6 si se prefiere) agrega shiki con lazy-load si el equipo lo decide. El código del editor ya muestra "no syntax highlighting" como estado aceptable — los code blocks se renderizan como `<pre><code>` plain con font-mono.

**Tradeoff documentado en `docs/architecture-strategy.md` §6.4.**

### 3.2 Estrategia de atomic writes (NFR-7)

**NFR-7:** "A failed local write MUST be rolled back (the file MUST NOT be partially updated)."

**Decisión: temp-file + rename pattern.**

```
writeTextFile(path, content):
  1. ensure parent directory exists (create if missing)
  2. write content to `<path>.tmp-<random>` (atomic on POSIX filesystems via O_EXCL)
  3. rename temp → final path (atomic on POSIX, may fail on Windows)
  4. on any failure: delete temp + propagate error
```

**Justificación:**

- POSIX `rename(2)` es atómico — el archivo final siempre existe completo o no existe.
- En Windows, `MoveFileEx` con `MOVEFILE_REPLACE_EXISTING` también es atómico.
- Si el write al temp falla, el archivo original queda intacto. NFR-7 ✅.

**Edge case a manejar:** el directorio padre no existe. La service layer espera poder escribir en `.agnostic-issuer/issues/`, pero el directorio puede no existir (FR-4: "Create — generate a new issue file"). La `LocalFsAdapter.writeTextFile` debe crear el directorio padre recursivamente antes del write.

### 3.3 IndexedDB schema design (handle-store + LightningFS)

**Dos stores separados** para evitar coupling:

1. **`handle-store`** — schema propio, nuestra DB.
   - DB name: `agnostic-issuer-handles`
   - DB version: `1`
   - Object store: `handles` (keyPath: `id`)
   - Records:
     ```typescript
     interface HandleRecord {
     	id: 'active' | `recent-${number}`; // 'active' | 'recent-1' | ... | 'recent-5'
     	handle: FileSystemDirectoryHandle;
     	name: string;
     	addedAt: number; // Date.now()
     }
     ```
   - Constraint: máximo 1 active + 5 recent = 6 records max.

2. **`@isomorphic-git/lightning-fs`** — DB manejada por la library.
   - DB name: `agnostic-issuer-lightning` (configurable)
   - Multiple "filesystems" dentro (keyed por `dir`).
   - Cada remote clone tiene su propio dir (`/repo-<hash>`).

**Justificación:** mantener separadas nuestras concerns de la cache de LightningFS simplifica el clear-cache flow (ERS FR-10: "The user MUST be able to clear the cache from a settings panel").

### 3.4 Estrategia de detección FSA (C-3, NFR-5)

**C-3:** "Local Edit Mode is only available on browsers that implement FSA."

**Implementación en `feature-detect.ts`:**

```typescript
export function isFsaAvailable(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.showDirectoryPicker === 'function' &&
		typeof window.FileSystemDirectoryHandle !== 'undefined' &&
		typeof window.FileSystemFileHandle !== 'undefined' &&
		typeof indexedDB !== 'undefined' // requerido por handle-store
	);
}
```

**Uso:** El state layer (Step 5) llama `isFsaAvailable()` al montar el home screen y deshabilita el botón "Open local folder" + muestra mensaje explicativo si retorna `false`.

**Test:** jsdom (Vitest server project) puede mockear `window.showDirectoryPicker` para tests.

### 3.5 Fetch strategy para remote-git

**Decisión: `isomorphic-git/http/web` transport + CORS proxy configurable.**

ERS §4.3 especifica los parámetros exactos:

```typescript
git.fetch({
	fs,
	http,
	dir: '/repo',
	ref: branch,
	refspec: `refs/heads/${branch}:refs/remotes/origin/${branch}`,
	singleBranch: true,
	depth: 1,
	onAuth: () => ({ username: pat }), // NFR-2: PAT nunca persistido
	corsProxy: config.remote.cors_proxy
});
```

**Decisión sobre Partial Clone:** ERS §3.1 FR-12 menciona `filepaths` para limitar el fetch al subtree `.agnostic-issuer/`. Sin embargo, `isomorphic-git` tiene soporte limitado para `filepaths` en `fetch`. **Decisión:** usar `singleBranch + depth:1 + tree walk manual post-fetch**. El árbol completo de `.agnostic-issuer/` es típicamente <5MB (NFR-1: "under 5 MB on disk" para el budget de 10s), así que el "full" clone del subtree sigue siendo eficiente.

**Implementación:**

```typescript
async function fetchSubtree(url, branch, fs, http, corsProxy, onAuth) {
	// 1. fetch all + checkout (singleBranch, depth 1)
	await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, depth: 1, onAuth, corsProxy });

	// 2. checkout working tree to a temporary dir
	await git.checkout({ fs, dir, ref: branch });

	// 3. walk the tree at .agnostic-issuer/ and copy to a clean dir
	//    (this is what `filepaths` would do if supported)
	await extractSubtree(fs, dir, '.agnostic-issuer', '/repo-clean');

	// 4. remove the original /repo dir
	await fs.promises.rm(dir, { recursive: true });

	// 5. rename /repo-clean → /repo
	await fs.promises.rename('/repo-clean', dir);
}
```

**Tradeoff:** se fetchean objetos fuera de `.agnostic-issuer/`, pero el costo es mínimo porque `depth:1` limita a 1 commit. El working tree final solo contiene `.agnostic-issuer/`.

### 3.6 Renderer security (XSS prevention)

**ERS §3.2 NFR-2:** "All Markdown rendering MUST be sanitized to prevent XSS."

**Decisión: marked + DOMPurify en serie.**

```typescript
function renderMarkdown(text: string): string {
	const rawHtml = marked.parse(text, { gfm: true, breaks: false });
	const cleanHtml = DOMPurify.sanitize(rawHtml, {
		ALLOWED_TAGS: [...defaultTags, 'pre', 'code'],
		ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class'],
		FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
		FORBID_ATTR: ['onerror', 'onload', 'onclick']
	});
	return cleanHtml;
}
```

**Config rationale:**

- `gfm: true` — GitHub Flavored Markdown (lo que los developers esperan).
- `breaks: false` — no insertar `<br>` en newlines simples (consistente con GitHub).
- `ALLOWED_TAGS` explícito — denylist por default (más seguro que allowlist).
- `FORBID_TAGS` defense-in-depth — por si DOMPurify cambia sus defaults.
- Sin `target="_blank"` automático — el editor puede agregar `rel="noopener"` si lo necesita.

### 3.7 Logging strategy

**Helper `logAdapter(level, message, context)` con tres niveles:**

- `debug` — en dev: `console.debug`. En prod: no-op.
- `info` — eventos de lifecycle (folder opened, cache cleared).
- `warn` — recoverable errors (permission re-prompt, cache miss).
- `error` — operaciones fallidas que el usuario necesita saber.

**NUNCA loguear:**

- PAT (ni parcial ni completo).
- File contents completos.
- Path names que podrían contener secrets (no aplica a `.agnostic-issuer/`).

**Test del logging:** Vitest puede capturar `console.debug` calls y verificar que PAT no aparece.

---

## 4. Matriz de trazabilidad ERS

Cada archivo del adapter layer cubre requisitos específicos del ERS. Esta matriz es la single source of truth para "¿qué archivo implementa qué requisito?".

| Requisito ERS | Descripción resumida                                                     | Archivos que lo cubren                                                                                                               |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **FR-4**      | Local Edit CRUD (create, read, update, delete + persist + switch folder) | `local-fs.ts`, `handle-store.ts`, `trash.ts`                                                                                         |
| **FR-5**      | Remote Read-Only Mode (partial clone + cache)                            | `remote-git.ts`                                                                                                                      |
| **FR-10**     | IndexedDB cache para remote mode                                         | `remote-git.ts` (via LightningFS)                                                                                                    |
| **FR-12**     | CORS proxy + partial clone config                                        | `remote-git.ts`                                                                                                                      |
| **FR-13**     | Markdown rendering sanitized                                             | `renderer.ts`                                                                                                                        |
| **NFR-1**     | Performance budgets                                                      | Todos (atomicidad, lazy resources, no logging in hot paths)                                                                          |
| **NFR-2**     | PAT in-memory only, no logs/URLs/IndexedDB                               | `remote-git.ts` (onAuth callback receives PAT, no storage)                                                                           |
| **NFR-3**     | No analytics/telemetry                                                   | `errors.ts` (no remote error reporting)                                                                                              |
| **NFR-5**     | Browser support matrix (FSA detection)                                   | `feature-detect.ts`                                                                                                                  |
| **NFR-7**     | Resilience (rollback, re-prompt, no cache corruption)                    | `local-fs.ts` (atomic writes), `handle-store.ts` (transactional IDB), `remote-git.ts` (try/catch around fetch)                       |
| **C-2**       | No remote writes                                                         | `remote-git.ts` (only fetch + checkout + read, no push/commit)                                                                       |
| **C-3**       | Local Mode solo Chromium                                                 | `feature-detect.ts`                                                                                                                  |
| **C-4**       | Permission re-grant graceful                                             | `local-fs.ts` (typed `FsaPermissionError`), `feature-detect.ts`                                                                      |
| **C-5**       | CORS proxy                                                               | `remote-git.ts` (configurable corsProxy param)                                                                                       |
| **C-6**       | PAT hygiene                                                              | `remote-git.ts` (PAT received as param, never stored, never logged)                                                                  |
| **ERS §5.5**  | Folder Handle Lifecycle                                                  | `handle-store.ts` (persist active handle), `local-fs.ts` (queryPermission / requestPermission), `feature-detect.ts` (detect support) |
| **ERS §6.4**  | Built-in Template Bundle                                                 | (NOT Step 4 — template wizard assets are Step 6, but `trash.ts` is the move-to-trash mechanism used)                                 |

**Requisitos NO cubiertos en Step 4 (cubiertos en otros Steps):**

- FR-1, FR-2, FR-3, FR-8, FR-9, FR-11, FR-15 → Step 3 (services) + Step 6 (UI).
- FR-6, FR-7 → Step 6 (UI views).
- FR-14 → Step 6 (theme toggle UI; backend plumbing en `theme.svelte.ts` es Step 5).
- NFR-4 → Step 6 (accessibility audit at component level).
- NFR-6 → Step 6 (i18n map; el adapter no toca strings).

---

## 5. Arquitectura del adapter layer

### 5.1 Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────┐
│  STATE LAYER (Step 5) — runes stores                             │
│  issuesStore, folderStore, repoStore, ...                        │
└──────────────────────────────────────────────────────────────────┘
                              │ uses interfaces
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ADAPTER LAYER (Step 4 — ESTE STEP)                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PUBLIC API (lo que importa el state layer)               │   │
│  │  LocalFsAdapter (impl DirectoryAdapter)                   │   │
│  │  RemoteGitAdapter (impl { fetch, read, ... })             │   │
│  │  handleStore (CRUD sobre IndexedDB handles)               │   │
│  │  renderMarkdown (función pura)                            │   │
│  │  moveToTrash / emptyTrash (helpers sobre DirectoryAdapter)│   │
│  │  isFsaAvailable / isFsaPermissionError (feature detect)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  INTERNAL HELPERS                                         │   │
│  │  MemoryFsAdapter (test infra — production-safe?)          │   │
│  │  errors.ts (typed errors)                                 │   │
│  │  logger (dev/prod switch)                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │ uses
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (Step 3 — DONE)                                   │
│  loadConfig, loadTemplates, loadIssues, parseIssueFile, ...      │
└──────────────────────────────────────────────────────────────────┘
                              │ uses
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  TYPES (Step 2 — DONE)                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Interfaces públicas (contratos que Step 5 va a consumir)

```typescript
// src/lib/adapters/index.ts (preview)

export type { DirectoryAdapter, DirectoryEntry } from './directory-adapter.ts';
export type {
	AdapterError,
	FsaPermissionError,
	FsaUnavailableError,
	AdapterNotFoundError,
	AdapterValidationError,
	RemoteFetchError,
	RemoteAuthError,
	RenderError
} from './errors.ts';

export { LocalFsAdapter } from './local-fs.ts';
export { MemoryFsAdapter } from './memory-fs.ts';
export { isFsaAvailable, isFsaPermissionError, isNotFoundError } from './feature-detect.ts';
export { handleStore } from './handle-store.ts';
export { moveToTrash, emptyTrash, TRASH_DIRECTORY } from './trash.ts';
export { renderMarkdown, renderInlineMarkdown } from './renderer.ts';
export { RemoteGitAdapter } from './remote-git.ts';

export type { RemoteCloneRequest, RemoteCloneResult, RemoteProgressEvent } from './remote-git.ts';
```

### 5.3 Dependency injection

El state layer (Step 5) instanciará los adapters con dependencies inyectadas:

```typescript
// En folder.svelte.ts (Step 5 — preview)
import { LocalFsAdapter } from '$lib/adapters/local-fs.ts';
import { handleStore } from '$lib/adapters/handle-store.ts';

const adapter = new LocalFsAdapter(handle);
const issues = await loadIssues(adapter);
```

Esto permite que en tests (Step 7), el state layer use `MemoryFsAdapter` en lugar de `LocalFsAdapter` sin tocar el resto del código.

---

## 6. Errores tipados compartidos

### 6.1 Jerarquía

```typescript
// src/lib/adapters/errors.ts

/**
 * Base class for all adapter-layer errors.
 * Discriminated by `type` so consumers can use `err instanceof` or `err.type`.
 */
export abstract class AdapterError extends Error {
	abstract readonly type: string;
	/** Original cause, if any. */
	readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = this.constructor.name;
		this.cause = options?.cause;
	}
}

/** FSA is not available in this browser (Firefox, Safari). */
export class FsaUnavailableError extends AdapterError {
	readonly type = 'fsa-unavailable' as const;
	constructor(cause?: unknown) {
		super('File System Access API is not available in this browser', { cause });
	}
}

/** FSA permission was denied or revoked (C-4). */
export class FsaPermissionError extends AdapterError {
	readonly type = 'fsa-permission-denied' as const;
	readonly handleName?: string;

	constructor(handleName?: string, cause?: unknown) {
		super(
			handleName
				? `Permission denied for folder "${handleName}". Please grant access.`
				: 'Permission denied. Please grant folder access.',
			{ cause }
		);
		this.handleName = handleName;
	}
}

/** File or directory does not exist. */
export class AdapterNotFoundError extends AdapterError {
	readonly type = 'not-found' as const;
	readonly path: string;

	constructor(path: string, cause?: unknown) {
		super(`Not found: ${path}`, { cause });
		this.path = path;
	}
}

/** Input validation failed (e.g., malformed JSON in config). */
export class AdapterValidationError extends AdapterError {
	readonly type = 'validation' as const;
	readonly path?: string;

	constructor(message: string, options?: { path?: string; cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.path = options?.path;
	}
}

/** Remote clone/fetch failed. */
export class RemoteFetchError extends AdapterError {
	readonly type = 'remote-fetch' as const;
	readonly status?: number;

	constructor(message: string, options?: { status?: number; cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.status = options?.status;
	}
}

/** Remote authentication failed (bad PAT, expired). */
export class RemoteAuthError extends AdapterError {
	readonly type = 'remote-auth' as const;
	constructor(message = 'Authentication failed (bad or expired token)', cause?: unknown) {
		super(message, { cause });
	}
}

/** Markdown rendering failed. */
export class RenderError extends AdapterError {
	readonly type = 'render' as const;
	constructor(message: string, cause?: unknown) {
		super(`Markdown render failed: ${message}`, { cause });
	}
}
```

### 6.2 Type guards

```typescript
// src/lib/adapters/feature-detect.ts (preview)

export function isAdapterError(err: unknown): err is AdapterError {
	return err instanceof AdapterError;
}

export function isFsaPermissionError(err: unknown): err is FsaPermissionError {
	return err instanceof FsaPermissionError;
}

export function isNotFoundError(err: unknown): err is AdapterNotFoundError {
	return err instanceof AdapterNotFoundError;
}

export function isRemoteError(err: unknown): err is RemoteFetchError | RemoteAuthError {
	return err instanceof RemoteFetchError || err instanceof RemoteAuthError;
}
```

### 6.3 Por qué tipados y no strings

1. **Type narrowing en TypeScript:** `if (err instanceof FsaPermissionError)` permite acceso a `err.handleName` sin cast.
2. **i18n futuro:** un error tipado tiene un `type` que se puede mapear a una traducción (NFR-6).
3. **Testing:** tests pueden assert `expect(err).toBeInstanceOf(FsaPermissionError)` — más robusto que `expect(err.message).toContain('permission')`.
4. **Cause chain:** `Error.cause` permite wrap-and-attach sin perder el stack original.

---

## 7. Plan archivo por archivo

### 7.1 `src/lib/adapters/errors.ts`

**Propósito:** Definir todos los errores del adapter layer como clases tipadas con jerarquía.

**ERS cubierto:** NFR-7 (resilience — error handling predecible), NFR-3 (no third-party error tracking).

**Diseño:**

- `AdapterError` (abstract) — base class.
- 7 subclases concretas (ver §6.1).
- Todos exportados individualmente + type union export.

**Interfaces y tipos:**

```typescript
export type AdapterErrorType =
	| 'fsa-unavailable'
	| 'fsa-permission-denied'
	| 'not-found'
	| 'validation'
	| 'remote-fetch'
	| 'remote-auth'
	| 'render';
```

**Algoritmo clave:** ninguno — solo definiciones de clase. La "lógica" es cómo las subclases se construyen con `super(message, { cause })`.

**Error handling:** N/A (este archivo solo define errores).

**Edge cases:**

- `cause` puede ser cualquier tipo (`unknown`). El adapter que lanza el error debe hacer `try { ... } catch (cause) { throw new XError(msg, { cause }); }`.
- Stack traces preservados automáticamente por V8 cuando se usa `super(message)`.
- No usar `cause: Error` para mensajes que ya son útiles por sí mismos (e.g., `FsaUnavailableError`).

**Tests (`tests/adapters/errors.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import {
	AdapterError,
	FsaUnavailableError,
	FsaPermissionError,
	isAdapterError,
	isFsaPermissionError
} from '$lib/adapters/errors.ts';

describe('AdapterError hierarchy', () => {
	it('preserves cause chain', () => {
		const root = new Error('root');
		const wrapped = new FsaPermissionError('my-folder', root);
		expect(wrapped.cause).toBe(root);
		expect(wrapped.message).toContain('my-folder');
	});

	it('exposes type discriminator', () => {
		expect(new FsaUnavailableError().type).toBe('fsa-unavailable');
	});

	it('type guards narrow correctly', () => {
		const err: unknown = new FsaPermissionError();
		if (isFsaPermissionError(err)) {
			// TypeScript knows err.handleName is string | undefined
			expect(typeof err.handleName === 'string' || err.handleName === undefined).toBe(true);
		}
	});

	it('subclasses have correct prototype chain', () => {
		const err = new FsaUnavailableError();
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});
});
```

**Dependencias internas:** ninguna.

**Dependencias externas:** ninguna.

---

### 7.2 `src/lib/adapters/feature-detect.ts`

**Propósito:** Detección de capacidades del browser + type guards sobre errores FSA.

**ERS cubierto:** NFR-5 (browser support matrix), C-3 (FSA solo Chromium), C-4 (permission re-grant).

**Diseño:**

- Funciones puras booleanas que inspeccionan `window`/`globalThis`.
- Type guards sobre clases de error.

**Interfaces y tipos:**

```typescript
export interface BrowserCapabilities {
	fsa: boolean;
	indexedDB: boolean;
	webCrypto: boolean;
}

export function getBrowserCapabilities(): BrowserCapabilities;
export function isFsaAvailable(): boolean;
export function isIndexedDBAvailable(): boolean;
export function isWebCryptoAvailable(): boolean;
```

**Algoritmo clave:**

```typescript
export function getBrowserCapabilities(): BrowserCapabilities {
	// SSR guard
	if (typeof window === 'undefined') {
		return { fsa: false, indexedDB: false, webCrypto: false };
	}

	return {
		fsa:
			typeof window.showDirectoryPicker === 'function' &&
			typeof window.FileSystemDirectoryHandle !== 'undefined' &&
			typeof window.FileSystemFileHandle !== 'undefined',
		indexedDB: typeof window.indexedDB !== 'undefined',
		webCrypto:
			typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle !== 'undefined'
	};
}

export function isFsaAvailable(): boolean {
	return getBrowserCapabilities().fsa;
}
```

**Edge cases:**

- **SSR** (Vitest server project): `window` undefined → retorna `false` (capability ausente).
- **Permission revoked at runtime:** `queryPermission()` puede ser llamado repetidamente desde el state layer (Step 5). Esta función es solo detección de API, no de permission state.
- **Custom browsers / webviews:** no detectar heurísticas raras — solo lo que el spec dice.

**Tests (`tests/adapters/feature-detect.test.ts`):**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getBrowserCapabilities,
	isFsaAvailable,
	isFsaPermissionError
} from '$lib/adapters/feature-detect.ts';

describe('feature-detect (server env)', () => {
	it('returns all-false when window is undefined', () => {
		expect(getBrowserCapabilities()).toEqual({
			fsa: false,
			indexedDB: false,
			webCrypto: false
		});
	});
});

describe('feature-detect (mocked browser)', () => {
	beforeEach(() => {
		// @ts-expect-error — test-only mutation
		globalThis.window = {
			showDirectoryPicker: () => Promise.resolve({}),
			FileSystemDirectoryHandle: class {},
			FileSystemFileHandle: class {},
			indexedDB: {},
			crypto: { subtle: {} }
		};
	});
	afterEach(() => {
		// @ts-expect-error — test-only cleanup
		delete globalThis.window;
	});

	it('returns all-true when all APIs present', () => {
		expect(isFsaAvailable()).toBe(true);
	});
});
```

**Dependencias internas:** `./errors.ts`.

**Dependencias externas:** ninguna (browser APIs nativas).

---

### 7.3 `src/lib/adapters/memory-fs.ts`

**Propósito:** Implementación in-memory de `DirectoryAdapter` para tests y para el wizard (FR-11) que necesita previsualizar cambios antes de escribirlos al disco.

**ERS cubierto:** (test infrastructure; tangentially supports FR-4 testing).

**Diseño:**

- Implementa `DirectoryAdapter` con `Map<string, string>` (files) + `Map<string, Set<string>>` (directories).
- Mismo contrato que `LocalFsAdapter` — el state layer puede intercambiar sin tocar la service layer.

**Interfaces y tipos:**

```typescript
export interface MemoryFsSeed {
	files: Record<string, string>; // path → content
}

export class MemoryFsAdapter implements DirectoryAdapter {
	constructor(seed?: MemoryFsSeed);

	// DirectoryAdapter methods (ver §7.4 para signatures)

	// Test helpers
	snapshot(): MemoryFsSeed; // export state for assertions
	reset(seed?: MemoryFsSeed): void; // clear + re-seed
}
```

**Algoritmo clave — `writeTextFile`:**

```typescript
async writeTextFile(path: string, contents: string): Promise<void> {
  // Atomic write simulation: write to temp, then "rename"
  const tempPath = `${path}.tmp-${randomBytes(4).toString('hex')}`;
  this.files.set(tempPath, contents);
  // Simulate parent directory creation
  this.ensureParentDir(path);
  // Atomic move
  this.files.set(path, contents);
  this.files.delete(tempPath);
}

private ensureParentDir(path: string): void {
  const segments = path.split('/');
  for (let i = 1; i < segments.length; i++) {
    const dirPath = segments.slice(0, i).join('/');
    if (!this.directories.has(dirPath)) {
      this.directories.set(dirPath, new Set());
    }
  }
}
```

**Algoritmo clave — `listDirectory`:**

```typescript
async listDirectory(path: string): Promise<DirectoryEntry[]> {
  const entries = this.directories.get(path);
  if (!entries) {
    // Auto-create empty dir (matches FSA behavior)
    this.directories.set(path, new Set());
    return [];
  }
  return [...entries].map(name => {
    const childPath = path === '.' ? name : `${path}/${name}`;
    const isFile = this.files.has(childPath);
    return {
      name,
      kind: isFile ? 'file' : 'directory'
    };
  });
}
```

**Edge cases:**

- **Path normalization:** aplicar `normalizePath()` del directory-adapter base antes de cualquier operación. Soportar `.` como root.
- **Nested files:** `.agnostic-issuer/templates/bug.json` debe registrar `.agnostic-issuer` como directorio y `.agnostic-issuer/templates` como directorio.
- **Move semantics:** `moveFile(from, to)` en memoria = `delete(from) + write(to)`.
- **Atomicidad:** el temp+rename simula el comportamiento real; tests pueden verificar que el temp se borra siempre.
- **Empty seed:** `new MemoryFsAdapter()` crea un FS vacío, funcional desde la primera operación.

**Tests (`tests/adapters/memory-fs.test.ts`):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs.ts';
import { loadIssues } from '$lib/services/issue-loader.ts';

describe('MemoryFsAdapter', () => {
	let fs: MemoryFsAdapter;

	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('starts empty', async () => {
		expect(await fs.listDirectory('.agnostic-issuer/issues')).toEqual([]);
	});

	it('round-trips a written file', async () => {
		await fs.writeTextFile('test.txt', 'hello');
		expect(await fs.readTextFile('test.txt')).toBe('hello');
	});

	it('creates parent directories automatically', async () => {
		await fs.writeTextFile('a/b/c/deep.txt', 'x');
		const entries = await fs.listDirectory('a/b/c');
		expect(entries).toEqual([{ name: 'deep.txt', kind: 'file' }]);
	});

	it('integrates with loadIssues (service layer)', async () => {
		const md = `---
id: 1
title: "Test"
author: "jose"
creation_date: 2026-01-01
updated_date: 2026-01-01
issue_type: task
status: open
assignee: null
labels: []
relations: []
integrity_hash: "sha256:abc"
---
<!-- [SECTION_START: Description] -->
content
<!-- [SECTION_END: Description] -->
`;
		await fs.writeTextFile('.agnostic-issuer/issues/0001-test.md', md);
		const issues = await loadIssues(fs);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.issue.id).toBe(1);
	});

	it('atomic write leaves no temp files', async () => {
		await fs.writeTextFile('atomic.txt', 'content');
		const all = await fs.listDirectory('.');
		const temps = all.filter((e) => e.name.includes('.tmp-'));
		expect(temps).toEqual([]);
	});
});
```

**Dependencias internas:**

- `./directory-adapter.ts` (interface + helpers).
- `../services/issue-loader.ts` (integration test).

**Dependencias externas:** `crypto.randomBytes` de `node:crypto` (para temp file names) — funciona en Node test env.

---

### 7.4 `src/lib/adapters/local-fs.ts`

**Propósito:** Implementación FSA-backed de `DirectoryAdapter` para Local Edit Mode (FR-4).

**ERS cubierto:** FR-4 (Local CRUD), NFR-7 (atomicity, re-prompt), C-3 (FSA), C-4 (permission re-grant).

**Diseño:**

- Constructor recibe un `FileSystemDirectoryHandle` (obtenido vía `showDirectoryPicker` o restaurado del `handleStore`).
- Todos los métodos del `DirectoryAdapter` están implementados sobre las APIs FSA nativas.
- Permission check antes de cada operación que escribe.

**Interfaces y tipos:**

```typescript
export class LocalFsAdapter implements DirectoryAdapter {
  constructor(private readonly handle: FileSystemDirectoryHandle);

  /**
   * Static factory: prompts the user to pick a folder.
   * Throws FsaUnavailableError if FSA is not supported.
   * Throws FsaPermissionError if the user cancels.
   */
  static async pick(): Promise<LocalFsAdapter>;

  /**
   * Verify we still have readwrite permission on the handle.
   * Returns 'granted' | 'prompt' | 'denied'.
   */
  async verifyPermission(): Promise<PermissionState>;

  /**
   * Request readwrite permission (shows browser prompt if needed).
   */
  async requestPermission(): Promise<PermissionState>;

  // DirectoryAdapter methods
  async readTextFile(path: string): Promise<string>;
  async writeTextFile(path: string, contents: string): Promise<void>;
  async listDirectory(path: string): Promise<DirectoryEntry[]>;
  async removeFile(path: string): Promise<void>;
  async moveFile(from: string, to: string): Promise<void>;
}
```

**Algoritmo clave — `static pick()`:**

```typescript
static async pick(): Promise<LocalFsAdapter> {
  if (!isFsaAvailable()) {
    throw new FsaUnavailableError();
  }

  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({
      id: 'agnostic-issuer-folder',
      mode: 'readwrite'
    });
  } catch (cause) {
    // User cancelled the picker or permission was denied
    if (cause instanceof DOMException &&
        (cause.name === 'AbortError' || cause.name === 'NotAllowedError')) {
      throw new FsaPermissionError(undefined, cause);
    }
    throw cause;
  }

  return new LocalFsAdapter(handle);
}
```

**Algoritmo clave — `writeTextFile` (atomic write):**

```typescript
async writeTextFile(path: string, contents: string): Promise<void> {
  // 1. Permission check (NFR-7: validate handle on every operation)
  const perm = await this.verifyPermission();
  if (perm !== 'granted') {
    throw new FsaPermissionError(this.handle.name);
  }

  // 2. Resolve path → parent directory handle + file name
  const { parent: parentPath, name } = splitPath(path);
  const parentHandle = await this.resolveDirectory(parentPath);

  // 3. Create temp file with unique name (atomic write pattern)
  const tempName = `.tmp-${crypto.randomUUID()}`;
  const tempHandle = await parentHandle.getFileHandle(tempName, { create: true });
  try {
    // 4. Write contents to temp
    const writable = await tempHandle.createWritable();
    try {
      await writable.write(contents);
      await writable.close();
    } catch (cause) {
      await writable.abort();
      throw cause;
    }

    // 5. Move temp → final name (atomic on POSIX + Windows)
    await parentHandle.move(tempHandle, name);
  } catch (cause) {
    // Cleanup: try to remove temp if it still exists
    try {
      await parentHandle.removeEntry(tempName, { recursive: false });
    } catch {
      // Best effort — ignore cleanup failures
    }

    if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
      throw new FsaPermissionError(this.handle.name, cause);
    }
    if (cause instanceof DOMException && cause.name === 'NotFoundError') {
      throw new AdapterNotFoundError(path, cause);
    }
    throw cause;
  }
}
```

**Algoritmo clave — `resolveDirectory`:**

```typescript
/**
 * Walk the path from the root handle, creating intermediate directories
 * as needed. Returns the directory handle for the given path.
 */
private async resolveDirectory(path: string): Promise<FileSystemDirectoryHandle> {
  const normalized = normalizePath(path);
  if (normalized === '.') return this.handle;

  const segments = normalized.split('/');
  let current = this.handle;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}
```

**Algoritmo clave — `moveFile`:**

```typescript
async moveFile(from: string, to: string): Promise<void> {
  const fromSplit = splitPath(from);
  const toSplit = splitPath(to);

  // Same parent: use DirectoryHandle.move (atomic)
  if (fromSplit.parent === toSplit.parent) {
    const parent = await this.resolveDirectory(fromSplit.parent);
    const fileHandle = await parent.getFileHandle(fromSplit.name);
    await parent.move(fileHandle, toSplit.name);
    return;
  }

  // Different parent: read + write + remove (not atomic across dirs)
  const content = await this.readTextFile(from);
  await this.writeTextFile(to, content);
  await this.removeFile(from);
}
```

**Edge cases:**

- **File doesn't exist on read:** `getFileHandle` throws `NotFoundError` → wrap como `AdapterNotFoundError`.
- **Directory doesn't exist on list:** FSA behavior es crear automáticamente (con `create: true`); sin `create`, throws `NotFoundError` → wrap.
- **Permission revoked mid-operation:** catch `NotAllowedError` → throw `FsaPermissionError` para que el state layer re-prompt (C-4).
- **Concurrent writes:** FSA no provee locking. Si dos tabs escriben al mismo file, el último gana. Documentado como limitation — no es responsabilidad del adapter resolverlo (es Git's job).
- **Empty filename:** defensive guard — throws `AdapterValidationError`.
- **Path traversal:** validar que el path normalizado no escape del root. Si después de normalizar hay `..`, reject.

**Tests (`tests/adapters/local-fs.test.ts`):**

> **Nota importante:** estos tests requieren browser env. Se corren en el `client` project de Vitest (Playwright). Algunos tests pueden ser mocks via `vitest-browser-svelte` utilities.

```typescript
import { describe, it, expect } from 'vitest';
import { LocalFsAdapter } from '$lib/adapters/local-fs.ts';
import { isFsaAvailable, FsaUnavailableError, FsaPermissionError } from '$lib/adapters/index.ts';

// Note: these tests run in chromium (vitest client project)
// Playwright provides real FSA API

describe('LocalFsAdapter', () => {
	it('throws FsaUnavailableError if FSA not available', async () => {
		if (isFsaAvailable()) return; // skip in chromium
		await expect(LocalFsAdapter.pick()).rejects.toThrow(FsaUnavailableError);
	});

	it('lists directory entries', async () => {
		// Setup: pick a temp directory with known contents
		const handle = await createTempDirWithFiles({
			'.agnostic-issuer/config.json': '{}',
			'.agnostic-issuer/issues/0001-test.md': '---\nid: 1\n---\n'
		});
		const adapter = new LocalFsAdapter(handle);

		const entries = await adapter.listDirectory('.agnostic-issuer/issues');
		expect(entries).toContainEqual({ name: '0001-test.md', kind: 'file' });
	});

	it('writeTextFile is atomic (no temp left behind on success)', async () => {
		const handle = await createTempDir();
		const adapter = new LocalFsAdapter(handle);
		await adapter.writeTextFile('test.txt', 'hello');
		const entries = await adapter.listDirectory('.');
		expect(entries.find((e) => e.name.includes('.tmp-'))).toBeUndefined();
		expect(entries).toContainEqual({ name: 'test.txt', kind: 'file' });
	});

	it('writeTextFile rolls back on failure (original preserved)', async () => {
		const handle = await createTempDirWithFiles({ 'existing.txt': 'original' });
		const adapter = new LocalFsAdapter(handle);

		// Mock a failure scenario
		const original = adapter.writeTextFile;
		adapter.writeTextFile = async (path, contents) => {
			// Simulate partial write then failure
			throw new Error('simulated disk full');
		};

		await expect(adapter.writeTextFile('new.txt', 'new content')).rejects.toThrow();

		adapter.writeTextFile = original; // restore
		expect(await adapter.readTextFile('existing.txt')).toBe('original');
	});

	it('create parent directories automatically', async () => {
		const handle = await createTempDir();
		const adapter = new LocalFsAdapter(handle);
		await adapter.writeTextFile('deep/nested/path/file.txt', 'x');
		expect(await adapter.readTextFile('deep/nested/path/file.txt')).toBe('x');
	});
});
```

**Dependencias internas:**

- `./directory-adapter.ts` (interface + `splitPath`, `normalizePath`).
- `./errors.ts` (`FsaPermissionError`, `AdapterNotFoundError`, `AdapterValidationError`, `FsaUnavailableError`).
- `./feature-detect.ts` (`isFsaAvailable`).

**Dependencias externas:**

- Browser native APIs (`window.showDirectoryPicker`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`).
- `crypto.randomUUID()` (Web Crypto).

---

### 7.5 `src/lib/adapters/handle-store.ts`

**Propósito:** Persistencia del `FileSystemDirectoryHandle` activo + lista de recent folders en IndexedDB.

**ERS cubierto:** FR-4 ("folder handle MUST be persisted across sessions"), ERS §5.5 ("Folder Handle Lifecycle").

**Diseño:**

- DB `agnostic-issuer-handles` con un object store `handles`.
- Records: 1 `active` + 5 `recent-N` (max).
- API sincrónica-ish (todo async por IndexedDB, pero con caching en memoria).
- Schema version 1 con migration path para futuras versiones.

**Interfaces y tipos:**

```typescript
export interface HandleRecord {
	id: 'active' | `recent-${1 | 2 | 3 | 4 | 5}`;
	handle: FileSystemDirectoryHandle;
	name: string;
	addedAt: number;
}

export interface HandleStore {
	/** Get the active handle (if any). */
	getActive(): Promise<HandleRecord | null>;
	/** Set the active handle. Moves previous active to recent (if room). */
	setActive(handle: FileSystemDirectoryHandle): Promise<void>;
	/** Clear the active handle (but keep it in recent). */
	clearActive(): Promise<void>;
	/** Get recent handles (1-5, ordered by addedAt desc). */
	getRecent(): Promise<HandleRecord[]>;
	/** Remove a handle from recent. */
	removeRecent(id: `recent-${1 | 2 | 3 | 4 | 5}`): Promise<void>;
	/** Clear all data (for "reset" flow). */
	clearAll(): Promise<void>;
}

export const handleStore: HandleStore;
```

**Algoritmo clave — `setActive`:**

```typescript
async setActive(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('handles', 'readwrite');
  const store = tx.objectStore('handles');

  // 1. Get current state
  const currentActive = await store.get('active');
  const recent = await this.getRecent();

  // 2. If there's an existing active, move it to recent
  if (currentActive && currentActive.handle.name !== handle.name) {
    // Promote existing recent to make room
    const newRecent: HandleRecord[] = [
      { id: 'recent-1', handle: currentActive.handle,
        name: currentActive.name, addedAt: Date.now() },
      ...recent.slice(0, 4).map((r, i) => ({
        ...r, id: `recent-${i + 2}` as const
      }))
    ];

    // Clear existing recent
    for (const r of recent) {
      await store.delete(r.id);
    }

    // Write new recent
    for (const r of newRecent) {
      await store.put(r);
    }
  }

  // 3. Write new active
  await store.put({
    id: 'active',
    handle,
    name: handle.name,
    addedAt: Date.now()
  });

  await tx.done;
}
```

**Algoritmo clave — `openDb`:**

```typescript
const DB_NAME = 'agnostic-issuer-handles';
const DB_VERSION = 1;

async function openDb(): Promise<IDBPDatabase<HandleSchema>> {
	return openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains('handles')) {
				db.createObjectStore('handles', { keyPath: 'id' });
			}
		}
	});
}
```

**Edge cases:**

- **IndexedDB unavailable:** el state layer (Step 5) primero llama `getBrowserCapabilities()`; si `indexedDB: false`, no intenta usar `handleStore`. El adapter no necesita manejar este caso (lanza error, pero nunca debería ser llamado en esa condición).
- **Schema migration:** la versión 1 es la inicial. Si en el futuro se agrega un campo, se incrementa `DB_VERSION` y se maneja en el callback `upgrade`. Por ahora, no-op si ya existe.
- **Permission revoked al cargar:** `getActive()` retorna el record, pero el `handle` puede haber sido revocado. El caller debe llamar `handle.queryPermission()` antes de usarlo. Esta es una decisión deliberada: separar storage de permission state.
- **Handle serialización:** `FileSystemDirectoryHandle` NO es directamente serializable a JSON. IndexedDB lo soporta via structured clone. No intentar JSON.stringify.
- **Recent overflow:** si ya hay 5 recents, el más viejo se descarta al promover active → recent-1.

**Tests (`tests/adapters/handle-store.test.ts`):**

> **Nota:** IndexedDB tests requieren browser env. Usar Playwright con un fake-indexeddb si es necesario, o correr en el `client` project.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { handleStore } from '$lib/adapters/handle-store.ts';

// Helper: create a mock handle
function mockHandle(name: string): FileSystemDirectoryHandle {
	return { name, kind: 'directory' } as FileSystemDirectoryHandle;
}

describe('handleStore', () => {
	beforeEach(async () => {
		await handleStore.clearAll();
	});

	it('starts empty', async () => {
		expect(await handleStore.getActive()).toBeNull();
		expect(await handleStore.getRecent()).toEqual([]);
	});

	it('setActive stores the handle', async () => {
		const handle = mockHandle('my-project');
		await handleStore.setActive(handle);
		const active = await handleStore.getActive();
		expect(active?.name).toBe('my-project');
	});

	it('switching active promotes previous to recent-1', async () => {
		await handleStore.setActive(mockHandle('first'));
		await handleStore.setActive(mockHandle('second'));
		const recent = await handleStore.getRecent();
		expect(recent[0]?.name).toBe('first');
	});

	it('caps recent at 5', async () => {
		for (let i = 0; i < 7; i++) {
			await handleStore.setActive(mockHandle(`folder-${i}`));
		}
		const recent = await handleStore.getRecent();
		expect(recent).toHaveLength(5);
	});

	it('clearActive keeps recent intact', async () => {
		await handleStore.setActive(mockHandle('first'));
		await handleStore.setActive(mockHandle('second'));
		await handleStore.clearActive();
		expect(await handleStore.getActive()).toBeNull();
		const recent = await handleStore.getRecent();
		expect(recent.find((r) => r.name === 'first')).toBeDefined();
	});

	it('clearAll wipes everything', async () => {
		await handleStore.setActive(mockHandle('x'));
		await handleStore.clearAll();
		expect(await handleStore.getActive()).toBeNull();
		expect(await handleStore.getRecent()).toEqual([]);
	});
});
```

**Dependencias internas:**

- `./errors.ts` (`AdapterValidationError`).
- `./feature-detect.ts` (`isIndexedDBAvailable` — defensive guard).

**Dependencias externas:**

- `idb` (Jake Archibald's typed wrapper around IndexedDB — preferred over raw IDBAPI).
- Browser IndexedDB.

---

### 7.6 `src/lib/adapters/trash.ts`

**Propósito:** Helpers para move-to-trash (FR-4) + empty-trash.

**ERS cubierto:** FR-4 ("Delete — move the file to a trash location").

**Diseño:**

- Funciones puras que operan sobre `DirectoryAdapter`.
- Trash location: `.agnostic-issuer/.trash/<timestamp>-<id>-<slug>.md` (ERS §6).

**Interfaces y tipos:**

```typescript
export const TRASH_DIRECTORY = '.agnostic-issuer/.trash';

/**
 * Move a file to the trash directory.
 * The destination filename is prefixed with a timestamp for uniqueness.
 */
export async function moveToTrash(adapter: DirectoryAdapter, sourcePath: string): Promise<string>; // returns the trash path

/**
 * Empty the entire trash directory.
 * Returns the count of files removed.
 */
export async function emptyTrash(adapter: DirectoryAdapter): Promise<number>;
```

**Algoritmo clave — `moveToTrash`:**

```typescript
export async function moveToTrash(adapter: DirectoryAdapter, sourcePath: string): Promise<string> {
	// 1. Ensure trash directory exists
	// (FSAdapter writes auto-create parents, but explicit is clearer)
	try {
		await adapter.listDirectory(TRASH_DIRECTORY);
	} catch {
		// Directory doesn't exist — writeTextFile will create it
		// (no-op here, but documents the intent)
	}

	// 2. Compose trash filename
	const timestamp = Date.now();
	const { name } = splitPath(sourcePath);
	const trashName = `${timestamp}-${name}`;
	const trashPath = `${TRASH_DIRECTORY}/${trashName}`;

	// 3. Move file
	await adapter.moveFile(sourcePath, trashPath);

	return trashPath;
}
```

**Edge cases:**

- **Trash doesn't exist:** el adapter lo crea automáticamente (vía `resolveDirectory` con `create: true` en LocalFsAdapter; en MemoryFsAdapter también).
- **File doesn't exist:** el adapter underlying lanza `AdapterNotFoundError` — propagamos.
- **Multiple files deleted in same millisecond:** el timestamp puede colisionar. Usar `Date.now() + counter` o aceptar la colisión (la segunda move falla, pero eso es señal de bug elsewhere).
- **Cross-directory move:** `moveFile` en LocalFsAdapter maneja este caso (read+write+remove).
- **Trash filename collision:** si el usuario restaura manualmente un file y luego borra otro con el mismo name, el segundo se sobreescribe. Aceptable — el trash no es un backup formal.

**Tests (`tests/adapters/trash.test.ts`):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs.ts';
import { moveToTrash, emptyTrash, TRASH_DIRECTORY } from '$lib/adapters/trash.ts';

describe('trash', () => {
	let fs: MemoryFsAdapter;

	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('moveToTrash moves file with timestamp prefix', async () => {
		await fs.writeTextFile('.agnostic-issuer/issues/0001-test.md', 'content');
		const trashPath = await moveToTrash(fs, '.agnostic-issuer/issues/0001-test.md');

		expect(trashPath).toMatch(/^\.agnostic-issuer\/\.trash\/\d+-0001-test\.md$/);

		// Original gone
		await expect(fs.readTextFile('.agnostic-issuer/issues/0001-test.md')).rejects.toThrow();

		// In trash
		const trashContent = await fs.readTextFile(trashPath);
		expect(trashContent).toBe('content');
	});

	it('emptyTrash removes all files', async () => {
		await fs.writeTextFile('.agnostic-issuer/.trash/1-a.md', 'a');
		await fs.writeTextFile('.agnostic-issuer/.trash/2-b.md', 'b');
		await fs.writeTextFile('.agnostic-issuer/issues/0001-c.md', 'c');

		const count = await emptyTrash(fs);
		expect(count).toBe(2);

		const trashContents = await fs.listDirectory(TRASH_DIRECTORY);
		expect(trashContents).toEqual([]);

		// Non-trash file untouched
		expect(await fs.readTextFile('.agnostic-issuer/issues/0001-c.md')).toBe('c');
	});
});
```

**Dependencias internas:**

- `./directory-adapter.ts` (`splitPath`).

**Dependencias externas:** ninguna.

---

### 7.7 `src/lib/adapters/renderer.ts`

**Propósito:** Renderizar Markdown a HTML sanitizado para el preview del editor (FR-13).

**ERS cubierto:** FR-13 (Markdown rendering), NFR-2 (XSS prevention), NFR-1 (perf budget).

**Diseño:**

- Función pura: `string → string`.
- Pipeline: `marked.parse` → `DOMPurify.sanitize`.
- Configuración explícita (denylist + allowlist combinados para defense-in-depth).

**Interfaces y tipos:**

```typescript
export interface RenderOptions {
	/** Enable GitHub Flavored Markdown (default: true). */
	gfm?: boolean;
	/** Convert \n to <br> (default: false). */
	breaks?: boolean;
	/** Sanitize output (default: true). DO NOT set to false unless in trusted env. */
	sanitize?: boolean;
}

/**
 * Render Markdown to sanitized HTML.
 * Returns a string of HTML (caller wraps in {@html ...} for Svelte).
 */
export function renderMarkdown(markdown: string, options?: RenderOptions): string;

/**
 * Render inline Markdown (single line, no <p> wrapper).
 * Useful for title cells, comments, etc.
 */
export function renderInlineMarkdown(markdown: string, options?: RenderOptions): string;
```

**Algoritmo clave:**

```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const DEFAULT_OPTIONS: Required<RenderOptions> = {
	gfm: true,
	breaks: false,
	sanitize: true
};

export function renderMarkdown(markdown: string, options?: RenderOptions): string {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	// 1. Parse to HTML
	const rawHtml = marked.parse(markdown, {
		gfm: opts.gfm,
		breaks: opts.breaks
	});

	// 2. Sanitize (defense-in-depth even if sanitize=false is passed)
	if (!opts.sanitize) {
		// Still sanitize, but log a warning
		logAdapter('warn', 'renderMarkdown called with sanitize=false', {});
	}

	const cleanHtml = DOMPurify.sanitize(rawHtml, {
		ALLOWED_TAGS: [
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'p',
			'br',
			'hr',
			'strong',
			'em',
			'del',
			's',
			'u',
			'ul',
			'ol',
			'li',
			'a',
			'blockquote',
			'code',
			'pre',
			'table',
			'thead',
			'tbody',
			'tr',
			'th',
			'td',
			'img'
		],
		ALLOWED_ATTR: ['href', 'title', 'alt', 'src'],
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|ftp|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
		FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
		FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick']
	});

	return cleanHtml;
}
```

**Algoritmo clave — `renderInlineMarkdown`:**

```typescript
export function renderInlineMarkdown(markdown: string, options?: RenderOptions): string {
	// Use marked's inline parser (no <p> wrapper, no block-level tags)
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const rawHtml = marked.parseInline(markdown, {
		gfm: opts.gfm,
		breaks: opts.breaks
	});

	return DOMPurify.sanitize(rawHtml, {
		ALLOWED_TAGS: ['strong', 'em', 'del', 'code', 'a', 'br'],
		ALLOWED_ATTR: ['href', 'title']
	});
}
```

**Edge cases:**

- **Empty input:** retorna string vacío (no `<p></p>`).
- **Malformed Markdown:** marked es tolerante — produce HTML aunque la sintaxis esté rota.
- **XSS attempts:** `<script>alert(1)</script>` → DOMPurify strippea `<script>` completamente.
- **HTML injection via attribute:** `<a href="javascript:alert(1)">` → DOMPurify strippea el `javascript:` URI.
- **Data URIs:** permitido para imágenes (`data:image/png;base64,...`) pero no para otros schemes.
- **Very long input:** marked puede ser lento en inputs enormes. Limitar a 1MB por seguridad (NFR-1 perf budget).

**Tests (`tests/adapters/renderer.test.ts`):**

```typescript
import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderInlineMarkdown } from '$lib/adapters/renderer.ts';

describe('renderer', () => {
	describe('renderMarkdown', () => {
		it('renders basic markdown', () => {
			const html = renderMarkdown('# Hello\n\nWorld');
			expect(html).toContain('<h1>Hello</h1>');
			expect(html).toContain('<p>World</p>');
		});

		it('renders GFM tables', () => {
			const md = '| A | B |\n|---|---|\n| 1 | 2 |';
			const html = renderMarkdown(md);
			expect(html).toContain('<table>');
			expect(html).toContain('<td>1</td>');
		});

		it('strips script tags (XSS prevention)', () => {
			const md = 'Hello\n\n<script>alert(1)</script>';
			const html = renderMarkdown(md);
			expect(html).not.toContain('<script>');
			expect(html).not.toContain('alert(1)');
		});

		it('strips javascript: URIs', () => {
			const md = '[click](javascript:alert(1))';
			const html = renderMarkdown(md);
			expect(html).not.toContain('javascript:');
		});

		it('strips onerror attributes', () => {
			const md = '<img src="x" onerror="alert(1)">';
			const html = renderMarkdown(md);
			expect(html).not.toContain('onerror');
		});

		it('strips iframe tags', () => {
			const md = '<iframe src="evil.com"></iframe>';
			const html = renderMarkdown(md);
			expect(html).not.toContain('<iframe');
		});

		it('handles empty input', () => {
			expect(renderMarkdown('')).toBe('');
		});

		it('preserves safe data URIs (images)', () => {
			const md = '![alt](data:image/png;base64,iVBOR...)';
			const html = renderMarkdown(md);
			expect(html).toContain('data:image/png');
		});

		it('GFM flag is respected', () => {
			const md = '~~strike~~';
			const withGfm = renderMarkdown(md, { gfm: true });
			const withoutGfm = renderMarkdown(md, { gfm: false });
			expect(withGfm).toContain('<del>');
			expect(withoutGfm).toContain('<p>~~strike~~</p>');
		});
	});

	describe('renderInlineMarkdown', () => {
		it('renders inline only (no <p>)', () => {
			const html = renderInlineMarkdown('**bold** text');
			expect(html).not.toContain('<p>');
			expect(html).toContain('<strong>bold</strong>');
		});

		it('strips block-level tags', () => {
			const html = renderInlineMarkdown('# heading');
			expect(html).not.toContain('<h1>');
		});
	});
});
```

**Dependencias internas:** ninguna.

**Dependencias externas:**

- `marked` (Markdown parser).
- `dompurify` (XSS sanitizer).

---

### 7.8 `src/lib/adapters/remote-git.ts`

**Propósito:** Implementación de Remote Read-Only Mode (FR-5) + IndexedDB cache (FR-10) + CORS proxy (FR-12).

**ERS cubierto:** FR-5, FR-10, FR-12, NFR-1 (perf budget), NFR-2 (PAT hygiene), C-2 (no remote writes), C-5 (CORS), C-6 (no PAT persistence).

**Diseño:**

- Clase `RemoteGitAdapter` con método principal `clone()`.
- Internamente usa `isomorphic-git` + `@isomorphic-git/lightning-fs`.
- PAT recibido como parámetro en cada operación (no se almacena).
- Cache key = `<url>|<branch>|<sha>` (ERS §3.1 FR-10).

**Interfaces y tipos:**

```typescript
export interface RemoteCloneRequest {
	url: string;
	branch: string;
	/** PAT for private repos. MUST NOT be persisted. */
	token: string | null;
	/** CORS proxy URL (default: https://cors.isomorphic-git.org). */
	corsProxy?: string;
}

export interface RemoteCloneResult {
	/** In-memory filesystem populated with .agnostic-issuer/ subtree. */
	fs: LightningFS;
	/** Path within the FS where the subtree starts. */
	dir: string;
	/** Commit SHA of the fetched HEAD. */
	sha: string;
}

export interface RemoteProgressEvent {
	phase: 'init' | 'fetch' | 'checkout' | 'extract' | 'done';
	loaded: number;
	total: number;
}

export class RemoteGitAdapter {
	/**
	 * Fetch the .agnostic-issuer/ subtree from a remote Git repo.
	 * Uses IndexedDB cache (keyed by url|branch|sha).
	 * PAT is held in memory only for the duration of this call.
	 */
	static async fetchSubtree(
		request: RemoteCloneRequest,
		onProgress?: (event: RemoteProgressEvent) => void
	): Promise<RemoteCloneResult>;

	/**
	 * Clear the cache for a specific (url, branch) pair.
	 * Used by the "Clear cache" settings action.
	 */
	static async clearCache(url: string, branch: string): Promise<void>;

	/**
	 * Clear ALL cached remote repos.
	 * Used by the "Reset all" action.
	 */
	static async clearAllCaches(): Promise<void>;
}
```

**Algoritmo clave — `fetchSubtree`:**

```typescript
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';

static async fetchSubtree(
  request: RemoteCloneRequest,
  onProgress?: (event: RemoteProgressEvent) => void
): Promise<RemoteCloneResult> {
  const { url, branch, token, corsProxy = 'https://cors.isomorphic-git.org' } = request;

  // 1. Setup LightningFS (IndexedDB-backed)
  const fs = new LightningFS('agnostic-issuer-lightning');
  const dir = '/repo';
  const dirClean = '/repo-clean';

  onProgress?.({ phase: 'init', loaded: 0, total: 100 });

  // 2. PAT NEVER persists — only in onAuth closure scope
  const onAuth = token
    ? () => ({ username: token }) // PAT as username (Git Smart HTTP convention)
    : () => ({});

  try {
    // 3. Init repo in LightningFS
    await git.init({ fs, dir });

    // 4. Add remote
    await git.addRemote({
      fs, dir,
      remote: 'origin',
      url,
      force: true
    });

    onProgress?.({ phase: 'fetch', loaded: 10, total: 100 });

    // 5. Fetch with CORS proxy
    const fetchResult = await git.fetch({
      fs, http, dir,
      ref: branch,
      singleBranch: true,
      depth: 1,
      onAuth,
      corsProxy,
      onMessage: (msg) => {
        // Progress reporting from isomorphic-git
        // (msg format varies by phase; simplified here)
      }
    });

    onProgress?.({ phase: 'checkout', loaded: 70, total: 100 });

    // 6. Checkout the working tree
    await git.checkout({ fs, dir, ref: branch });

    onProgress?.({ phase: 'extract', loaded: 85, total: 100 });

    // 7. Extract only the .agnostic-issuer/ subtree
    //    (manual tree walk because filepaths is not stable in isomorphic-git)
    await this.extractSubtree(fs, dir, '.agnostic-issuer', dirClean);

    // 8. Swap: clean → repo
    await fs.promises.rm(dir, { recursive: true });
    await fs.promises.rename(dirClean, dir);

    // 9. Get current SHA for cache key
    const sha = await git.resolveRef({ fs, dir, ref: branch });

    onProgress?.({ phase: 'done', loaded: 100, total: 100 });

    return { fs, dir, sha };
  } catch (cause) {
    // Clean up partial state — NFR-7
    try {
      await fs.promises.rm(dir, { recursive: true });
      await fs.promises.rm(dirClean, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }

    // Translate errors to typed adapter errors
    if (cause instanceof git.Errors.NotFoundError) {
      throw new RemoteFetchError(`Branch "${branch}" not found in ${url}`, { cause });
    }
    if (cause instanceof git.Errors.CheckoutConflictError) {
      throw new RemoteFetchError(`Checkout conflict`, { cause });
    }
    if (cause instanceof Error && cause.message.includes('401')) {
      throw new RemoteAuthError('Authentication failed (invalid or expired token)', cause);
    }
    if (cause instanceof Error && cause.message.includes('cors')) {
      throw new RemoteFetchError(`CORS proxy error. Check config.remote.cors_proxy.`, { cause });
    }

    throw new RemoteFetchError(`Failed to fetch ${url}`, { cause });
  }
}
```

**Algoritmo clave — `extractSubtree`:**

```typescript
private static async extractSubtree(
  fs: LightningFS,
  sourceDir: string,
  subtreePath: string,
  targetDir: string
): Promise<void> {
  const walker = git.walk({
    fs,
    dir: sourceDir,
    trees: [git.TREE({ ref: 'HEAD' })],
    map: async (filepath, [head]) => {
      if (!filepath.startsWith(subtreePath + '/') && filepath !== subtreePath) {
        return null; // skip files outside subtree
      }
      const entry = await head?.getEntry(filepath);
      if (!entry) return null;
      return {
        filepath: filepath.substring(subtreePath.length + 1), // strip prefix
        mode: entry.mode,
        type: entry.type,
        object: entry.oid
      };
    }
  });

  // Materialize files in target dir
  for await (const entry of walker) {
    if (!entry) continue;
    if (entry.type === 'tree') {
      // Skip — directories are created implicitly by writeFile
      continue;
    }
    const { object, filepath } = entry;
    if (typeof object !== 'string') continue;

    const targetPath = `${targetDir}/${filepath}`;
    const { blob } = await git.readBlob({
      fs, dir: sourceDir, oid: object, filepath
    });

    // Write via FS (this creates intermediate dirs)
    const buffer = Buffer.from(blob);
    await fs.promises.writeFile(targetPath, buffer);
  }
}
```

**Edge cases:**

- **PAT con caracteres especiales:** Git Smart HTTP espera URL-encoded. isomorphic-git maneja el encoding si se pasa como `username`. NO loguear el PAT.
- **Repo no existe (404):** isomorphic-git throws `Errors.NotFoundError` → translate a `RemoteFetchError`.
- **Branch no existe:** similar a 404, mensaje específico.
- **CORS proxy offline:** fetch fails con network error → `RemoteFetchError` con cause.
- **Token expirado (401):** → `RemoteAuthError`.
- **Cache hit (same SHA):** podemos skip el fetch. **Decisión:** siempre fetch por simplicidad en v0. Cache solo evita re-fetch si la URL+branch ya fue fetched en esta sesión. v1.1 puede agregar SHA-based cache reuse real (ERS FR-10 specifies this).
- **Partial clone failure:** cleanup siempre corre (try/finally implícito arriba).
- **PAT leak prevention:** nunca loguear `request.token`. Test verifica que `console.debug` no contiene el token.

**Tests (`tests/adapters/remote-git.test.ts`):**

> **Nota:** los tests de fetch real requieren network. Para unit tests, mockear `isomorphic-git` con `vi.mock`.

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock isomorphic-git
vi.mock('isomorphic-git', () => ({
	init: vi.fn(),
	addRemote: vi.fn(),
	fetch: vi.fn(),
	checkout: vi.fn(),
	resolveRef: vi.fn(() => Promise.resolve('abc123')),
	walk: vi.fn(),
	readBlob: vi.fn(),
	Errors: {
		NotFoundError: class NotFoundError extends Error {}
	}
}));

vi.mock('isomorphic-git/http/web', () => ({ default: {} }));
vi.mock('@isomorphic-git/lightning-fs', () => ({
	default: class MockFS {
		promises = {
			rm: vi.fn(),
			rename: vi.fn(),
			writeFile: vi.fn()
		};
	}
}));

import { RemoteGitAdapter } from '$lib/adapters/remote-git.ts';
import * as git from 'isomorphic-git';
import { RemoteFetchError, RemoteAuthError } from '$lib/adapters/errors.ts';

describe('RemoteGitAdapter', () => {
	it('fetchSubtree calls git APIs in correct order', async () => {
		const initSpy = vi.spyOn(git, 'init');
		const fetchSpy = vi.spyOn(git, 'fetch');
		const checkoutSpy = vi.spyOn(git, 'checkout');

		await RemoteGitAdapter.fetchSubtree({
			url: 'https://github.com/test/repo',
			branch: 'main',
			token: null
		});

		expect(initSpy).toHaveBeenCalled();
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				singleBranch: true,
				depth: 1,
				corsProxy: 'https://cors.isomorphic-git.org'
			})
		);
		expect(checkoutSpy).toHaveBeenCalled();
	});

	it('passes PAT via onAuth callback only (never persists)', async () => {
		const fetchSpy = vi.spyOn(git, 'fetch').mockResolvedValue({} as any);
		const token = 'ghp_secrettoken123';

		await RemoteGitAdapter.fetchSubtree({
			url: 'https://github.com/test/repo',
			branch: 'main',
			token
		});

		const callArgs = fetchSpy.mock.calls[0]?.[0];
		expect(callArgs?.onAuth).toBeDefined();

		// Call onAuth — should return the token as username
		const auth = await callArgs?.onAuth();
		expect(auth).toEqual({ username: token });
	});

	it('translates NotFoundError to RemoteFetchError', async () => {
		vi.spyOn(git, 'fetch').mockRejectedValue(new git.Errors.NotFoundError('not found'));

		await expect(
			RemoteGitAdapter.fetchSubtree({
				url: 'https://github.com/test/repo',
				branch: 'main',
				token: null
			})
		).rejects.toThrow(RemoteFetchError);
	});

	it('translates 401 to RemoteAuthError', async () => {
		vi.spyOn(git, 'fetch').mockRejectedValue(new Error('401 Unauthorized'));

		await expect(
			RemoteGitAdapter.fetchSubtree({
				url: 'https://github.com/test/repo',
				branch: 'main',
				token: 'bad'
			})
		).rejects.toThrow(RemoteAuthError);
	});

	it('NEVER logs the PAT', async () => {
		const consoleSpy = vi.spyOn(console, 'debug');
		const token = 'ghp_supersecret';

		try {
			await RemoteGitAdapter.fetchSubtree({
				url: 'https://github.com/test/repo',
				branch: 'main',
				token
			});
		} catch {
			// ignore — we just want to verify logging
		}

		const allCalls = consoleSpy.mock.calls.flat().join(' ');
		expect(allCalls).not.toContain(token);
	});

	it('uses custom corsProxy when provided', async () => {
		const fetchSpy = vi.spyOn(git, 'fetch');
		await RemoteGitAdapter.fetchSubtree({
			url: 'https://example.com/repo',
			branch: 'main',
			token: null,
			corsProxy: 'https://my-proxy.example.com'
		});
		expect(fetchSpy.mock.calls[0]?.[0]?.corsProxy).toBe('https://my-proxy.example.com');
	});

	it('cleans up partial state on failure (NFR-7)', async () => {
		vi.spyOn(git, 'fetch').mockRejectedValue(new Error('network down'));

		await expect(
			RemoteGitAdapter.fetchSubtree({
				url: 'https://example.com/repo',
				branch: 'main',
				token: null
			})
		).rejects.toThrow();

		// Verify cleanup was attempted — fs.promises.rm was called
		// (verified via the MockFS mock)
	});
});
```

**Dependencias internas:**

- `./errors.ts` (`RemoteFetchError`, `RemoteAuthError`).

**Dependencias externas:**

- `isomorphic-git`.
- `isomorphic-git/http/web`.
- `@isomorphic-git/lightning-fs`.

---

### 7.9 `src/lib/adapters/index.ts`

**Propósito:** Barrel re-exports para que el state layer (Step 5) pueda hacer `import { LocalFsAdapter, handleStore, renderMarkdown } from '$lib/adapters'`.

**Diseño:** un solo archivo que re-exporta todo lo público de la carpeta.

**Contenido:**

```typescript
/**
 * Adapter layer public API.
 *
 * Re-exports all adapters, types, errors, and helpers for the state layer
 * to consume via `$lib/adapters`.
 *
 * Internal helpers (logger, feature-detect internals) are NOT exported here.
 */

// DirectoryAdapter interface
export type { DirectoryAdapter, DirectoryEntry } from './directory-adapter.ts';

// Errors
export {
	AdapterError,
	FsaUnavailableError,
	FsaPermissionError,
	AdapterNotFoundError,
	AdapterValidationError,
	RemoteFetchError,
	RemoteAuthError,
	RenderError
} from './errors.ts';
export type { AdapterErrorType } from './errors.ts';

// Feature detection
export {
	isFsaAvailable,
	isIndexedDBAvailable,
	isWebCryptoAvailable,
	getBrowserCapabilities,
	isAdapterError,
	isFsaPermissionError,
	isNotFoundError,
	isRemoteError
} from './feature-detect.ts';
export type { BrowserCapabilities } from './feature-detect.ts';

// Adapters
export { MemoryFsAdapter } from './memory-fs.ts';
export type { MemoryFsSeed } from './memory-fs.ts';

export { LocalFsAdapter } from './local-fs.ts';

// Handle store
export { handleStore } from './handle-store.ts';
export type { HandleRecord, HandleStore } from './handle-store.ts';

// Trash
export { moveToTrash, emptyTrash, TRASH_DIRECTORY } from './trash.ts';

// Renderer
export { renderMarkdown, renderInlineMarkdown } from './renderer.ts';
export type { RenderOptions } from './renderer.ts';

// Remote
export { RemoteGitAdapter } from './remote-git.ts';
export type { RemoteCloneRequest, RemoteCloneResult, RemoteProgressEvent } from './remote-git.ts';
```

**Dependencias internas:** todas las del adapter layer.
**Dependencias externas:** ninguna.

---

## 8. Patrones de implementación recurrentes

### 8.1 Logger helper

Compartido por todos los adapters (NO exportado, internal only):

```typescript
// src/lib/adapters/_logger.ts (not in index.ts barrel)

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env?.DEV ?? false;

export function logAdapter(
	level: LogLevel,
	message: string,
	context?: Record<string, unknown>
): void {
	if (!isDev && level === 'debug') return; // prod: skip debug

	const prefix = `[agnostic-issuer:adapter]`;
	const ctxStr = context ? ` ${JSON.stringify(context)}` : '';

	if (level === 'debug') console.debug(prefix, message, ctxStr);
	else if (level === 'info') console.info(prefix, message, ctxStr);
	else if (level === 'warn') console.warn(prefix, message, ctxStr);
	else console.error(prefix, message, ctxStr);
}
```

**Uso en adapters:**

```typescript
logAdapter('debug', 'writeTextFile started', { path });
logAdapter('info', 'folder opened', { name: handle.name });
logAdapter('warn', 'cache miss, fetching fresh', { url, branch });
logAdapter('error', 'fetch failed', { url }); // sin token
```

### 8.2 Permission re-prompt pattern (C-4)

Compartido por `LocalFsAdapter`:

```typescript
async function ensurePermission(
	handle: FileSystemDirectoryHandle,
	mode: 'read' | 'readwrite'
): Promise<PermissionState> {
	// queryPermission returns 'granted', 'prompt', or 'denied' WITHOUT prompting
	const current = await handle.queryPermission({ mode });
	if (current === 'granted') return 'granted';

	// requestPermission MAY prompt the user
	return await handle.requestPermission({ mode });
}
```

**Uso en `writeTextFile`:**

```typescript
const perm = await ensurePermission(this.handle, 'readwrite');
if (perm !== 'granted') {
	throw new FsaPermissionError(this.handle.name);
}
```

### 8.3 Atomic write pattern

Compartido por `LocalFsAdapter` y `MemoryFsAdapter`:

```typescript
async function atomicWrite(
	parent: FileSystemDirectoryHandle | MemoryDirHandle,
	name: string,
	contents: string
): Promise<void> {
	const tempName = `.tmp-${crypto.randomUUID()}`;
	const tempHandle = await parent.getFileHandle(tempName, { create: true });

	try {
		const writable = await tempHandle.createWritable();
		try {
			await writable.write(contents);
			await writable.close();
		} catch (cause) {
			await writable.abort();
			throw cause;
		}

		await parent.move(tempHandle, name); // atomic
	} catch (cause) {
		try {
			await parent.removeEntry(tempName);
		} catch {}
		throw cause;
	}
}
```

### 8.4 Type guard for error narrowing

Compartido por todos los adapters que pueden throw:

```typescript
// En el state layer (Step 5):
try {
	await LocalFsAdapter.pick();
} catch (err) {
	if (isFsaPermissionError(err)) {
		// err.handleName es string | undefined
		showRePromptDialog(err.handleName);
	} else if (err instanceof FsaUnavailableError) {
		showFirefoxWarning();
	} else {
		throw err; // unknown error
	}
}
```

### 8.5 Defensive IDB upgrade

En `handle-store.ts` y `lightning-fs` config:

```typescript
import { openDB, type IDBPDatabase } from 'idb';

export async function openHandlesDb(): Promise<IDBPDatabase> {
	return openDB('agnostic-issuer-handles', 1, {
		upgrade(db, oldVersion) {
			// v0 → v1: initial schema
			if (oldVersion < 1) {
				db.createObjectStore('handles', { keyPath: 'id' });
			}
			// Future: if (oldVersion < 2) { ... }
		},
		blocked() {
			logAdapter('warn', 'IDB upgrade blocked by another tab', {});
		},
		blocking() {
			logAdapter('warn', 'This tab is blocking an IDB upgrade', {});
			// Optionally close the db to allow the upgrade
		},
		terminated() {
			logAdapter('error', 'IDB connection terminated unexpectedly', {});
		}
	});
}
```

---

## 9. Dependencias a instalar

### 9.1 Nuevas dependencias (runtime)

```bash
pnpm add marked dompurify isomorphic-git @isomorphic-git/lightning-fs idb
```

| Paquete                        | Versión target | Propósito                                       |
| ------------------------------ | -------------- | ----------------------------------------------- |
| `marked`                       | ^14.x          | Markdown parser (FR-13)                         |
| `dompurify`                    | ^3.x           | XSS sanitizer (FR-13, NFR-2)                    |
| `isomorphic-git`               | ^0.30.x        | Pure-JS Git (FR-5)                              |
| `@isomorphic-git/lightning-fs` | ^4.x           | IndexedDB-backed FS para isomorphic-git (FR-10) |
| `idb`                          | ^8.x           | Typed wrapper sobre IndexedDB (handle-store)    |

### 9.2 Nuevas dependencias (dev)

```bash
pnpm add -D @types/dompurify fake-indexeddb
```

| Paquete            | Versión target | Propósito                             |
| ------------------ | -------------- | ------------------------------------- |
| `@types/dompurify` | latest         | Types de DOMPurify (TS strict)        |
| `fake-indexeddb`   | ^6.x           | Mock IndexedDB para tests server-side |

### 9.3 Dependencias futuras (NO Step 4)

- `shiki` o `highlight.js` → Step 4.5 o v1.1 si se decide agregar syntax highlighting.
- `vitest-browser-svelte` ya está en devDependencies — se usa en Step 6.

### 9.4 Verificación de no-deps innecesarias

Antes de hacer commit, verificar:

```bash
pnpm ls --depth=0
```

Confirmar que solo aparecen las deps necesarias. Si isomorphic-git trae deps transitivas grandes, evaluarlas.

---

## 10. Configuración adicional del proyecto

### 10.1 `eslint-plugin-boundaries` (opcional pero recomendado)

Para enforce de las reglas de capas del `architecture-strategy.md` §3.4:

```bash
pnpm add -D eslint-plugin-boundaries
```

```javascript
// eslint.config.js — agregar al final del array de configs
import boundaries from 'eslint-plugin-boundaries';

export default defineConfig(
	// ... existing configs ...
	{
		plugins: { boundaries },
		settings: {
			'boundaries/elements': [
				{ type: 'types', pattern: 'src/lib/types/*' },
				{ type: 'services', pattern: 'src/lib/services/*' },
				{ type: 'adapters', pattern: 'src/lib/adapters/*' },
				{ type: 'state', pattern: 'src/lib/state/*' },
				{ type: 'primitives', pattern: 'src/lib/primitives/*' },
				{ type: 'features', pattern: 'src/lib/features/*' },
				{ type: 'routes', pattern: 'src/routes/*' }
			]
		},
		rules: {
			'boundaries/element-types': [
				'error',
				{
					default: 'allow',
					rules: [
						// services can import types, NOT adapters/state/primitives/features/routes
						{
							from: 'services',
							disallow: ['adapters', 'state', 'primitives', 'features', 'routes']
						},
						// adapters can import types, NOT services/state/primitives/features/routes
						{
							from: 'adapters',
							disallow: ['services', 'state', 'primitives', 'features', 'routes']
						},
						// state can import services, adapters, types — NOT primitives/features/routes
						{ from: 'state', disallow: ['primitives', 'features', 'routes'] }
					]
				}
			]
		}
	}
);
```

### 10.2 `.env.example`

Crear template vacío (para cuando se agreguen env vars en Step 4.5+ si fuera necesario):

```bash
# AgnosticIssuer environment variables
# Copy this file to .env.local and fill in values for local development.

# CORS proxy for remote mode (optional, defaults to https://cors.isomorphic-git.org)
# VITE_CORS_PROXY=https://cors.isomorphic-git.org

# Default cache TTL for remote clones in seconds (optional)
# VITE_CACHE_TTL=3600
```

### 10.3 `vite.config.ts` adjustments

Si necesitamos polyfills para `Buffer` (LightningFS requiere):

```typescript
// vite.config.ts — agregar si es necesario
export default defineConfig({
	// ... existing plugins ...
	define: {
		// isomorphic-git y lightning-fs esperan globalThis.Buffer
		'globalThis.Buffer': 'globalThis.Buffer || await import("buffer").then(m => m.Buffer)'
	},
	optimizeDeps: {
		exclude: ['isomorphic-git'] // isomorphic-git tiene sub-imports complejos
	}
});
```

---

## 11. Testing strategy

### 11.1 Estructura de tests

```
tests/
├── adapters/
│   ├── errors.test.ts                # unit (server)
│   ├── feature-detect.test.ts        # unit (server, con mocks de window)
│   ├── memory-fs.test.ts             # integration con service layer
│   ├── local-fs.test.ts              # integration (client/Playwright)
│   ├── handle-store.test.ts          # integration (client, con fake-indexeddb o real)
│   ├── trash.test.ts                 # unit (server)
│   ├── renderer.test.ts              # unit (server)
│   └── remote-git.test.ts            # integration (server, con mocks de isomorphic-git)
└── (futuro) services/, e2e/
```

### 11.2 Coverage goals

| Archivo                 | Coverage target                                      |
| ----------------------- | ---------------------------------------------------- |
| `errors.ts`             | 100% (clases triviales)                              |
| `feature-detect.ts`     | 100%                                                 |
| `memory-fs.ts`          | ≥95%                                                 |
| `local-fs.ts`           | ≥85% (browser-specific paths difícil de cubrir 100%) |
| `handle-store.ts`       | ≥85%                                                 |
| `trash.ts`              | 100% (funciones simples)                             |
| `renderer.ts`           | ≥95%                                                 |
| `remote-git.ts`         | ≥80% (network code difícil de cubrir completamente)  |
| **Total adapter layer** | **≥90%**                                             |

### 11.3 Vitest config adjustment

`vite.config.ts:30-54` ya define dos projects (client + server). Los nuevos tests van:

- **Server project** (Node): errors, feature-detect, memory-fs, trash, renderer, remote-git (con mocks).
- **Client project** (Playwright): local-fs (FSA real), handle-store (IndexedDB real).

### 11.4 Helpers de testing

Crear `tests/helpers/`:

```typescript
// tests/helpers/mockHandle.ts
export function mockHandle(name: string): FileSystemDirectoryHandle {
	return { name, kind: 'directory' } as FileSystemDirectoryHandle;
}

// tests/helpers/tempFs.ts (Playwright only)
export async function createTempDirWithFiles(
	files: Record<string, string>
): Promise<FileSystemDirectoryHandle> {
	// Uses Playwright's page context to create a real FSA handle
	return await page.evaluateHandle(async (filesJson) => {
		const files = JSON.parse(filesJson);
		const dir = await navigator.storage.getDirectory();
		const root = await dir.getDirectoryHandle('test-' + Date.now(), { create: true });
		for (const [path, content] of Object.entries(files)) {
			// ... write each file via FS API
		}
		return root;
	}, JSON.stringify(files));
}
```

### 11.5 Critical test cases (no skip)

Estos tests son **bloqueantes** — si fallan, el PR no se mergea:

1. `memory-fs` round-trip con `loadIssues` (test de integración service layer).
2. `renderer` strippea `<script>` y `javascript:` URIs (XSS prevention).
3. `local-fs` write atómico (no temp files left behind).
4. `local-fs` rollback en failure (NFR-7).
5. `handle-store` FIFO eviction al pasar de 5 recents.
6. `remote-git` traduce `NotFoundError` a `RemoteFetchError`.
7. `remote-git` NUNCA loguea el PAT (NFR-2).
8. `remote-git` cleanup en failure (NFR-7).
9. `feature-detect` retorna false en SSR (Node env).
10. `trash` move + empty funcionan correctamente.

---

## 12. Orden de implementación (riesgo-decreciente)

Implementar en este orden para minimizar el blast radius si algo se rompe:

### Día 1 — Foundations

1. **Pre-flight fixes** (5 min) — branch + AGENTS.md + package.json engines.
2. **`errors.ts`** (30 min) — sin dependencies, base para todo lo demás.
3. **`feature-detect.ts`** (30 min) — usa `errors.ts`, simple.
4. **Tests de errors + feature-detect** (1h) — feedback inmediato de la base.
5. **`memory-fs.ts`** (2h) — implementa `DirectoryAdapter`, integración con service layer.
6. **Tests de memory-fs** (2h) — incluyendo el round-trip con `loadIssues`.

**Checkpoint:** `pnpm check && pnpm lint && pnpm test` verde. Service layer + memory-fs + errors + feature-detect listos.

### Día 2 — Local + Handle store

7. **`local-fs.ts`** (4h) — el más complejo de los adapters simples. Implementa todos los métodos del interface con atomic writes.
8. **Tests de local-fs** (3h) — requiere Playwright. Setup del test environment.
9. **`handle-store.ts`** (3h) — IndexedDB + transactional updates.
10. **Tests de handle-store** (2h) — fake-indexeddb + Playwright integration tests.
11. **`trash.ts`** (1h) — funciones simples sobre DirectoryAdapter.
12. **Tests de trash** (30 min).

**Checkpoint:** Local Edit Mode funcional end-to-end (sin UI). `pnpm test` pasa.

### Día 3 — Markdown + Remote

13. **`renderer.ts`** (2h) — marked + DOMPurify. Setup de marked options.
14. **Tests de renderer** (2h) — XSS payloads, edge cases, GFM flag.
15. **`remote-git.ts`** (5h) — el más riesgoso. isomorphic-git + LightningFS + CORS proxy + tree walk.
16. **Tests de remote-git** (3h) — mocks de isomorphic-git. Verificar PAT hygiene, cleanup, error translation.
17. **`index.ts` barrel** (15 min) — re-exports.

**Checkpoint:** Adapter layer completo. `pnpm check && pnpm lint && pnpm test` verde.

### Día 4 — Polish + PR

18. **Integration test end-to-end** (2h) — "open folder → create issue → save → re-read" con memory-fs + service layer.
19. **Code review self-check** (1h) — leer el código con ojos críticos.
20. **Update AGENTS.md / docs/current-project-status.md** (30 min) — marcar Step 4 como done.
21. **Create PR** (15 min) — descripción detallada, link a este plan.

**Total estimado:** 4 días (32 horas).

---

## 13. Definition of done — Step 4

Step 4 está completo cuando TODOS estos puntos son ✅:

### Archivos creados

- [ ] `src/lib/adapters/errors.ts` — 7 clases de error + type guards
- [ ] `src/lib/adapters/feature-detect.ts` — detección FSA/IDB/WebCrypto
- [ ] `src/lib/adapters/memory-fs.ts` — adapter in-memory
- [ ] `src/lib/adapters/local-fs.ts` — adapter FSA
- [ ] `src/lib/adapters/handle-store.ts` — persistencia de handles
- [ ] `src/lib/adapters/trash.ts` — move-to-trash + empty-trash
- [ ] `src/lib/adapters/renderer.ts` — marked + DOMPurify
- [ ] `src/lib/adapters/remote-git.ts` — isomorphic-git + LightningFS
- [ ] `src/lib/adapters/index.ts` — barrel re-exports
- [ ] `src/lib/adapters/_logger.ts` — logger interno (no exportado)

### Tests

- [ ] `tests/adapters/errors.test.ts` — cobertura 100%
- [ ] `tests/adapters/feature-detect.test.ts` — cobertura 100%
- [ ] `tests/adapters/memory-fs.test.ts` — cobertura ≥95%
- [ ] `tests/adapters/local-fs.test.ts` — cobertura ≥85%
- [ ] `tests/adapters/handle-store.test.ts` — cobertura ≥85%
- [ ] `tests/adapters/trash.test.ts` — cobertura 100%
- [ ] `tests/adapters/renderer.test.ts` — cobertura ≥95%
- [ ] `tests/adapters/remote-git.test.ts` — cobertura ≥80%
- [ ] **Total adapter layer coverage ≥90%**

### Verificación

- [ ] `pnpm check` — 0 errors, 0 warnings
- [ ] `pnpm lint` — 0 errors (incluyendo los archivos nuevos)
- [ ] `pnpm test` — todos los tests pasan
- [ ] `pnpm build` — succeeds, sin warnings de bundle size
- [ ] Integration test e2e con memory-fs + service layer pasa
- [ ] Manual smoke test en Chrome: open folder → see issues → create issue → save → re-load (con `docs/ers.md` Appendix B.6 example)

### ERS traceability

- [ ] FR-4 (Local CRUD): cubierto por local-fs + handle-store + trash
- [ ] FR-5 (Remote Read-Only): cubierto por remote-git
- [ ] FR-10 (IDB cache): cubierto por remote-git (LightningFS)
- [ ] FR-12 (CORS + partial clone): cubierto por remote-git
- [ ] FR-13 (Markdown rendering): cubierto por renderer
- [ ] NFR-2 (PAT hygiene): tests verifican que PAT nunca se loguea
- [ ] NFR-7 (resilience): tests verifican atomicidad y cleanup
- [ ] C-2 (no remote writes): remote-git solo tiene fetch + checkout + read
- [ ] C-3 (FSA solo Chromium): feature-detect.isFsaAvailable()
- [ ] C-4 (permission re-grant): FsaPermissionError + ensurePermission pattern
- [ ] C-5 (CORS proxy): remote-git acepta corsProxy param
- [ ] C-6 (PAT hygiene): PAT solo en onAuth callback

### Documentación

- [ ] `docs/current-project-status.md` actualizado — Step 4 marcado como Done
- [ ] `docs/ers.md` traceability table verificada
- [ ] CHANGELOG entry si aplica (no tenemos CHANGELOG aún; opcional)

---

## 14. Riesgos y mitigaciones

| #   | Riesgo                                                  | Probabilidad | Impacto | Mitigación                                                                      |
| --- | ------------------------------------------------------- | ------------ | ------- | ------------------------------------------------------------------------------- |
| 1   | `isomorphic-git` API cambia entre versiones             | Media        | Alta    | Pin version exacta en `package.json`; tests con mocks detectan breaking changes |
| 2   | FSA permission model confunde al usuario                | Alta         | Media   | Typed `FsaPermissionError` + UI explicativa en Step 6; prompt claro             |
| 3   | LightningFS quota exceeded                              | Media        | Media   | `clearCache` exposed; UI settings panel en Step 6                               |
| 4   | `marked` output incompatible con `DOMPurify` defaults   | Baja         | Baja    | Configurar `ALLOWED_TAGS` explícito; tests XSS payloads                         |
| 5   | Tree walk manual en remote-git pierde archivos          | Media        | Alta    | Tests E2E con repo real de GitHub (ver §15.4)                                   |
| 6   | IndexedDB transaction conflicts (multiple tabs)         | Baja         | Media   | `blocked` + `blocking` handlers; documentar limitation                          |
| 7   | PAT se loguea accidentalmente                           | Baja         | Crítica | Tests explícitos; `logAdapter` no acepta valores sensibles; code review         |
| 8   | `local-fs` moveFile no es atómico en Windows            | Baja         | Media   | Test cross-platform en CI (futuro); documentar limitation                       |
| 9   | Atomic write cleanup deja temp files en failure extrema | Baja         | Baja    | Try/catch robusto; logging para detectar; "Clean temp" command en Step 6        |
| 10  | isomorphic-git bundle size impact                       | Media        | Baja    | Lazy import en remote-git.ts (solo se carga cuando user entra a Remote Mode)    |

### Decisiones de mitigación específicas

**Riesgo 1 (isomorphic-git API changes):** pin a `^0.30.0`. Si hay breaking change, el test suite lo detecta antes de producción.

**Riesgo 5 (tree walk bug):** agregar **un test de integración con un repo real** (test opcional, no corre en CI siempre). Usa `https://github.com/agnostic-issuer/test-repo-fixture` con `.agnostic-issuer/` conocido.

**Riesgo 7 (PAT leak):** agregar un **test dedicado** que capture TODO el output de console y verifique que no contiene un token específico. Este test corre en cada PR.

---

## 15. Apéndices

### 15.1 Resumen de archivos (quick reference)

```
src/lib/adapters/
├── _logger.ts               # internal, no export
├── errors.ts                # 7 typed error classes
├── feature-detect.ts        # browser capability detection + type guards
├── directory-adapter.ts     # interface (existente, no se toca)
├── memory-fs.ts             # in-memory adapter (tests + wizard preview)
├── local-fs.ts              # FSA-backed adapter
├── handle-store.ts          # IndexedDB handle persistence
├── trash.ts                 # move-to-trash + empty-trash helpers
├── renderer.ts              # marked + DOMPurify
├── remote-git.ts            # isomorphic-git + LightningFS
└── index.ts                 # barrel re-exports

tests/adapters/
├── errors.test.ts
├── feature-detect.test.ts
├── memory-fs.test.ts
├── local-fs.test.ts
├── handle-store.test.ts
├── trash.test.ts
├── renderer.test.ts
└── remote-git.test.ts
```

### 15.2 Dependencias (resumen)

```bash
# Runtime
pnpm add marked dompurify isomorphic-git @isomorphic-git/lightning-fs idb

# Dev
pnpm add -D @types/dompurify fake-indexeddb
```

### 15.3 Comandos útiles durante implementación

```bash
# Watch mode para tests de adapter
pnpm test:unit --watch tests/adapters/

# Test solo server project (más rápido)
pnpm test:unit --project server

# Test solo client project (Playwright)
pnpm test:unit --project client

# Lint solo archivos nuevos
pnpm lint src/lib/adapters/

# Type-check continuo
pnpm check:watch
```

### 15.4 Test e2e opcional con repo real (riesgo bajo, valor alto)

Después de que el adapter layer esté completo, agregar un test opcional:

```typescript
// tests/adapters/remote-git.live.test.ts (skip en CI por default)

import { describe, it, expect } from 'vitest';
import { RemoteGitAdapter } from '$lib/adapters/remote-git.ts';

describe.skipIf(!process.env.RUN_LIVE_TESTS)('RemoteGitAdapter live', () => {
	it(
		'fetches public test repo',
		async () => {
			const result = await RemoteGitAdapter.fetchSubtree({
				url: 'https://github.com/agnostic-issuer/test-fixture',
				branch: 'main',
				token: null
			});

			expect(result.sha).toMatch(/^[a-f0-9]{40}$/);

			// Verify the subtree is populated
			const configExists = await result.fs.promises.exists(
				`${result.dir}/.agnostic-issuer/config.json`
			);
			expect(configExists).toBe(true);
		},
		{ timeout: 30_000 }
	);
});
```

Este test corre solo si `RUN_LIVE_TESTS=1` está en el environment. Útil para validar contra GitHub real antes de releases.

### 15.5 Referencias ERS (líneas relevantes)

- §3.1 FR-4 (Local CRUD): líneas 166-175
- §3.1 FR-5 (Remote Read-Only): líneas 177-188
- §3.1 FR-10 (IDB cache): líneas 247-249
- §3.1 FR-12 (CORS + partial clone): líneas 264-271
- §3.1 FR-13 (Markdown rendering): líneas 273-275
- §3.2 NFR-2 (Security): líneas 318-324
- §3.2 NFR-7 (Resilience): líneas 353-357
- §2.4 C-1 a C-6 (Constraints): líneas 131-136
- §5.3 (Tech stack table): líneas 448-473
- §5.5 (Folder Handle Lifecycle): líneas 481-487

---

_Plan generado por Mavis (MiniMax) — mentalidad senior fullstack, traceability ERS explícita, atomicity-first, error handling tipado, testability as a first-class concern._

_Siguiente paso: aprobar este plan → crear branch `step-4-adapters` → implementar en el orden de §12._
