# AgnosticIssuer — Estrategia Integral: Estructura, UI/UX y Estado del Arte

> **Documento:** `architecture-strategy.md`
> **Fecha:** 2026-06-22
> **Versión:** 1.0.0
> **Autor:** Mavis (MiniMax) — orquestación de design-consultation + brainstorming + sveltekit-structure + ui-ux-pro-max + deep-research
> **Alcance:** Pasos 4–8 del plan v0 (Adapter → State → UI → Tests → Verificación), con miras al ERS v1 completo
> **Público:** José (autor del ERS) + futuros agents que trabajen el codebase

---

## Tabla de Contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Design Consultation — Entendimiento profundo del codebase](#2-design-consultation--entendimiento-profundo-del-codebase)
3. [Brainstorming — Ideas para estructurar el proyecto](#3-brainstorming--ideas-para-estructurar-el-proyecto)
4. [SvelteKit Structure — Plan concreto de carpetas](#4-sveltekit-structure--plan-concreto-de-carpetas)
5. [UI/UX Pro Max — Sistema de diseño y principios frontend](#5-uiux-pro-max--sistema-de-diseño-y-principios-frontend)
6. [Deep Research — Estado del arte](#6-deep-research--estado-del-arte)
7. [Tier S+ Frontend — Síntesis final](#7-tier-s-frontend--síntesis-final)
8. [Roadmap de implementación](#8-roadmap-de-implementación)
9. [Checklist de verificación](#9-checklist-de-verificación)

---

## 1. Resumen ejecutivo

**AgnosticIssuer** es una SPA client-side-only (SvelteKit + `adapter-static` + Svelte 5 runes) para gestionar issues almacenados como Markdown + YAML frontmatter dentro del propio repo Git. Dos modos: **Local Edit** (FSA API) y **Remote Read-Only** (`isomorphic-git`). El estado de verdad vive en el repositorio, no en servidores externos.

### Estado actual (post-Step 3)

| Capa                                | Estado                      | Calidad                                                                          |
| ----------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| Tipos de dominio (`src/lib/types/`) | ✅ Completo                 | Excelente — TS strict, sin `any`                                                 |
| Service layer (`src/lib/services/`) | ✅ Completo                 | Excelente — pura, testeable, parser/serializer/validator/integrity/slugs/loaders |
| Adapter layer (`src/lib/adapters/`) | ⏳ Parcial (solo interface) | Pendiente Step 4 — FSA, memory-fs, handle-store, renderer                        |
| State layer                         | ❌ Pendiente                | Step 5 — runes-based stores                                                      |
| UI layer                            | ❌ Pendiente                | Step 6 — layout, home, views, editor                                             |
| Tests                               | ❌ Pendiente                | Step 7 — Vitest + Playwright                                                     |

**Veredicto:** el foundations está sólido. La service layer es de tier S. Lo que viene es construcción de UI — el trabajo más visible y diferenciador.

### Recomendación principal

Proceder con **Step 4 (adapter layer)** inmediatamente — es el paso con mayor riesgo técnico (FSA API quirks + `isomorphic-git` partial clone experimental). En paralelo, **estructurar la UI siguiendo el sistema de diseño propuesto** en §5 para evitar rework cuando llegue Step 6.

---

## 2. Design Consultation — Entendimiento profundo del codebase

### 2.1 Lo que el ERS dice (resumen ejecutivo)

`docs/ers.md` (1127 líneas, v1.0.0) define:

- **15 requisitos funcionales** (FR-1 a FR-15): parsing, templates, CRUD local, remote read-only, views (List/Kanban/Gantt), filters, validation, relations con cycle detection, IndexedDB cache, first-run wizard, CORS proxy + partial clone, Markdown rendering, theme, integrity hash.
- **7 requisitos no funcionales** (NFR-1 a NFR-7): performance budgets, security (PAT hygiene), privacy (no analytics), accessibility WCAG 2.1 AA, browser support matrix, i18n (EN-only v1), resilience.
- **Constraints C-1 a C-6**: no backend, no remote writes, Local Mode solo Chromium (FSA), permission re-grant, CORS proxy obligatorio, token hygiene.
- **Data model**: archivos `.md` con frontmatter YAML + secciones delimitadas por `<!-- [SECTION_START: name] -->` + `<!-- [SECTION_END: name] -->`.
- **Config tree**: `.agnostic-issuer/{config.json, templates/*.json, issues/*.md, .trash/}`.
- **Arquitectura de 4 capas**: UI → State → Service → Adapter.

### 2.2 Lo que el codebase tiene (post-Step 3)

#### Tipos de dominio (`src/lib/types/`)

| Archivo          | Líneas | Contenido clave                                                                                     |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `frontmatter.ts` | 13     | `FrontmatterValue` union (string/number/bool/null/array/object recursivo)                           |
| `issue.ts`       | 149    | `Issue`, `LoadedIssue`, `Relation`, `IssueSection`, `SYSTEM_FRONTMATTER_KEY_ORDER`, `FIELD_TO_YAML` |
| `template.ts`    | 63     | `Template`, `TemplateField`, `TemplateSection`, `FieldType` enum (8 valores)                        |
| `config.ts`      | 44     | `Config`, `Status`, `Label`, `User`, `KanbanConfig`, `GanttConfig`, `RemoteConfig`                  |
| `index.ts`       | 4      | Barrel re-exports                                                                                   |

**Puntos fuertes:**

- TS strict mode activo (`tsconfig.json:12`)
- `FIELD_TO_YAML` map único para camelCase TS ↔ snake_case YAML — single source of truth
- `SYSTEM_FRONTMATTER_KEY_ORDER` array que define orden canónico de keys en serialization
- `Relation` con 5 tipos tipados: `parent`, `child`, `blocks`, `depends_on`, `relates_to`
- `RelationType` discriminated union — el validador puede hacer cycle detection tipado

#### Service layer (`src/lib/services/`)

| Archivo              | Líneas | Función                                                      | Calidad              |
| -------------------- | ------ | ------------------------------------------------------------ | -------------------- |
| `parser.ts`          | 172    | `parseIssueFile(text, sourcePath)` → `LoadedIssue`           | ✅ Tier S            |
| `serializer.ts`      | 132    | `serializeIssue(issue)`, `canonicalForm(issue)`              | ✅ Tier S            |
| `integrity.ts`       | 55     | SHA-256 via Web Crypto API                                   | ✅ Tier S — elegante |
| `validator.ts`       | 168    | `validateIssue(issue, ctx)` con cycle detection (DFS)        | ✅ Tier S            |
| `slugs.ts`           | 48     | `slugify`, `padIssueId`, `buildIssueFilename`, `nextIssueId` | ✅ Tier S            |
| `config-loader.ts`   | 90     | `loadConfig(adapter)` con errores accionables                | ✅ Tier S            |
| `template-loader.ts` | 115    | `loadTemplates(adapter)` con shape validation                | ✅ Tier S            |
| `issue-loader.ts`    | 35     | `loadIssues(adapter)` — missing dir = empty set              | ✅ Tier S            |
| `index.ts`           | —      | Barrel re-exports                                            | —                    |

**Hallazgos clave del service layer:**

1. **Parser robusto:** `gray-matter` para frontmatter, scanner regex hand-rolled para section markers. Normalización defensiva de fechas (`Date | string | number → YYYY-MM-DD`). Relación parsing tolerante con `continue` en entries inválidas.

2. **Serializer con hash injection:** `canonicalForm()` serializa sin hash → `computeIntegrityHash()` → re-build frontmatter con hash inyectado como último key → `quoteIntegrityHash()` fuerza-quoting porque el string contiene `:`. Implementación belt-and-braces del ERS §6.1.3.

3. **Integrity minimalista:** 55 líneas, usa `globalThis.crypto.subtle.digest('SHA-256')` — Web Crypto API nativo, sin deps adicionales. Funciona en Node ≥19 y browsers modernos.

4. **Validator con cycle detection:** DFS simplificado de Tarjan. `STRICT_RELATION_TYPES` excluye `relates_to` del grafo de ciclos (correcto — ERS §3.1 FR-9). **Bug cosmético:** cuando visitamos un nodo que ya está en el stack, `existing.push(id)` agrega el closing node dos veces al cycle report. No afecta la detección, solo el mensaje. **Fix propuesto:**

   ```typescript
   // En validator.ts, línea ~72, reemplazar:
   for (const node of cycle) {
   	const existing = errors.get(node) ?? [];
   	existing.push(id);
   	errors.set(node, existing);
   }
   // Por:
   const uniqueCycle = [...new Set(cycle)];
   for (const node of uniqueCycle) {
   	errors.set(node, [...(errors.get(node) ?? []), id]);
   }
   ```

5. **Slugs Unicode-aware:** `String.prototype.normalize('NFKD')` + strip combining marks + fallback a `'untitled'` para inputs solo-emoji. Edge cases cubiertos.

6. **Loaders con errores accionables:** todos los loaders throw con mensajes que incluyen el path + cause chain (`{ cause }`). El usuario sabe qué archivo está mal y por qué.

#### Adapter layer (`src/lib/adapters/`)

Solo existe la **interface** (`directory-adapter.ts`, 43 líneas):

```typescript
export interface DirectoryAdapter {
	readTextFile(path: string): Promise<string>;
	writeTextFile(path: string, contents: string): Promise<void>;
	listDirectory(path: string): Promise<DirectoryEntry[]>;
	removeFile(path: string): Promise<void>;
	moveFile(from: string, to: string): Promise<void>;
}
```

Helpers: `splitPath`, `normalizePath`. **Path style: POSIX, relativo al root del adapter.**

**Implementaciones pendientes:**

- `local-fs.ts` — FSA-backed (Chromium only)
- `memory-fs.ts` — para tests, sin browser APIs
- `handle-store.ts` — IndexedDB para persistir `FileSystemDirectoryHandle`
- `renderer.ts` — `marked` + `DOMPurify` + `shiki` para FR-13
- `remote-git.ts` — `isomorphic-git` + LightningFS para FR-5, FR-10, FR-12
- `trash.ts` — lógica de move-to-trash para delete operations

### 2.3 Lo que falta implementar (Steps 4–8)

| Step                 | Qué se construye                                                                                                                                                                                                        | Por qué es importante                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **4 — Adapter**      | Local-fs (FSA), memory-fs, handle-store, renderer (FR-13), trash, remote-git (FR-5/10/12)                                                                                                                               | Habilita persistencia real + remote mode |
| **5 — State**        | Runes-based stores: `modeStore`, `folderStore`, `repoStore`, `issuesStore`, `templatesStore`, `configStore`, `filterStore`, `viewStore`, `themeStore`, `editorStore`                                                    | Single source of truth reactivo          |
| **6 — UI**           | Routes (`/`, `/local/list`, `/local/kanban`, `/local/gantt`, `/remote/...`), components (TopBar, LeftRail, FilterBar, ListView, KanbanView, GanttView, IssueEditor, MarkdownEditor, FieldRenderer), home screen, wizard | Lo que el usuario ve                     |
| **7 — Tests**        | Unit tests para service layer (parser round-trip, validator, integrity, slugs, loaders), integration tests con MemoryFsAdapter, e2e con Playwright (home → open folder → create issue → save)                           | Garantiza NFR-1, NFR-7                   |
| **8 — Verificación** | `pnpm check && pnpm lint && pnpm test` + smoke test manual + manual accessibility audit                                                                                                                                 | Lock-in de calidad                       |

### 2.4 Issues conocidas (de `docs/current-project-status.md`)

| Issue                                                                         | Severidad | Acción                                        |
| ----------------------------------------------------------------------------- | --------- | --------------------------------------------- |
| `AGENTS.md` dice `adapter-auto` en líneas 20 y 50                             | 🟢 Baja   | Fix trivial antes de Step 4                   |
| `pnpm lint` falla en `AGENTS.md` + `docs/ers.md` por Prettier table alignment | 🟢 Baja   | Pre-existing, fix manual de tablas            |
| No `engines.node` en `package.json`                                           | 🟢 Baja   | Agregar `"engines": { "node": ">=20" }`       |
| Divergencias cosméticas YAML (dates quoted, block vs flow style)              | 🟢 Baja   | Polish item post-v0                           |
| Bug cosmético en cycle reporting (validator.ts)                               | 🟢 Baja   | Fix de 3 líneas                               |
| `shiki` vs `highlight.js` no decidido                                         | 🟡 Media  | Decisión necesaria antes de Step 4 (renderer) |
| `svelte-dnd-action` Svelte 5 compat no verificada                             | 🟡 Media  | Verificar en Step 6 (Kanban)                  |
| Gantt custom SVG performance (200 bars < 200ms) no validado                   | 🟡 Media  | Medir antes de Step 6                         |

---

## 3. Brainstorming — Ideas para estructurar el proyecto

### 3.1 Principios rectores (los que el ERS ya implica)

1. **Capas estrictas** — la UI nunca toca el FS/Git; el Adapter nunca toca el DOM. La Service es pura.
2. **Single source of truth** — los tipos de dominio en `src/lib/types/` son la API; todo lo demás deriva.
3. **Pure functions donde sea posible** — la service layer es 100% pure → testeable sin mocks.
4. **Adapter como seam** — swapping FSA por otro storage = cambiar un solo archivo.
5. **Naming consistente** — `camelCase` en TS, `snake_case` en YAML, mapeo explícito en `FIELD_TO_YAML`.

### 3.2 Ideas de estructura (brainstorming)

#### Idea A — "Feature folders" (recomendada)

Agrupar por feature, no por tipo técnico. Cada feature contiene sus componentes, stores, tests.

```
src/lib/features/
  issues/
    components/
      IssueEditor.svelte
      IssueCard.svelte
      IssueRow.svelte
    stores/
      issues.svelte.ts
    types.ts
    index.ts
  kanban/
    components/
      KanbanBoard.svelte
      KanbanColumn.svelte
      KanbanCard.svelte
    index.ts
  gantt/
    components/
      GanttChart.svelte
      GanttBar.svelte
      GanttDependencyArrow.svelte
    lib/
      layout.ts  // pure layout algorithm
    index.ts
  filters/
    components/
      FilterBar.svelte
      FilterChip.svelte
    stores/
      filter.svelte.ts
    index.ts
  wizard/
    components/
      Wizard.svelte
      TemplateChecklist.svelte
      TemplateEditor.svelte
    index.ts
```

**Pros:** cohesión alta, fácil de borrar/refactorizar features enteras.
**Contras:** requiere disciplina para evitar cross-feature imports circulares.

#### Idea B — "Layer-first" (más cercana al ERS)

```
src/lib/
  ui/          # componentes puros, sin lógica de negocio
    components/
    primitives/   # Button, Input, Modal — shadcn-svelte style
  state/       # runes stores
  features/    # lógica que cruza capas (issue-editor-flow, kanban-flow)
  services/    # ya existe
  adapters/    # ya existe
  types/       # ya existe
```

**Pros:** alineado con el ERS §5.1 (Layered View).
**Contras:** requiere navegación cross-folder para una feature.

#### Idea C — Híbrido (recomendación final)

**Combinar A + B.** Las features que tienen UI compleja (kanban, gantt, editor) usan feature folders. Las capas horizontales (services, adapters, types, primitives UI) se mantienen layer-first.

```
src/
├── lib/
│   ├── types/              # PURO: tipos de dominio (existente)
│   ├── services/           # PURO: lógica de negocio (existente)
│   ├── adapters/           # PURO: interfaces FS/Git/renderer (existente)
│   ├── primitives/         # PURO: componentes UI sin lógica
│   │   ├── ui/             # Button, Input, Select, Modal, Tooltip, ...
│   │   ├── feedback/       # Toast, Banner, Alert, IntegrityWarning
│   │   └── layout/         # TopBar, LeftRail, MainCanvas, Panel
│   ├── features/           # PURO A NIVEL UI: componentes que combinan primitives
│   │   ├── home/
│   │   ├── list-view/
│   │   ├── kanban-view/
│   │   ├── gantt-view/
│   │   ├── editor/
│   │   ├── filters/
│   │   └── wizard/
│   ├── state/              # PURO: runes stores globales
│   │   ├── mode.svelte.ts
│   │   ├── folder.svelte.ts
│   │   ├── repo.svelte.ts
│   │   ├── issues.svelte.ts
│   │   ├── templates.svelte.ts
│   │   ├── config.svelte.ts
│   │   ├── filters.svelte.ts
│   │   ├── view.svelte.ts
│   │   ├── theme.svelte.ts
│   │   └── editor.svelte.ts
│   └── i18n/               # strings (ERS NFR-6)
│       ├── en.ts
│       └── index.ts
└── routes/                 # SvelteKit routing (thin shells)
    ├── +layout.svelte
    ├── +layout.ts          # ssr=false, prerender=false (existente)
    ├── +page.svelte        # Home (mode picker)
    ├── local/
    │   ├── +layout.svelte  # TopBar + LeftRail
    │   ├── list/+page.svelte
    │   ├── kanban/+page.svelte
    │   ├── gantt/+page.svelte
    │   └── issues/[id]/+page.svelte
    └── remote/
        ├── +layout.svelte
        ├── list/+page.svelte
        ├── kanban/+page.svelte
        ├── gantt/+page.svelte
        └── issues/[id]/+page.svelte
```

**Pros:** máxima cohesión dentro de features + máxima separación de capas horizontales.
**Contras:** estructura nueva — hay que establecer convenciones claras.

### 3.3 Convenciones de naming (propuesta)

| Elemento    | Convención               | Ejemplo                                        |
| ----------- | ------------------------ | ---------------------------------------------- |
| Componentes | PascalCase, `.svelte`    | `IssueEditor.svelte`, `KanbanCard.svelte`      |
| Stores      | camelCase + `.svelte.ts` | `issues.svelte.ts`, `theme.svelte.ts`          |
| Services    | camelCase, `.ts` puro    | `parser.ts`, `serializer.ts`                   |
| Adapters    | kebab-case + sufijo      | `local-fs.ts`, `memory-fs.ts`, `remote-git.ts` |
| Types       | PascalCase, en `types/`  | `Issue`, `Template`, `LoadedIssue`             |
| Rutas       | kebab-case               | `local/list`, `remote/issues/[id]`             |
| i18n keys   | dotted notation          | `home.openLocalFolder`, `editor.save`          |

### 3.4 Reglas de imports (linter-enforced)

```typescript
// src/lib/types/*.ts puede importar solo de otros types
// src/lib/services/*.ts puede importar de types/, NO de adapters/, state/, primitives/
// src/lib/adapters/*.ts puede importar de types/, NO de services/, state/, primitives/
// src/lib/state/*.svelte.ts puede importar de services/, adapters/, types/, NO de primitives/
// src/lib/primitives/*.svelte puede importar SOLO de types/, i18n/
// src/lib/features/**/*.svelte puede importar de state/, services/, adapters/, primitives/, types/, i18n/
// src/routes/**/*.svelte puede importar de features/, state/, primitives/, i18n/
```

Estas reglas se enforcean con `eslint-plugin-import` o `eslint-plugin-boundaries` (recomendado: `eslint-plugin-boundaries`).

---

## 4. SvelteKit Structure — Plan concreto de carpetas

### 4.1 Árbol completo (estado futuro)

```
T:\Kiroku\AgnosticIssuer\
├── .git/
├── .vscode/
├── docs/
│   ├── ers.md                              # ERS v1.0.0 (existente)
│   ├── current-project-status.md           # Status tracker (existente)
│   ├── requirements-audit.md               # Audit (existente)
│   └── architecture-strategy.md            # ESTE DOCUMENTO
├── static/
│   └── robots.txt                          # (existente)
├── src/
│   ├── app.html                            # (existente)
│   ├── app.d.ts                            # (existente)
│   ├── lib/
│   │   ├── index.ts                        # Public surface (existente)
│   │   ├── types/                          # ✅ DOMAIN TYPES (Step 2)
│   │   │   ├── index.ts
│   │   │   ├── frontmatter.ts
│   │   │   ├── issue.ts
│   │   │   ├── template.ts
│   │   │   └── config.ts
│   │   ├── services/                       # ✅ PURE BUSINESS LOGIC (Step 3)
│   │   │   ├── index.ts
│   │   │   ├── parser.ts
│   │   │   ├── serializer.ts
│   │   │   ├── integrity.ts
│   │   │   ├── validator.ts
│   │   │   ├── slugs.ts
│   │   │   ├── config-loader.ts
│   │   │   ├── template-loader.ts
│   │   │   └── issue-loader.ts
│   │   ├── adapters/                       # ⏳ STEP 4
│   │   │   ├── index.ts                    # barrel
│   │   │   ├── directory-adapter.ts        # interface (existente)
│   │   │   ├── local-fs.ts                 # FSA-backed
│   │   │   ├── memory-fs.ts                # tests mock
│   │   │   ├── handle-store.ts             # IndexedDB persistence
│   │   │   ├── trash.ts                    # move-to-trash logic
│   │   │   ├── renderer.ts                 # marked + DOMPurify + shiki
│   │   │   └── remote-git.ts               # isomorphic-git + LightningFS
│   │   ├── state/                          # ⏳ STEP 5
│   │   │   ├── index.ts
│   │   │   ├── mode.svelte.ts              # 'local' | 'remote' | 'home'
│   │   │   ├── folder.svelte.ts            # active FSA handle + recent list
│   │   │   ├── repo.svelte.ts              # remote mode state
│   │   │   ├── issues.svelte.ts            # loaded issues
│   │   │   ├── templates.svelte.ts         # loaded templates
│   │   │   ├── config.svelte.ts            # loaded config
│   │   │   ├── filters.svelte.ts           # filter predicates
│   │   │   ├── view.svelte.ts              # 'list' | 'kanban' | 'gantt'
│   │   │   ├── theme.svelte.ts             # 'light' | 'dark' | 'system'
│   │   │   └── editor.svelte.ts            # active issue, dirty state
│   │   ├── primitives/                     # ⏳ STEP 6 (UI building blocks)
│   │   │   ├── ui/
│   │   │   │   ├── Button.svelte
│   │   │   │   ├── IconButton.svelte
│   │   │   │   ├── Input.svelte
│   │   │   │   ├── Textarea.svelte
│   │   │   │   ├── Select.svelte
│   │   │   │   ├── MultiSelect.svelte
│   │   │   │   ├── DateInput.svelte
│   │   │   │   ├── NumberInput.svelte
│   │   │   │   ├── Checkbox.svelte
│   │   │   │   ├── Radio.svelte
│   │   │   │   ├── Toggle.svelte
│   │   │   │   ├── Modal.svelte
│   │   │   │   ├── Dropdown.svelte
│   │   │   │   ├── Tooltip.svelte
│   │   │   │   ├── Tabs.svelte
│   │   │   │   └── Toast.svelte
│   │   │   ├── feedback/
│   │   │   │   ├── Banner.svelte
│   │   │   │   ├── IntegrityWarning.svelte  # FR-15
│   │   │   │   ├── ErrorState.svelte
│   │   │   │   ├── EmptyState.svelte
│   │   │   │   ├── LoadingState.svelte
│   │   │   │   └── Spinner.svelte
│   │   │   └── layout/
│   │   │       ├── TopBar.svelte           # mode badge, theme toggle, settings
│   │   │       ├── LeftRail.svelte         # view switcher + filter panel
│   │   │       ├── MainCanvas.svelte
│   │   │       ├── FilterBar.svelte        # FR-7
│   │   │       └── Panel.svelte
│   │   ├── features/                       # ⏳ STEP 6 (feature composition)
│   │   │   ├── home/
│   │   │   │   ├── HomeScreen.svelte
│   │   │   │   ├── ModePicker.svelte
│   │   │   │   ├── RecentFolders.svelte
│   │   │   │   └── index.ts
│   │   │   ├── list-view/
│   │   │   │   ├── ListView.svelte
│   │   │   │   ├── IssueRow.svelte
│   │   │   │   ├── SortableHeader.svelte
│   │   │   │   ├── VirtualScroller.svelte   # NFR-1: 1000 issues < 500ms
│   │   │   │   └── index.ts
│   │   │   ├── kanban-view/
│   │   │   │   ├── KanbanView.svelte
│   │   │   │   ├── KanbanColumn.svelte
│   │   │   │   ├── KanbanCard.svelte
│   │   │   │   └── index.ts
│   │   │   ├── gantt-view/
│   │   │   │   ├── GanttView.svelte
│   │   │   │   ├── GanttBar.svelte
│   │   │   │   ├── GanttDependencyArrow.svelte
│   │   │   │   ├── GanttFallbackTable.svelte  # NFR-4
│   │   │   │   ├── lib/
│   │   │   │   │   ├── layout.ts            # pure layout algorithm
│   │   │   │   │   └── time-scale.ts
│   │   │   │   └── index.ts
│   │   │   ├── editor/
│   │   │   │   ├── IssueEditor.svelte
│   │   │   │   ├── MarkdownEditor.svelte   # Write tab
│   │   │   │   ├── MarkdownPreview.svelte  # Preview tab
│   │   │   │   ├── FieldRenderer.svelte    # dispatches by field type
│   │   │   │   ├── RelationField.svelte
│   │   │   │   ├── ValidationPanel.svelte
│   │   │   │   └── index.ts
│   │   │   ├── filters/
│   │   │   │   ├── FilterPredicate.svelte  # one per predicate type
│   │   │   │   ├── MultiSelectFilter.svelte
│   │   │   │   ├── DateRangeFilter.svelte
│   │   │   │   ├── TextSearchFilter.svelte
│   │   │   │   └── index.ts
│   │   │   └── wizard/
│   │   │       ├── FirstRunWizard.svelte
│   │   │       ├── BuiltInTemplatePicker.svelte
│   │   │       ├── CustomTemplateEditor.svelte
│   │   │       ├── TemplatePreview.svelte
│   │   │       └── index.ts
│   │   ├── i18n/                           # NFR-6: i18n
│   │   │   ├── index.ts
│   │   │   └── en.ts
│   │   └── assets/
│   │       └── favicon.svg                 # (existente)
│   └── routes/
│       ├── +layout.svelte                  # global styles, theme provider
│       ├── +layout.ts                      # ssr=false, prerender=false
│       ├── layout.css                      # Tailwind + design tokens
│       ├── +page.svelte                    # Home (mode picker)
│       ├── local/
│       │   ├── +layout.svelte              # TopBar + LeftRail
│       │   ├── +layout.ts                  # guards: requires folder open
│       │   ├── list/
│       │   │   └── +page.svelte
│       │   ├── kanban/
│       │   │   └── +page.svelte
│       │   ├── gantt/
│       │   │   └── +page.svelte
│       │   └── issues/
│       │       └── [id]/
│       │           └── +page.svelte        # editor
│       └── remote/
│           ├── +layout.svelte
│           ├── +layout.ts                  # guards: requires repo loaded
│           ├── list/+page.svelte
│           ├── kanban/+page.svelte
│           ├── gantt/+page.svelte
│           └── issues/[id]/+page.svelte    # read-only editor
├── tests/                                  # ⏳ STEP 7
│   ├── services/
│   │   ├── parser.test.ts
│   │   ├── serializer.test.ts
│   │   ├── validator.test.ts
│   │   ├── integrity.test.ts
│   │   ├── slugs.test.ts
│   │   ├── config-loader.test.ts
│   │   ├── template-loader.test.ts
│   │   └── issue-loader.test.ts
│   ├── adapters/
│   │   ├── memory-fs.test.ts
│   │   ├── handle-store.test.ts
│   │   ├── renderer.test.ts
│   │   └── remote-git.test.ts
│   └── e2e/
│       ├── home.spec.ts
│       ├── local-crud.spec.ts
│       ├── kanban-drag.spec.ts
│       └── accessibility.spec.ts
├── .gitignore                              # (existente)
├── .npmrc                                  # engine-strict=true (existente)
├── .prettierrc                             # (existente)
├── .prettierignore                         # (existente)
├── AGENTS.md                               # (existente, necesita fix)
├── README.md                               # (existente, necesita update)
├── eslint.config.js                        # (existente)
├── package.json                            # (existente, necesita engines)
├── pnpm-lock.yaml                          # (existente)
├── pnpm-workspace.yaml                     # (existente)
├── tsconfig.json                           # (existente)
└── vite.config.ts                          # (existente)
```

### 4.2 Decisiones clave de estructura

#### `src/lib/primitives/` separado de `src/lib/features/`

- **`primitives/`**: componentes UI genéricos, sin lógica de dominio (Button, Input, Modal). Reutilizables, copy-paste friendly.
- **`features/`**: componentes que combinan primitives + state para resolver un caso de uso (KanbanView usa `KanbanCard` + `issuesStore` + `filterStore`).

**Convención:** un componente en `features/` NUNCA debe ser importado por otro feature. Si dos features necesitan lo mismo, moverlo a `primitives/`.

#### `src/lib/state/*.svelte.ts` para stores

Svelte 5 idiom: stores que usan runes deben tener la extensión `.svelte.ts`. Cada store es un módulo que exporta un `$state` reactivo + funciones de mutación.

```typescript
// src/lib/state/theme.svelte.ts (ejemplo)
export const theme = $state<'light' | 'dark' | 'system'>({
	current: 'system'
});

export function setTheme(value: 'light' | 'dark' | 'system') {
	theme.current = value;
	localStorage.setItem('agnostic-issuer.theme', value);
	applyThemeClass();
}
```

#### `src/lib/i18n/` con un solo idioma (NFR-6)

```typescript
// src/lib/i18n/en.ts
export const en = {
	home: {
		openLocalFolder: 'Open local folder',
		browseRemote: 'Browse remote repository',
		recentFolders: 'Recent folders'
	},
	editor: {
		save: 'Save',
		delete: 'Delete',
		cancel: 'Cancel',
		integrityWarning: 'This file was modified outside AgnosticIssuer...'
	}
	// ...
};

// src/lib/i18n/index.ts
import { en } from './en.ts';
export const t = en; // v1: solo EN. Futuras locales se swappean aquí.
```

#### `tests/` separado de `src/`

Tests no viven junto al código (convención SvelteKit estándar). Estructura espeja `src/lib/{services,adapters}/` + carpeta `e2e/` para Playwright.

### 4.3 Archivos que necesitan modificación inmediata

| Archivo                       | Cambio                                                       | Por qué                           |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------- |
| `AGENTS.md` línea 20 y 50     | `adapter-auto` → `adapter-static`                            | Confusión a otros agents          |
| `package.json`                | Agregar `"engines": { "node": ">=20" }`                      | Visibilidad para package managers |
| `package.json` `scripts.test` | `npm run test:unit -- --run` → `vitest --run`                | El README ya dice pnpm            |
| `src/routes/+layout.svelte`   | Agregar theme provider + global stores init                  | Habilita Step 6                   |
| `src/routes/layout.css`       | Expandir con design tokens (`@theme`)                        | Base para §5                      |
| `eslint.config.js`            | Agregar `eslint-plugin-boundaries` con reglas de capas       | Enforce architecture              |
| `.gitignore`                  | Asegurar `.env`, `.env.*` están ahí (excepto `.env.example`) | Documentado en AGENTS.md          |

---

## 5. UI/UX Pro Max — Sistema de diseño y principios frontend

### 5.1 Principios fundacionales (Tier S+ frontend)

Aplicados a AgnosticIssuer — un tool de productividad para developers:

#### 1. **Density by intent** — la densidad visual sigue al contexto

- **List view:** alta densidad (filas de 32–36px). El developer escanea, no lee.
- **Kanban view:** densidad media (cards de 96–120px). Drag targets visibles.
- **Gantt view:** densidad alta pero con espaciado generoso (visualización temporal).
- **Editor:** baja densidad. Focus en escritura. Padding generoso, una columna.
- **Home:** ultra-baja densidad. Dos botones grandes + lista simple.

**Regla concreta:** cada vista tiene un `--density-scale` CSS variable que multiplica el `line-height` base. Cambiar densidad = cambiar una variable.

#### 2. **Color with meaning, never decoration**

- **Status colors** (`config.statuses[].color`): SEMPRE se usan para el status pill + un dot + un label textual. Nunca solo color (WCAG 1.4.1).
- **Type colors** (`config.templates[].color`): el badge del issue type. Incluye siempre el icon name.
- **Label colors**: chips con background tint + text. Nunca solo texto de color.
- **Semantic palette:**
  - Success = `#10b981` (done status)
  - Warning = `#f59e0b` (in review, integrity warning)
  - Danger = `#ef4444` (critical bugs, destructive actions)
  - Info = `#3b82f6` (in progress, neutral actions)
  - Neutral = `#6b7280` (closed, idle)

#### 3. **Motion as feedback, never as decoration**

- **Duration budget:** 80–240ms para transiciones de UI. Nada más lento para acciones inmediatas.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (smooth, con snap al final).
- **Drag in Kanban:** el card se eleva (scale 1.02, shadow más profundo), el slot de drop se ilumina. 120ms transition.
- **Toast:** enter 160ms slide-from-bottom, exit 120ms fade. Auto-dismiss a 4s.
- **Reduced motion:** todas las transiciones respetan `prefers-reduced-motion: reduce` (FR-NFR-4 + best practice).

#### 4. **Information hierarchy through typography, not chrome**

- **3 sizes de texto base:**
  - Caption: `text-xs` (12px) — metadata, timestamps
  - Body: `text-sm` (14px) — labels, contenido secundario
  - Heading: `text-base` / `text-lg` (16/18px) — títulos de issue, headers de columna
- **Font weight como jerarquía:** regular (400) para body, medium (500) para labels, semibold (600) para títulos. Nunca bold (700+) — se siente pesado en interfaces densas.
- **Monospace para IDs y slugs:** `font-mono text-xs` para `0042-fix-login-redirect.md`.

#### 5. **Keyboard-first, mouse-supported**

Inspirado en Linear/Notion — el 80% de las acciones deben tener un shortcut.

| Acción                          | Shortcut           | Ámbito                   |
| ------------------------------- | ------------------ | ------------------------ |
| Open command palette            | `Cmd/Ctrl+K`       | Global                   |
| New issue                       | `Cmd/Ctrl+N`       | Global (local mode only) |
| Save                            | `Cmd/Ctrl+S`       | Editor                   |
| Cancel edit                     | `Esc`              | Editor                   |
| Switch view (List/Kanban/Gantt) | `G` then `L/K/T`   | Local/Remote             |
| Open filters                    | `F`                | Local/Remote             |
| Toggle theme                    | `Cmd/Ctrl+Shift+T` | Global                   |
| Search                          | `/`                | Global                   |

**Implementación:** registrar shortcuts en el root layout, evitar hijack cuando un input está focused.

#### 6. **Progressive disclosure** — el advanced está ahí pero no estorba

- **Filter bar colapsable** por default (NFR-4 keyboard). Los filtros aplicados se ven como chips pequeños arriba del main canvas.
- **Settings panel** como modal, no como página separada (más rápido de abrir/cerrar).
- **Markdown preview tab** en el editor — el user elige Write o Preview, no ambos simultáneos por default.
- **Advanced config** (remote settings, integrity hash inspector) en sub-paneles.

#### 7. **Empty states that teach**

- **No folder open:** home screen con un illustration SVG + copy explicativo.
- **No issues yet:** "Create your first issue" + quickstart guide inline.
- **No search results:** "Try removing a filter" + clear button.
- **Error loading:** "Couldn't read this file" + reason + retry button.

Empty states son **momentos de onboarding**, no errores. Siempre una acción posible.

### 5.2 Design tokens (Tailwind 4 CSS-first)

Implementación con `@theme` en `src/routes/layout.css`:

```css
@import 'tailwindcss';
@plugin '@tailwindcss/typography';

@theme {
	/* === TYPOGRAPHY === */
	--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
	--font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
	--text-xs: 0.75rem; /* 12px */
	--text-sm: 0.875rem; /* 14px */
	--text-base: 1rem; /* 16px */
	--text-lg: 1.125rem; /* 18px */

	/* === SPACING (4px base) === */
	--spacing-px: 1px;
	--spacing-0: 0;
	--spacing-1: 0.25rem; /* 4px */
	--spacing-2: 0.5rem; /* 8px */
	--spacing-3: 0.75rem; /* 12px */
	--spacing-4: 1rem; /* 16px */
	--spacing-6: 1.5rem; /* 24px */
	--spacing-8: 2rem; /* 32px */
	--spacing-12: 3rem; /* 48px */

	/* === COLORS (neutral base) === */
	--color-canvas: oklch(0.99 0 0); /* near-white */
	--color-surface: oklch(0.97 0 0); /* subtle background */
	--color-surface-2: oklch(0.94 0 0); /* card background */
	--color-border: oklch(0.9 0 0);
	--color-border-strong: oklch(0.8 0 0);
	--color-text: oklch(0.2 0 0);
	--color-text-muted: oklch(0.5 0 0);
	--color-text-subtle: oklch(0.65 0 0);

	/* === SEMANTIC COLORS === */
	--color-success: oklch(0.65 0.18 145);
	--color-warning: oklch(0.75 0.16 75);
	--color-danger: oklch(0.6 0.22 25);
	--color-info: oklch(0.6 0.18 240);

	/* === RADIUS === */
	--radius-sm: 4px;
	--radius-md: 6px;
	--radius-lg: 10px;
	--radius-xl: 14px;

	/* === SHADOWS === */
	--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.04);
	--shadow-md: 0 2px 4px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04);
	--shadow-lg: 0 8px 16px -4px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.04);
	--shadow-xl: 0 16px 32px -8px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06);

	/* === MOTION === */
	--ease-out-quart: cubic-bezier(0.16, 1, 0.3, 1);
	--ease-in-out-cubic: cubic-bezier(0.65, 0, 0.35, 1);
	--duration-fast: 120ms;
	--duration-base: 200ms;
	--duration-slow: 320ms;
}

/* === DARK MODE OVERRIDES === */
@media (prefers-color-scheme: dark) {
	@theme {
		--color-canvas: oklch(0.15 0 0);
		--color-surface: oklch(0.2 0 0);
		--color-surface-2: oklch(0.25 0 0);
		--color-border: oklch(0.3 0 0);
		--color-border-strong: oklch(0.4 0 0);
		--color-text: oklch(0.95 0 0);
		--color-text-muted: oklch(0.7 0 0);
		--color-text-subtle: oklch(0.55 0 0);
	}
}

/* Manual dark mode override (when user picks 'dark' in theme toggle) */
:root.dark {
	--color-canvas: oklch(0.15 0 0);
	--color-surface: oklch(0.2 0 0);
	/* ... same as above ... */
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

**Decisiones clave:**

- **OKLCH color space** (en lugar de HSL/HSV): perceptualmente uniforme, mejor para dark mode transitions.
- **Numeric spacing scale** (no `tight`/`loose` keywords): permite `mt-[calc(var(--spacing-1)*1.5)]` para casos especiales.
- **CSS variables como design tokens**: cualquier valor se puede sobrescribir en runtime (importante para el theme toggle).
- **`oklch(0.99 0 0)` en lugar de `#ffffff` puro**: el ojo humano no distingue, pero evita el "blanco quemado" que aparece en pantallas modernas.

### 5.3 Layout architecture (3-zone shell)

ERS §4.1.1 define tres regiones. Mi propuesta de implementación:

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOP BAR (56px)                                                     │
│  [Logo]  [Mode Badge]  [Folder/Repo Indicator]    [⌘K] [Theme] [⚙] │
├──────────┬──────────────────────────────────────────────────────────┤
│          │  FILTER BAR (44px, collapsible)                          │
│  LEFT    ├──────────────────────────────────────────────────────────┤
│  RAIL    │                                                          │
│  (220px) │  MAIN CANVAS                                             │
│          │  - List view (table)                                     │
│  [List]  │  - Kanban view (columns)                                 │
│  [Kanban]│  - Gantt view (timeline)                                 │
│  [Gantt] │  - Editor (when issue open)                              │
│          │  - Wizard (when first-run)                               │
│  ───     │                                                          │
│  Filters │                                                          │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

**Detalles:**

- **TopBar:** `position: sticky; top: 0; z-index: 50;` — siempre visible.
- **LeftRail:** colapsable a 64px (solo icons) — keyboard shortcut `B` para toggle.
- **Filter bar:** dentro del MainCanvas, NO en LeftRail — permite que el filter context sea visible con el contenido.
- **Min viewport:** 1024×640 (NFR-5 mobile not supported).

### 5.4 Component API principles

#### Props design

```svelte
<!-- Button.svelte (primitive) -->
<script lang="ts">
  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    loading?: boolean;
    icon?: Component;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let { variant = 'primary', size = 'md', ... }: Props = $props();
</script>
```

- **Default values para todo lo opcional** — el componente es usable con `<Button>Click</Button>`.
- **`children` como Snippet** (Svelte 5 idiom, nunca `<slot>`).
- **Events via `on*` props** (Svelte 5 idiom, nunca `on:click`).

#### Snippets over slots

Svelte 5 reemplaza `<slot>` por `{#snippet}` + `{@render}`:

```svelte
<!-- Card.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title: Snippet;
		actions?: Snippet;
		children: Snippet;
	}
	let { title, actions, children }: Props = $props();
</script>

<div class="card">
	<header class="card-title">{@render title()}</header>
	<div class="card-body">{@render children()}</div>
	{#if actions}<footer>{@render actions()}</footer>{/if}
</div>

<!-- Usage -->
<Card>
	{#snippet title()}Fix login redirect{/snippet}
	{#snippet actions()}
		<Button size="sm" onclick={open}>Open</Button>
	{/snippet}
	<p>Issue content...</p>
</Card>
```

### 5.5 Accessibility checklist (NFR-4 WCAG 2.1 AA)

| Criterio                     | Implementación                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | Semantic HTML (`<main>`, `<nav>`, `<header>`, `<aside>`, `<table>`) |
| 1.4.1 Use of Color           | Status/label siempre con texto + color                              |
| 1.4.3 Contrast (Minimum)     | OKLCH palette con L ≥ 0.4 para foreground sobre background          |
| 1.4.11 Non-text Contrast     | Borders ≥ 3:1 contra background                                     |
| 1.4.12 Text Spacing          | No `letter-spacing` negativo, line-height ≥ 1.5                     |
| 2.1.1 Keyboard               | Todo interactivo accesible con Tab + shortcuts                      |
| 2.1.2 No Keyboard Trap       | Esc cancela modals, focus traps solo en modals                      |
| 2.4.3 Focus Order            | DOM order = visual order                                            |
| 2.4.7 Focus Visible          | Outline custom 2px oklch(0.60 0.18 240) + offset 2px                |
| 3.3.1 Error Identification   | Validation errors con `aria-invalid` + `aria-describedby`           |
| 3.3.2 Labels or Instructions | Cada input tiene `<label>` (no solo `placeholder`)                  |
| 4.1.2 Name, Role, Value      | ARIA attrs en componentes custom (Modal, Dropdown)                  |
| 4.1.3 Status Messages        | Toast con `role="status"`, errors con `role="alert"`                |

### 5.6 Performance budgets (NFR-1)

| Métrica                          | Budget                | Cómo se mide                       |
| -------------------------------- | --------------------- | ---------------------------------- |
| List view initial render         | < 500ms               | Performance API + 1000 issues seed |
| List view filter interaction     | < 50ms                | rAF timing                         |
| Kanban drag                      | 60fps (16.67ms/frame) | DevTools Performance tab           |
| Gantt render (200 bars + arrows) | < 200ms               | Performance API                    |
| Remote initial fetch             | < 10s                 | Time-to-interactive con cold cache |
| Initial JS bundle                | < 200KB gzipped       | Vite build report                  |
| Time-to-interactive (cold)       | < 2s                  | Lighthouse                         |

**Implementation strategies:**

- **List view:** virtual scrolling (`svelte-virtual-list` o custom con IntersectionObserver).
- **Kanban:** React-style reconciliation via Svelte 5 keyed `{#each}`.
- **Gantt:** SVG con `viewBox`, NO React-style re-renders; solo `requestAnimationFrame` para hover/drag.
- **Remote:** Web Worker para `isomorphic-git` operations (no bloquear UI thread).

---

## 6. Deep Research — Estado del arte

### 6.1 Stack comparisons (2026)

#### Framework choice: SvelteKit + Svelte 5 vs alternativas

| Framework                      | Pros                                                                           | Cons                                         | Verdict para AgnosticIssuer         |
| ------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------- |
| **SvelteKit + adapter-static** | Bundle pequeño, runes son perfectos para state local, SvelteKit routing maduro | Ecosystem más pequeño que React              | ✅ Correcto (ERS §5.3)              |
| **React + Vite**               | Ecosystem masivo (shadcn, Radix, etc.)                                         | Bundle más grande, re-renders innecesarios   | ⚠️ Sería válido pero menos elegante |
| **SolidJS + SolidStart**       | Fine-grained reactivity como Svelte 5                                          | Ecosystem más pequeño, menos battle-tested   | ⚠️ Considerar para v2               |
| **Vue 3 + Nuxt**               | Composition API similar a runes                                                | Runes vs ref() es debatable                  | ⚠️ Sería válido                     |
| **Astro**                      | Excelente para content sites                                                   | No es SPA — no tiene state management nativo | ❌ No fit                           |

**Conclusión:** la elección SvelteKit es correcta. Svelte 5 runes ($state, $derived, $effect) son el mejor fit para una app con state reactivo complejo y sin SSR.

#### Styling: Tailwind 4 vs alternativas

| Solución                   | Pros                                                                | Cons                           | Verdict       |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------ | ------------- |
| **Tailwind 4 (CSS-first)** | Tokens como CSS vars, @theme block, JIT compilation, smaller bundle | Curva de aprendizaje inicial   | ✅ Correcto   |
| **Vanilla Extract**        | Type-safe, zero-runtime                                             | Verbose, sin utility benefits  | ⚠️ Overkill   |
| **CSS Modules + PostCSS**  | Familiar                                                            | Más boilerplate                | ⚠️ Menos DRY  |
| **Panda CSS**              | Type-safe + utility-first                                           | Más nuevo, menos battle-tested | ⚠️ Considerar |

**Tailwind 4.2 (feb 2026) novedades relevantes:**

- `@tailwindcss/webpack` plugin — AgnosticIssuer usa Vite, pero relevante para contribuidores.
- 4 nuevos color schemes (mauve, olive, mist, taupe) — baja saturación, tendencia 2026.
- Logical properties utilities (`pbs-*`, `mbe-*`) — soporte i18n RTL.
- Recompilación más rápida — mejor DX.

**Conclusión:** Tailwind 4 CSS-first es state-of-the-art. La implementación con `@theme` + design tokens en `layout.css` es la dirección correcta.

#### Component library: shadcn-svelte vs custom primitives

| Solución                    | Pros                                                                                              | Cons                                             | Verdict                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| **shadcn-svelte + bits-ui** | Componentes copiados al codebase (no dependency), WCAG-compliant, themable, full Svelte 5 support | Requiere `bits-ui` (~25KB)                       | ✅ **Recomendado**                      |
| **Melt UI**                 | Headless, bien mantenido                                                                          | Menos componentes que shadcn-svelte              | ⚠️ Alternativa                          |
| **Skeleton UI**             | Componentes listos                                                                                | Más opinionated, menos flexible                  | ⚠️ Menos ideal                          |
| **Flowbite Svelte**         | Familiar para devs de Flowbite                                                                    | Menos Svelte 5 idiomatic                         | ⚠️                                      |
| **Custom desde cero**       | Zero deps, total control                                                                          | Mucho trabajo, riesgo de reinventar la rueda mal | ❌ Solo para primitives muy específicos |

**Recomendación:** usar **shadcn-svelte + bits-ui** para primitives (Button, Modal, Dropdown, Tabs, Toast, Tooltip). Esto ahorra ~200 horas de trabajo y garantiza WCAG compliance.

```bash
pnpm dlx shadcn-svelte@latest init
pnpm dlx shadcn-svelte@latest add button input select modal dropdown tooltip tabs toast
```

**Caveat:** shadcn-svelte requiere Tailwind. Ya está configurado. Funciona con Svelte 5 desde v0.x.

### 6.2 UX patterns de Linear, Jira, Plane, Notion

Analicé los principales competitors para extraer patrones transferibles:

#### Linear.app (la referencia de facto en UX de issue tracking)

**Patrones a adoptar:**

1. **Command palette omnipresente** (`Cmd+K`): acceso a todo sin mouse. AgnosticIssuer debe tener esto desde v0.
2. **Issue IDs como `AGN-123`** (no `0042-fix-...`): el developer los usa en conversaciones. AgnosticIssuer usa `0042-...` por la filesystem convention — pero el editor puede mostrar `#42` como alias visual.
3. **Status pills con color + nombre corto**: el color identifica, el nombre enseña. Mismo approach que el ERS define.
4. **Keyboard shortcut overlay** (`?` muestra todos los shortcuts): onboarding para power users.
5. **Optimistic UI en drag**: el card se mueve instantáneamente, el save es async. Si falla, toast de error + revert.
6. **Auto-save draft** en el editor: el user nunca pierde cambios. Save manual + auto-save cada 10s si dirty.
7. **Inline issue creation** desde el command palette (no desde un wizard).
8. **Empty states con illustration + CTA**: el home screen es un ejemplo.

**Patrones a NO adoptar:**

1. **Linear's complexity:** su UI tiene 20+ views; AgnosticIssuer es más simple por diseño.
2. **Linear's sync engine:** remote mode es read-only en AgnosticIssuer (C-2 constraint).
3. **Linear's pricing/teams:** irrelevante para un tool open-source.

#### Jira (el anti-pattern, aprender del legacy)

**Patrones a NO adoptar:**

1. **Modals sobre modals** (create issue → confirm fields → confirm project → ...). AgnosticIssuer tiene UNA pantalla por modo (local/remote).
2. **Tabs innecesarias** (Details, Comments, History, Work Log, ...). AgnosticIssuer no tiene comments/history/work log (out of scope v1).
3. **Heavy form fields con muchos required asterisks rojos**: usar inline validation más sutil.

#### Plane.so (open source, muy bien diseñado)

**Patrones a adoptar:**

1. **Sidebar layout con cycles + modules**: similar a LeftRail propuesto.
2. **Issue cards con cover image**: NO aplica a AgnosticIssuer (no attachments).
3. **Graph view de relations**: interesante para v2 (mostrar relations como grafo).

#### Notion (block-based editor)

**Patrones a adoptar:**

1. **Markdown-first**: el editor es un textarea con preview tab. NO WYSIWYG — el developer escribe Markdown.
2. **Slash commands** (`/heading`, `/code`): interesante para v2 (quick section insertion).

### 6.3 Tendencias UI 2026 relevantes

Del análisis de tendencias de diseño 2026:

1. **Adaptive interfaces** (interfaces que se ajustan al uso): AgnosticIssuer puede aprender qué vista el user prefiere (List vs Kanban) y ofrecer toggle inteligente.
2. **Spatial depth** (sombras, profundidad): el Kanban drag debe sentirse "físico" — shadow + scale + slight rotation.
3. **AI-native UI** (separación visual de "AI suggestion" vs "confirmed info"): NO aplica a AgnosticIssuer (no AI features).
4. **Dynamic typography** (texto que responde a scroll/interaction): no aplica (la app es funcional, no marketing).
5. **Decision efficiency** (reducir cognitive load): el patrón más importante para AgnosticIssuer. Cada screen debe tener UN objetivo claro.

**Para AgnosticIssuer:** adoptar #1 (adaptive), #2 (depth en drag), #5 (decision efficiency) — ignorar #3 (no AI), #4 (no marketing).

### 6.4 Bibliotecas específicas evaluadas

#### Drag and drop: `svelte-dnd-action`

- ✅ Keyboard-accessible built-in.
- ✅ Compatible con Svelte 5 (verificar versión específica).
- ✅ Touch support (aunque no es target v1, bueno para futuro).
- ⚠️ Bundle size ~15KB.
- ⚠️ API puede ser confusa para casos complejos (nested lists).

**Alternativa:** `@dnd-kit/svelte` (más moderno, mejor TS). Si `svelte-dnd-action` da problemas con runes, migrar.

#### Markdown rendering: `marked` + `DOMPurify` + `shiki`

- ✅ `marked` es pequeño (40KB), extensible, rápido.
- ✅ `DOMPurify` es el estándar de facto para XSS sanitization.
- ⚠️ `shiki` bundle es pesado (~2MB con todos los lenguajes). **Recomendación:** usar `shiki` con lazy loading — solo cargar el bundle del language que el user está viendo.
- **Alternativa lightweight:** `markdown-it` + `prismjs` core + solo el language actual.

**Decisión recomendada:** `marked` + `DOMPurify` (sin shiki para v0; shiki opcional en v1 con lazy loading).

#### Gantt: custom SVG vs library

ERS §5.3 dice: "Custom SVG component — built on plain SVG; no third-party Gantt library."

**Rationale:**

- Libraries de Gantt son pesadas (≥100KB).
- 200 bars + dependency arrows es scope manejable con SVG manual.
- Custom = control total sobre styling, perf, y accessibility.

**Implementación propuesta:**

```typescript
// src/lib/features/gantt-view/lib/layout.ts
// Pure function: issues → bar positions + dependency paths
export function computeLayout(issues: Issue[], config: GanttConfig): GanttLayout {
	// 1. Filter issues with startDate + (endDate | duration)
	// 2. Group by config.group_by
	// 3. Compute x-axis scale (time)
	// 4. Compute y-axis per group (row index)
	// 5. Resolve dependency arrows (avoid overlaps with bezier curves)
}
```

**Performance considerations:**

- Use `<svg viewBox="0 0 W H">` (no `width`/`height` attrs).
- Render with `requestAnimationFrame` para drag/zoom.
- Gantt fallback table (NFR-4) es un `<table>` con la misma data.

---

## 7. Tier S+ Frontend — Síntesis final

### 7.1 Design philosophy statement

> AgnosticIssuer es un tool de productividad para developers. Su UI debe ser **densa pero clara, rápida pero precisa, técnica pero accesible**. Cada píxel debe ganar su lugar — la decoración está prohibida. El developer entra, encuentra lo que busca en <2s, hace su cambio, sale. Sin onboarding modal, sin tooltips invasivos, sin "wizard de bienvenida". El empty state del home es la única onboarding que necesita.

### 7.2 Visual identity (Tier S+)

**Reference visual:** mezcla de Linear (limpio, monoespaciado para metadata) + GitHub Primer (developer-friendly) + Plane (moderna, con depth).

**Características visuales distintivas:**

1. **Mono para IDs y paths:** `font-mono text-xs` — el developer inmediatamente reconoce que es un identificador técnico.
2. **Status pills minimalistas:** `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full` con un dot de 8px del color + nombre del status.
3. **Issue rows como cards low-density:** 36px de altura, hover state sutil (`bg-surface` → `bg-surface-2`).
4. **Top bar con glass effect:** `backdrop-filter: blur(8px)` + `bg-canvas/80` — moderno pero no distrae.
5. **Markdown preview con `prose prose-sm prose-neutral`:** typography plugin de Tailwind para contenido.
6. **Drag en Kanban:** `scale(1.02) rotate(-1deg) shadow-xl` — el card "se levanta" del board.

### 7.3 Tier S+ feature priorities (para Step 6)

#### Must-have (v1 launch)

- [x] Home screen con dos botones grandes + recent folders
- [x] TopBar con mode badge + folder/repo indicator
- [x] LeftRail con view switcher
- [x] List view con sortable columns + filter bar
- [x] Kanban view con drag-and-drop (local mode)
- [x] Gantt view con dependency arrows + fallback table
- [x] Issue editor con Markdown tabs (Write / Preview)
- [x] FieldRenderer que dispatcha por field type
- [x] Validation panel inline
- [x] IntegrityWarning banner (FR-15)
- [x] Light/dark theme toggle
- [x] Keyboard shortcuts core (Cmd+K, Cmd+S, Cmd+N, Esc)
- [x] First-run wizard

#### Should-have (v1.1)

- [ ] Command palette completo (Cmd+K)
- [ ] Recent folders con thumbnails (cached first issue preview)
- [ ] Filter chips persistentes en URL (FR-7)
- [ ] Quick switch entre issues (Cmd+P)
- [ ] Markdown auto-save cada 10s

#### Nice-to-have (v2)

- [ ] AI-assisted issue creation
- [ ] Cycle detection visual en relations panel
- [ ] Issue templates por tipo (no confundir con issue type templates)
- [ ] Bulk operations (select multiple, apply label/status)
- [ ] Custom themes (user-defined color schemes)

### 7.4 Tier S+ quality bar — definition of done

Para que una feature sea "tier S+", debe cumplir:

#### Visual quality

- [ ] Sigue los design tokens (no `bg-[#abc]` hardcoded)
- [ ] Dark mode funciona sin overrides manuales
- [ ] Reduced motion respetado
- [ ] Focus visible en todos los interactivos
- [ ] Hover/focus/active states distintos y consistentes

#### Functional quality

- [ ] Keyboard operable (Tab order lógico, shortcuts documentados)
- [ ] Screen reader friendly (ARIA labels, roles, live regions)
- [ ] Validation inline con mensajes accionables
- [ ] Error states con recovery path (retry button, copy error, etc.)
- [ ] Loading states (no spinner-only — siempre con copy explicativo)
- [ ] Empty states con CTA

#### Performance quality

- [ ] Initial render < 200ms (no async data needed)
- [ ] Interaction latency < 50ms (rune updates son sync)
- [ ] No re-renders innecesarios (usar `$derived` correctamente)
- [ ] Bundle contribution medido (no agregar deps sin weigh-in)

#### Code quality

- [ ] TypeScript strict, sin `any` ni `as` innecesarios
- [ ] Props tipados con interfaces explícitas
- [ ] No business logic en componentes (todo en stores/services)
- [ ] Snippets en lugar de slots (Svelte 5 idiom)
- [ ] `onclick` props en lugar de `on:click` (Svelte 5 idiom)
- [ ] Tests para la lógica no-trivial

### 7.5 Architecture diagram (Tier S+ target state)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ROUTES (SvelteKit pages, thin shells)                              │
│  +page.svelte → composes features, nothing else                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FEATURES (UI composition layer)                                    │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐              │
│  │ Home    │  │ List     │  │ Kanban  │  │ Editor   │ ...          │
│  │ Screen  │  │ View     │  │ View    │  │          │              │
│  └────┬────┘  └────┬─────┘  └────┬────┘  └────┬─────┘              │
│       │            │             │            │                     │
│       └────────────┴─────────────┴────────────┘                     │
│              │ uses                                                │
└──────────────┼──────────────────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STATE (runes-based stores)                                         │
│  mode | folder | repo | issues | templates | config | filters | ... │
└─────────────────────────────────────────────────────────────────────┘
               │                    │
               ▼                    ▼
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│  SERVICES (pure logic)   │  │  ADAPTERS (browser APIs)             │
│  parser | serializer |   │  │  local-fs (FSA) | remote-git |      │
│  validator | slugs |     │  │  memory-fs | handle-store |          │
│  integrity | loaders     │  │  renderer | trash                    │
└──────────────────────────┘  └──────────────────────────────────────┘
               │                    │
               └────────┬───────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TYPES (single source of truth)                                     │
│  Issue | Template | Config | Relation | FrontmatterValue | ...      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Roadmap de implementación

### Step 4 — Adapter layer (recomendado: 2–3 días)

**Orden de implementación (riesgo-decreciente):**

1. **`memory-fs.ts`** primero — para tests, no toca browser APIs. Implementa `DirectoryAdapter` con `Map<string, string>` + `Map<string, Set<string>>`.
2. **`local-fs.ts`** segundo — usa `FileSystemDirectoryHandle`. Feature-detect `showDirectoryPicker`. Atomic writes (write to temp + rename).
3. **`handle-store.ts`** tercero — IndexedDB para persistir handles (claves: `active`, `recent[1..5]`).
4. **`trash.ts`** cuarto — wrapper sobre `DirectoryAdapter.moveFile` con timestamp.
5. **`renderer.ts`** quinto — `marked` + `DOMPurify`. Decision: skip shiki para v0 (deferred a v1.1).
6. **`remote-git.ts`** último (más riesgoso) — `isomorphic-git` + LightningFS. Empezar con public repo (sin PAT), después agregar auth.

**Verificación:** `pnpm check && pnpm lint && pnpm test` (los tests usan MemoryFsAdapter).

### Step 5 — State layer (1–2 días)

**Stores en orden de dependencia:**

1. `theme.svelte.ts` — sin dependencies, enable early.
2. `mode.svelte.ts` — define si estamos en home/local/remote.
3. `folder.svelte.ts` — handle activo + recent list.
4. `repo.svelte.ts` — URL/branch/PAT (PAT en memoria only, NFR-2).
5. `config.svelte.ts` — cargado desde adapter.
6. `templates.svelte.ts` — cargado desde adapter.
7. `issues.svelte.ts` — cargado desde adapter, reactivo a cambios.
8. `filters.svelte.ts` — predicates combinables, URL-sync.
9. `view.svelte.ts` — list/kanban/gantt.
10. `editor.svelte.ts` — issue activo, dirty state, save flow.

### Step 6 — UI layer (5–7 días)

**Orden de implementación (foundation → features):**

1. `src/routes/layout.css` — design tokens (ver §5.2).
2. `src/lib/primitives/ui/Button.svelte` — primer primitive, base para todos los demás.
3. `src/lib/primitives/ui/{Input, Select, Textarea, Toggle}.svelte` — form primitives.
4. `src/lib/primitives/ui/{Modal, Dropdown, Tabs, Tooltip, Toast}.svelte` — overlay primitives.
5. `src/lib/primitives/feedback/{Banner, ErrorState, EmptyState, LoadingState}.svelte`.
6. `src/lib/primitives/layout/{TopBar, LeftRail, MainCanvas, FilterBar, Panel}.svelte`.
7. `src/lib/features/home/HomeScreen.svelte`.
8. `src/lib/features/list-view/ListView.svelte` (con VirtualScroller).
9. `src/lib/features/kanban-view/KanbanView.svelte` (con `svelte-dnd-action`).
10. `src/lib/features/gantt-view/GanttView.svelte` (custom SVG).
11. `src/lib/features/editor/IssueEditor.svelte` (con FieldRenderer).
12. `src/lib/features/wizard/FirstRunWizard.svelte`.
13. Routes: `+page.svelte` (home) + `local/{list,kanban,gantt,issues/[id]}` + `remote/...`.

### Step 7 — Tests (2–3 días)

**Prioridad:**

1. Service layer unit tests (parser round-trip, validator cycle detection, slugs, integrity, loaders).
2. MemoryFsAdapter integration tests.
3. Renderer tests (XSS payloads).
4. e2e Playwright: home → open folder → create issue → save → re-open.

### Step 8 — Verificación (1 día)

1. `pnpm check` — 0 errors.
2. `pnpm lint` — 0 errors (fix Prettier tables en `AGENTS.md` + `docs/ers.md`).
3. `pnpm test` — all pass.
4. `pnpm build` — succeeds.
5. Manual smoke test (con `docs/ers.md` Appendix B example).
6. Lighthouse audit en `pnpm preview` — target ≥ 95 en Performance/Accessibility/Best Practices.

---

## 9. Checklist de verificación

### Pre-Step 4 (antes de empezar a codear)

- [ ] Fix `AGENTS.md` línea 20 y 50 (`adapter-auto` → `adapter-static`)
- [ ] Agregar `"engines": { "node": ">=20" }` a `package.json`
- [ ] Crear `.env.example` (vacío por ahora, evita deuda futura)
- [ ] Decidir `shiki` vs `highlight.js` vs `marked` solo → **decisión recomendada: marked + DOMPurify sin shiki para v0**
- [ ] Crear branch `step-4-adapters` desde `main`
- [ ] Agregar dependencias: `marked`, `dompurify`, `isomorphic-git`, `@isomorphic-git/lightning-fs`
- [ ] Agregar `pnpm dlx shadcn-svelte@latest init` y configurar `bits-ui`

### Step 4 done when

- [ ] `src/lib/adapters/{local-fs,memory-fs,handle-store,trash,renderer,remote-git}.ts` existen
- [ ] `pnpm check` pasa
- [ ] `pnpm test` pasa con tests básicos del adapter layer
- [ ] `LocalFsAdapter` puede leer un folder de prueba y listar `.agnostic-issuer/`
- [ ] `MemoryFsAdapter` implementa todos los métodos del interface
- [ ] `handle-store` persiste y recupera handles correctamente
- [ ] `renderer.ts` produce HTML sanitizado (probar con `<script>alert(1)</script>` → strip)

### Step 5 done when

- [ ] Todos los stores en `src/lib/state/*.svelte.ts` existen
- [ ] `pnpm check` pasa
- [ ] Stores pueden ser importados en un componente de prueba y usados
- [ ] `theme` store aplica el theme class al `<html>` element
- [ ] `folder` store persiste handles correctamente via `handle-store`
- [ ] `issues` store se hidrata desde `loadIssues(adapter)` y es reactivo

### Step 6 done when

- [ ] Todas las rutas en `src/routes/` existen
- [ ] Home screen funciona end-to-end (open folder → load → display)
- [ ] List view renderiza 1000 issues en < 500ms
- [ ] Kanban view permite drag (local mode) y es read-only (remote mode)
- [ ] Gantt view renderiza 200 bars + arrows en < 200ms
- [ ] Editor guarda un issue (con todos los field types)
- [ ] Validation panel muestra errores inline
- [ ] IntegrityWarning banner aparece cuando `integrity_hash` no match
- [ ] Light/dark theme funciona, persiste en localStorage
- [ ] Keyboard shortcuts core funcionan (`Cmd+K`, `Cmd+S`, `Cmd+N`, `Esc`)
- [ ] WCAG 2.1 AA: axe-core audit pasa con 0 violations

### Step 7 done when

- [ ] Coverage de service layer ≥ 90%
- [ ] Coverage de adapter layer ≥ 70%
- [ ] e2e tests pasan en Chromium
- [ ] Round-trip test: parse → serialize → parse produce mismo Issue

### Step 8 done when

- [ ] `pnpm check` — 0 errors, 0 warnings
- [ ] `pnpm lint` — 0 errors
- [ ] `pnpm test` — all pass
- [ ] `pnpm build` — succeeds
- [ ] Manual smoke test con `docs/ers.md` Appendix B.6 example
- [ ] Lighthouse: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95

---

## Apéndice A — Pre-flight fixes (agregar a un commit separado antes de Step 4)

```diff
# package.json
+ "engines": { "node": ">=20" }

# AGENTS.md línea 20 y 50
- adapter-auto
+ adapter-static

# .gitignore (verificar)
+ .env
+ .env.*
+ !.env.example
+ !.env.test
```

## Apéndice B — Dependencias a agregar

```bash
pnpm add marked dompurify isomorphic-git @isomorphic-git/lightning-fs
pnpm add -D @types/dompurify
pnpm dlx shadcn-svelte@latest init
pnpm dlx shadcn-svelte@latest add button input select textarea modal dropdown tooltip tabs toast toggle
pnpm add -D eslint-plugin-boundaries  # enforce layer rules
```

## Apéndice C — Bibliografía y referencias

- ERS: `docs/ers.md` (v1.0.0)
- Status: `docs/current-project-status.md`
- Audit: `docs/requirements-audit.md`
- AGENTS.md: `/AGENTS.md`
- SvelteKit docs: <https://svelte.dev/docs/kit>
- Svelte 5 docs: <https://svelte.dev/docs/svelte>
- Tailwind 4 docs: <https://tailwindcss.com/docs>
- shadcn-svelte: <https://www.shadcn-svelte.com>
- isomorphic-git: <https://isomorphic-git.org>
- FSA API: <https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API>
- WCAG 2.1: <https://www.w3.org/WAI/WCAG21/quickref/>

---

_Documento generado por Mavis (MiniMax) — orquestación multi-skill de design-consultation + brainstorming + sveltekit-structure + ui-ux-pro-max + deep-research._
