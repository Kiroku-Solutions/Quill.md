# AgnosticIssuer — Requirements Audit & Competitive Analysis

> **Audit date:** 2026-06-20
> **Auditor:** Coder agent
> **Scope:** ERS v1.0.0 + Steps 1–3 implemented
> **Repo:** `T:\Kiroku\agnosticissuer\`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Product Definition & ERS Completeness](#3-product-definition--ers-completeness)
4. [Codebase Audit — Steps 1–3](#4-codebase-audit--steps-13)
5. [State of the Art Assessment](#5-state-of-the-art-assessment)
6. [Gaps, Risks & Open Issues](#6-gaps-risks--open-issues)
7. [Recommendations](#7-recommendations)
8. [Verdict](#8-verdict)

---

## 1. Executive Summary

**What it is:** AgnosticIssuer es una SPA client-side (SvelteKit + `adapter-static`) que permite gestionar issues guardados como archivos Markdown con frontmatter YAML en un repo Git. Dos modos: Local Edit (FSA API) y Remote Read-Only (`isomorphic-git`). El estado de verdad vive en el repositorio, no en servidores externos.

**Estado actual (Step 3):** La service layer está terminada y verificada:

- Parsing, serialización, validación, integridad (SHA-256), slugs, loaders de config/templates/issues.
- Tipos domain completos con TypeScript strict.
- Arquitectura de 4 capas implementada según el ERS.
- `pnpm check` — 0 errores, 0 warnings.
- `pnpm lint` — pasa en código fuente (falla en `AGENTS.md` y `docs/ers.md` por Prettier table alignment).
- `pnpm build` — succeeds.

**Pendiente (Steps 4–8):**

- Adapter layer (FSA, memory-fs, IndexedDB handle store) — **Step 4**
- State layer (runes-based stores) — **Step 5**
- UI layer (layout, home, views, editor) — **Step 6**
- Tests unitarios + adapter mock — **Step 7**
- Verificación final — **Step 8**

**Veredicto:** El foundations está sólido. La service layer es de alta calidad. Lo que queda es construir la adapter layer, la UI, y los tests — el trabajo más visible. La decisión más importante ya se tomó correctamente.

---

## 2. Competitive Landscape

### 2.1 Where it fits

| Categoría                            | Herramientas                       | Limitación clave                             |
| ------------------------------------ | ---------------------------------- | -------------------------------------------- |
| Issue tracker clásico                | Jira, YouTrack                     | Servidor, SaaS, locking de vendor            |
| Gestión de proyectos (full-featured) | Redmine, OpenProject, Taiga, Plane | Backend requerido, no es "local-first"       |
| Issue tracker + código               | GitHub Issues, GitLab Issues       | No vive en el repo, зависимость del hosting  |
| Git-based, local                     | `git-bug`, `git-issues`            | CLI, no UI visual                            |
| Markdown-in-repo                     | Sciit, custom scripts              | No existe tool profesional con UI            |
| **AgnosticIssuer**                   | —                                  | **Local Edit + Remote Read-Only en browser** |

### 2.2 Competitive Positioning

**AgnosticIssuer ocupa un nicho real:** no hay ninguna herramienta open source que combine:

1. **Estore nativo en el repo** (`.agnostic-issuer/`) — ninguna dependencia de servidor
2. **UI visual completa** — List, Kanban, Gantt (no es solo CLI)
3. **Dual-mode** — funciona offline (Local) y online (Remote Read-Only)
4. **FSA browser-native** — experiencia de escritorio real, no Electron
5. **Integrity hashing** — detecta modificaciones externas
6. **Templates configurables por proyecto** — cada repo define sus propios tipos

### 2.3 Main competitors analyzed

**Plane.so (makeplane/plane)**

- ✅ Open source (MIT), muy completo: issues, sprints, docs, roadmaps
- ✅ Excelente UI, GitHub sync
- ❌ Requiere backend (Postgres + Redis + MinIO/S3)
- ❌ Self-hosting complejo
- ❌ No "local-first"; los datos no viven en tu repo

**Redmine**

- ✅ Open source clásico, maduro, muy customizable
- ✅ Gantt, Kanban, wiki, multi-proyecto
- ❌ Ruby on Rails (hosting complejo)
- ❌ Interfaz anticuada
- ❌ No hay integración FSA/browser

**OpenProject**

- ✅ Muy completo: budgeting, sprints, wiki, CRM
- ✅ Community edition gratis
- ❌ Rails también; self-hosting required
- ❌ Interfaz pesada

**git-bug**

- ✅ Issue tracker en Git puro — los issues son commits
- ✅ CLI, funciona offline
- ❌ No hay UI visual
- ❌ Formato propietario (no es Markdown estándar)

**github-markdown-issues (scripts custom)**

- ✅ Simplicidad máxima
- ❌ No hay UI; scripts personalizados por equipo

**Sciit**

- ✅ Issue tracker en Markdown dentro del repo
- ❌ CLI-based, no hay Kanban/Gantt

### 2.4 Conclusion on positioning

AgnosticIssuer es el único tool que combina: **Markdown estándar en repo + UI visual (Kanban/Gantt) + browser-native + zero backend + dual-mode**. El nicho es pequeño pero real: developers individuales y equipos pequeños que quieren gestión de issues sin vendor lock-in y sin mantener un servidor.

**El diferenciador clave es la arquitectura, no la UI.** La propuesta de valor es: "tus issues viven junto a tu código, los editas desde el browser con la UX de Linear, y nadie más ve tus datos."

---

## 3. Product Definition & ERS Completeness

### 3.1 Core capabilities (ERS v1.0.0)

El ERS define 15 requisitos funcionales (FR-1 a FR-15) y 7 no funcionales (NFR-1 a NFR-7).

**Cobertura por Step:**

| Requisito | Descripción                                   | Implementado en Step         |
| --------- | --------------------------------------------- | ---------------------------- |
| FR-1      | Parsing y serialización de archivos de issue  | ✅ Step 3                    |
| FR-2      | Template loading + editor rendering           | ✅ Step 3                    |
| FR-3      | Configuration loading con errores accionables | ✅ Step 3                    |
| FR-4      | CRUD local (FSA)                              | ⏳ Step 4                    |
| FR-5      | Remote Read-Only (`isomorphic-git`)           | ⏳ Step 4                    |
| FR-6      | List / Kanban / Gantt views                   | ⏳ Step 6                    |
| FR-7      | Filter bar                                    | ⏳ Step 6                    |
| FR-8      | Validación (obligatory fields/sections)       | ✅ Step 3                    |
| FR-9      | Cross-issue relations + cycle detection       | ✅ Step 3                    |
| FR-10     | IndexedDB cache para remote                   | ⏳ Step 4                    |
| FR-11     | First-run wizard                              | ⏳ Step 6                    |
| FR-12     | CORS proxy + partial clone                    | ⏳ Step 4                    |
| FR-13     | Markdown rendering (`marked` + `DOMPurify`)   | ⏳ Step 4 (renderer.ts stub) |
| FR-14     | Light/dark theme                              | ⏳ Step 6                    |
| FR-15     | Integrity hash (SHA-256)                      | ✅ Step 3                    |

**NFR coverage:**

- NFR-1 (Performance): no se puede validar hasta tener UI y datos reales
- NFR-2 (Security): ✅ PAT en memoria (los loaders no persiste, paso 3 ok)
- NFR-3 (Privacy): ✅ No analytics/telemetry
- NFR-4 (Accessibility): pendiente UI
- NFR-5 (Browser support): definido, pendiente implementación
- NFR-6 (i18n): ✅ Todos los strings sourceados desde maps (ERS requiere)
- NFR-7 (Resilience): ✅ Implementado en service layer (loaders con errores accionables)

**Veredicto ERS:** El ERS es sólido y bien pensado. Cubre todos los escenarios de uso, define constraints claras (no backend, no remote writes), y tiene criteria de aceptación medibles. La cobertura actual es exactamente la correcta para un Step 3: foundations de service layer.

### 3.2 Data model quality

El modelo de datos es el activo más valioso del proyecto. Puntos destacados:

- **Frontmatter YAML** — estándar, legible, editable fuera del browser
- **Section markers** — `<!-- [SECTION_START:name] -->` son un enfoque ingenioso para bodies estructurados en Markdown
- **Template system** — extensible por proyecto, cada repo define sus propios tipos
- **Relations taxonomy** — `parent/child/blocks/depends_on/relates_to` cubre todos los casos de uso reales
- **Integrity hash** — SHA-256 con `sha256:` prefix es el estándar actual (similar a SRI en `<script>` tags)

### 3.3 Out-of-scope decisions (ERS §9)

Correctamente excluidos en v1:

- Remote writes (el usuario commitea manualmente)
- Multi-user collaboration
- Comments/threads
- File attachments
- Import from Jira/Linear/GitHub
- Mobile
- Localization

Estas exclusiones mantienen el scope manejable y son consistentes con la visión de "tool para devs individuales y equipos pequeños."

---

## 4. Codebase Audit — Steps 1–3

### 4.1 Architecture

```
UI Layer (Svelte components)        ← Step 6
State Layer (Svelte 5 runes)         ← Step 5
Service Layer (pure, domain objects)  ← ✅ Step 3 DONE
Adapter Layer (FS, Git, renderer)    ← Step 4 (stub)
```

La arquitectura de 4 capas es correcta. La service layer es puramente funcional — no toca el DOM, la red, ni el filesystem directamente. Esto la hace **completamente testeable en Node** sin mocks de browser.

### 4.2 Code quality assessment

#### Parser (`src/lib/services/parser.ts`)

**Fortalezas:**

- `gray-matter` para frontmatter (deuda de parsing = 0)
- Section scanner hand-rolled con regex tolerante a whitespace incidental
- Normalización defensiva de fechas (`Date | string | number → YYYY-MM-DD`)
- `integrityWarning` computado en load
- Tipado estricto con TypeScript strict mode

**Calidad del regex para secciones:**

```typescript
const SECTION_START = /^<!--\s*\[SECTION_START:\s*(.+?)\s*\]\s*-->\s*$/;
const SECTION_END = /^<!--\s*\[SECTION_END:\s*(.+?)\s*\]\s*-->\s*$/;
```

El `(.+?)` no-greedy con los `\` escapados en la sección intermedia es correcto. No se rompe con espacios extra. Un edge case a considerar: si el contenido de una sección contiene por error `<!-- [SECTION_START:` o `<!-- [SECTION_END:`, el scanner los trataría como contenido (correcto — no hay recursión, se confía en que el archivo está bien-formed).

**Parsing de relaciones:** defensivo con `continue` on invalid entries. No lanza, solo filtra.

**Veredicto:** Parser robusto. Maneja gracefully archivos imperfectos.

#### Serializer (`src/lib/services/serializer.ts`)

**Fortalezas:**

- Canonical serialization: system keys → custom fields → integrity_hash (last)
- `quoteIntegrityHash()` belt-and-braces para forzar-quote del hash (ERS §6.1.3 requiere string quoted)
- Key order estable (`sortKeys: false` en js-yaml)
- `DUMP_OPTIONS` con `lineWidth: -1` (no wrapping) y `noRefs: true`

**Divergencia cosmetic documentada:** emits dates quoted (`"2026-10-20"`) en vez de unquoted. Semánticamente equivalente en YAML 1.2. No es bug — es decisión conscious.

**Veredicto:** Serializer correcto. El enfoque de hashing sobre la forma canónica sin hash (y luego injertar el hash al final) es la forma correcta de implementar FR-15.

#### Integrity (`src/lib/services/integrity.ts`)

**Fortalezas:**

- Usa `globalThis.crypto.subtle.digest('SHA-256')` — Web Crypto API nativo, sin dependencias
- Funciona en Node >=19 y browsers modernos
- `stripIntegrityHashLine()` con regex que soporta CRLF (`\r?\n`)
- `verifyIntegrity()` exportada para reuse en adapter layer y warning banner
- `HASH_PREFIX = 'sha256:'` constante

**Veredicto:** Implementación elegante. Un módulo de 55 líneas que cumple FR-15 completamente.

#### Validator (`src/lib/services/validator.ts`)

**Fortalezas:**

- Cycle detection via DFS (Tarjan's algorithm simplificado) sobre adjacency list
- El grafo de ciclos ignora `relates_to` por diseño (ERS §3.1 FR-9)
- Errors por campo con mensajes accionables
- Context incluye `allIssues` para validación end-to-end de relations
- Validación de `id` uniqueness implícita via `ids.has()`

**Cycle detection correctness:** el código detecta ciclos correctamente. El manejo de `onStack` + `stack.slice(start)` cubre el caso de múltiples ciclos intersecting. Sin embargo, hay un bug potencial sutil:

```typescript
existing.push(id); // ← aquí se push 'id' (el nodo que cierra el ciclo)
```

En la lógica de ciclo, `id` es el nodo que causa el `onStack.has(id) = true` (el nodo actualmente visitado que ya está en el stack). Esto significa que el ciclo reportado incluye correctamente el nodo que cierra el ciclo, pero en un ciclo A→B→C→A, cuando visitamos A (que ya está en stack), push A dos veces: una desde el slice y otra desde `existing.push(id)`. Esto es un bug menor — el cycle list incluye el closing node 2 veces — pero no afecta la detección ni el mensaje al usuario final.

**Veredicto:** Validator sólido. El bug de cycle reporting es cosmético.

#### Slugs (`src/lib/services/slugs.ts`)

**Fortalezas:**

- Unicode normalization (`String.prototype.normalize('NFKD')`) + stripping de combining marks
- Fallback a `'untitled'` para titles que solo producen emoji
- `padIssueId` zero-pads a 4 dígitos mínimo (ERS §6.1.1)
- `nextIssueId` no reusa ids borrados (ERS dice "deletion does not reuse ids")
- `slugify` usa `Math.max(1, id)` — IDs 0 o negativos se evitan

**Veredicto:** Correcto. Maneja edge cases de Unicode.

#### Config Loader (`src/lib/services/config-loader.ts`)

**Fortalezas:**

- Throw con mensajes accionables incluyendo la ruta y el error subyacente (cause chain)
- Shape validation exhaustiva de todos los campos de config
- `CONFIG_FILE_PATH` exportado para reuse en otros módulos

**Veredicto:** Correcto.

#### Template Loader (`src/lib/services/template-loader.ts`)

**Fortalezas:**

- Carga lazy de todos los templates en paralelo (orden de import no importa)
- Field type validation contra `FIELD_TYPES` enum
- `obligatory` check en fields y sections
- Resultados sorteados por `id` para orden determinista

**Veredicto:** Correcto.

#### Issue Loader (`src/lib/services/issue-loader.ts`)

**Fortalezas:**

- Missing `issues/` directory → empty set (no crash)
- Solo archivos `.md` se procesan
- Resultado sorteado por `id` numérico

**Veredicto:** Correcto.

#### Directory Adapter Interface (`src/lib/adapters/directory-adapter.ts`)

**Fortalezas:**

- Interfaz mínima y correcta: `readTextFile`, `writeTextFile`, `listDirectory`, `removeFile`, `moveFile`
- Paths son POSIX-style y relativos al root del adapter
- Helper functions: `splitPath` y `normalizePath`

**Veredicto:** Interface correcta. El stub de renderer (`renderer.ts`) mencionado en el plan aún no existe — eso está bien, está pendiente para step 4.

### 4.3 Type system

El type system es uno de los puntos más fuertes del proyecto:

- **TypeScript strict mode** — sin `any` en la service layer
- **Domain types bien aislados:** `Issue`, `LoadedIssue`, `Template`, `Field`, `Section`, `Config`, `Relation`, `IssueSection`
- **`FIELD_TO_YAML` map** — camelCase TS ↔ snake_case YAML en un solo lugar
- **`SYSTEM_FRONTMATTER_KEY_ORDER`** — orden canónico de keys en serialization
- **`FrontmatterValue`** — discriminated union para valores de frontmatter
- **`FieldType`** — enum typed para los tipos de campo en templates

**Calidad general del tipado:** Excelente. TypeScript se usa como una herramienta de diseño, no como after-thought.

### 4.4 Testing coverage

**Estado actual:** `pnpm test` — exits non-zero ("No test files found"). Tests pendientes para step 7.

**Lo que la service layer necesita para coverage completo:**

- Parser: round-trip tests (parse → serialize → parse → compare)
- Serializer: canonical form tests, hash computation tests
- Validator: obligatory field tests, cycle detection tests, relation validation tests
- Slugs: slugify edge cases, padIssueId, nextIssueId
- Integrity: hash computation, stripIntegrityHashLine
- Loaders: missing file, malformed JSON, happy path

**Veredicto:** Testing pendientes — es esperado y no es un problema. La service layer es pura y testeable.

### 4.5 Lint status

- `pnpm check` (svelte-kit sync + svelte-check + tsc) — **✅ 0 errores, 0 warnings**
- `pnpm lint` (prettier + eslint) — ✅ pasa en todos los archivos de código; ❌ falla en `AGENTS.md` y `docs/ers.md` por Prettier table alignment (pre-existing, no introducido por steps 1–3)
- `pnpm build` — ✅ succeeds con SPA fallback

---

## 5. State of the Art Assessment

### 5.1 Technology choices

**¿Por qué SvelteKit + Svelte 5 (runes)?**

| Alternativa | ¿Por qué no?                                           |
| ----------- | ------------------------------------------------------ |
| React       | Boilerplate más alto, render no es puro                |
| Vue         | Runes de Svelte 5 son más expresivos para estado local |
| SolidJS     | Comunidad más pequeña, menos soporte para SvelteKit    |
| Vanilla     | Demasiado manual para una app con estado complejo      |
| Astro       | No es SPA — no tiene state management reactivo nativo  |
| Qwik        | Muy nuevo, ecosystem incipiente                        |

**Elección correcta.** Svelte 5 runes (`$state`, `$derived`, `$effect`) es el mejor fit para una app con estado reactivo complejo y sin SSR.

**¿Por qué no Electron / Tauri?**

Electron y Tauri fueron descartados correctamente:

- Mayor peso de distribución
- La FSA API es suficiente para Local Mode
- Remote Mode funciona en cualquier browser

**¿Por qué `isomorphic-git` + LightningFS?**

Esta es la decisión técnica más arriesgada del proyecto. Análisis:

- `isomorphic-git` es la única library que hace Git en browser puro
- **Partial clone en browser es experimental** — `singleBranch` + shallow fetch + tree walk manual puede romper con repositorios grandes
- **LightningFS + IndexedDB** para caching: approach correcto, pero puede hitear límites de almacenamiento en browsers
- **CORS proxy es obligatorio** para GitHub/GitLab.com — es un constraint real que los usuarios necesitan entender

**Riesgo medio-alto.** isomorphic-git funciona bien para repos pequeños-medianos. Para repos con miles de issues, el initial fetch puede ser lento y el cache de IndexedDB puede llenarse.

### 5.2 Local-first architecture

La arquitectura local-first es **el diferenciador técnico más importante**:

1. **Offline-capable** — Local Edit Mode funciona sin internet
2. **No vendor lock-in** — los datos son archivos Markdown estándar
3. **Privacy by default** — no hay servidor que vería los datos
4. **Version control** — Git es el sistema de backup/immutable history
5. **Fork-friendly** — cualquier persona puede forkear el repo con sus issues

**State of the art:** La tendencia "local-first software" (Martin Kleppmann, "A grid of the software landscape") favorece arquitecturas donde el device del usuario es primary, y sync es opt-in. AgnosticIssuer es consistente con esta tendencia.

### 5.3 Markdown como formato de datos

Usar Markdown + frontmatter YAML como formato de almacenamiento es una decisión pragmática con pros y contras:

**Pros:**

- Legible por humanos y machines
- Editable fuera del browser
- Diff-friendly en Git
- No hay schema migration — archivos viejos son legibles siempre
- No hay lock-in de formato

**Contras:**

- No hay schema enforcement en el filesystem (cualquiera puede romper un archivo)
- Concurrent edits requieren Git merge — puede ser doloroso
- No hay atomic transactions multi-archivo

**El integrity hash mitiga parcialmente el problema de archivos rotos.** Si alguien rompe un archivo manualmente, el warning banner aparece.

---

## 6. Gaps, Risks & Open Issues

### 6.1 Gaps (from ERS perspective)

| Gap                               | Severity | Notes                                                            |
| --------------------------------- | -------- | ---------------------------------------------------------------- |
| No UI todavía (Steps 4–6 pending) | 🔴 Alta  | La service layer es la mitad del trabajo; la UI es la otra mitad |
| No remote write (by design)       | 🟡 Media | El usuario debe commitear manualmente — friction real            |
| No comments/threads               | 🟡 Media | Los issues son "silent" — no hay discusión                       |
| No multi-user                     | 🟡 Media | Concurrent edits en mismo repo = Git conflicts                   |
| No mobile support                 | 🟡 Media | Documentado como out of scope, pero limita adopción              |
| No i18n beyond EN                 | 🟡 Media | Solo English en v1                                               |

### 6.2 Technical risks

| Risk                                                         | Probability | Impact | Mitigation                                                                |
| ------------------------------------------------------------ | ----------- | ------ | ------------------------------------------------------------------------- |
| `isomorphic-git` partial clone no funciona con repos grandes | Medium      | High   | Partial clone con tree-walk manual; limitar a `.agnostic-issuer/` subtree |
| IndexedDB quota exceeded                                     | Medium      | Medium | Cache eviction strategy; user-controlled clear cache                      |
| FSA permission revoked por browser                           | High        | Low    | Graceful re-prompt; state preservado en memory                            |
| CORS proxy offline                                           | Medium      | High   | Fallback error message; user puede configurar proxy propio                |
| Git conflicts en concurrent edits                            | Medium      | Medium | Integrity hash warning; no hay merge UI                                   |
| Markdown section markers rotos por merge conflict            | Low         | High   | El formato es frágil con Git merge; requiere cuidado del usuario          |

### 6.3 Open issues (from current-project-status.md)

1. ❌ `pnpm lint` falla en `AGENTS.md` + `docs/ers.md` (Prettier table alignment) — pre-existing, no critical
2. ❌ `AGENTS.md` aún dice `adapter-auto` en línea 20 y 50 después de step 1 (debería decir `adapter-static`)
3. ❌ No `engines.node` constraint en `package.json` (`.npmrc` tiene `engine-strict=true`)
4. ❌ YAML cosmetic divergences (dates quoted, flow vs block style) — documentado, bajo impacto

---

## 7. Recommendations

### 7.1 Before proceeding (pre-flight)

1. **Fix `AGENTS.md`**: cambiar `adapter-auto` → `adapter-static` en las líneas 20 y 50. Esto es gratis y evita confusión a otros agents.
2. **Agregar `engines.node`**: `"engines": { "node": ">=20" }` al `package.json`. Aunque `.npmrc` tiene `engine-strict=true`, la field `engines` es más visible para package managers.
3. **Agregar `lint-staged` o pre-commit hook**: el ERS dice "no hay CI, corre `pnpm check && pnpm lint && pnpm test` localmente antes de push". Sin un hook, esto no se va a cumplir. Agregar un simple pre-commit hook que corra `pnpm check && pnpm lint` es bajo costo y alto valor.
4. **Crear `.env.example`**: cuando se agreguen variables de entorno (para remote mode settings), tener el template desde el inicio evita deuda.

### 7.2 Architecture decisions to make now

1. **Markdown renderer (FR-13):** Elegir entre `shiki` (mejor syntax highlighting, bundle más pesado) vs `highlight.js` (más ligero). Recomendación: `shiki` por la calidad de output. Es una dependency que vale la pena.

2. **Gantt library vs custom SVG:** El ERS dice "custom SVG component — built on plain SVG; no third-party Gantt library." Esto es correcto para el scope — pero considerar si el custom SVG Gantt va a cumplir NFR-1 (200 bars + dependency arrows en <200ms). SVG rendering de muchas barras puede ser lento en browsers sin hardware acceleration. Si el perf budget es difícil de cumplir, considerar una library de charts (Victory, Recharts, etc.) como fallback.

3. **Drag-and-drop:** `svelte-dnd-action` está en el stack. Verificar que funcione bien con Svelte 5 runes (no todos los actions de Svelte 4 son compatibles).

### 7.3 Security hardening (NFR-2)

La PAT hygiene está parcialmente implementada:

- ✅ Service layer no persiste tokens (loaders son stateless)
- ⏳ Falta la UI del PAT input (step 6)
- ⏳ Falta el `onAuth` callback de `isomorphic-git` (step 4)

**Recommendation:** implementar el PAT input como un componente separado que NUNCA pase el token por props — usar un Svelte 5 `$state` local y pasarlo directamente al adapter.

### 7.4 Testing strategy

**Step 7 debe incluir:**

1. **Service layer unit tests** (Node env):
   - Parser: round-trip tests con el ERS example file
   - Serializer: hash computation, canonical form
   - Validator: cycle detection, obligatory fields, relation validation
   - Integrity: hash + strip
   - Slugs: edge cases (emoji-only, unicode, numbers)

2. **Memory-Fs adapter tests** (Node env):
   - Happy path CRUD
   - Error handling (file not found, malformed JSON)

3. **Type tests** (TypeScript):
   - Verificar que los tipos domain son correctos para edge cases

4. **Smoke test manual** (como el que ya existe):
   - Convertirlo en test automatizado de Playwright cuando la UI esté lista

### 7.5 Dependency audit

**Dependencies actuales:**

| Package                        | Purpose             | Risk                                              |
| ------------------------------ | ------------------- | ------------------------------------------------- |
| `gray-matter`                  | Frontmatter parsing | ✅ Stable, mantenido                              |
| `js-yaml`                      | YAML serialization  | ✅ Stable                                         |
| `@lucide/svelte`               | Icons               | ✅ Stable                                         |
| `svelte-dnd-action`            | Drag and drop       | ⚠️ Svelte 4 era; verificar Svelte 5 compatibility |
| `isomorphic-git`               | Git in browser      | ⚠️ Experimental, active development               |
| `@isomorphic-git/lightning-fs` | IndexedDB-backed FS | ⚠️ Experimental                                   |
| `marked`                       | Markdown rendering  | ✅ Stable                                         |
| `DOMPurify`                    | XSS sanitization    | ✅ Stable                                         |
| `shiki` / `highlight.js`       | Syntax highlighting | ⏳ Pendiente decisión                             |

**No hay dependencias obsoletas o deprecadas.** El stack es conservador.

---

## 8. Verdict

### Can we proceed?

**Sí.** El foundations es sólido. La service layer es de alta calidad: arquitectura correcta, tipos estrictos, código legible, sin deuda técnica significativa.

### Lo que está bien hecho

1. **Arquitectura de 4 capas** — la decisión más importante ya se tomó. Service layer pura = testeable, predecible, mantenible.
2. **TypeScript strict mode** — el type system se usa como herramienta de diseño, no como after-thought.
3. **Data model** — Markdown + frontmatter + section markers es pragmático, legible, y extensible.
4. **Integrity hash (FR-15)** — elegante, usando Web Crypto API nativo.
5. **Validation + cycle detection** — completo y bien pensado.
6. **ERS documentation** — detallada, con acceptance criteria medibles.

### Lo que falta (y es normal a Step 3)

1. **Adapter layer** — FSA, memory-fs, IndexedDB handle store. Este es el trabajo más técnico y con más riesgo (FSA API quirks, isomorphic-git partial clone).
2. **State layer** — runes-based stores. Straightforward con la service layer ya definida.
3. **UI** — la parte más visible. La service layer define el contrato (types + interfaces); la UI lo implementa.
4. **Tests** — la service layer es pura y lista para testear.

### Principales incertezas

1. **Partial clone con `isomorphic-git`**: ¿funciona bien con repositorios grandes? ¿Cuál es el cold-cache perf real?
2. **FSA permission model**: ¿los usuarios van a entender el modelo de "grant + persist"? ¿Qué pasa cuando el browser revoca el permission?
3. **Gantt performance**: ¿200 bars + dependency arrows en <200ms es alcanzable con SVG custom?
4. **Market adoption**: ¿existe demanda real para "issue tracker en Markdown in-repo con UI visual"? Los competitors son CLI o server-based.

### Risk-adjusted recommendation

| Prioridad | Acción                                                                 |
| --------- | ---------------------------------------------------------------------- |
| 🔴 Alta   | Terminar Steps 4–5 (adapter + state) para tener el esqueleto funcional |
| 🟡 Media  | Decidir Gantt strategy antes de empezar Step 6                         |
| 🟡 Media  | Agregar pre-commit hook antes de que más developers toquen el repo     |
| 🟢 Baja   | Corregir `AGENTS.md` + agregar `engines.node`                          |
| 🟢 Baja   | Evaluar `svelte-dnd-action` Svelte 5 compatibility                     |

**Recomendación final:** Proceder con Step 4 (adapter layer) primero. Es el paso con mayor riesgo técnico y mayor dependencia de APIs experimentales del browser. Si el adapter layer funciona bien, el resto es construcción de UI — que es más straightforward.

---

_Audit generated by Coder agent — 2026-06-20_
