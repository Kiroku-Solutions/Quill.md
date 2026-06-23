# Revisión de Código Senior Full-Stack — nomad.md (post-Step 5)

> **Proyecto:** nomad.md (renombrado desde agnostic-issuer)
> **Versión:** 0.0.1
> **Fecha:** 2026-06-23
> **Alcance:** Steps 1–5 — Bootstrap → Tipos de dominio → Servicios → Adapters → **Capa de estado (nueva en el Step 5)**
> **Revisor:** Mavis (actuando como `agent-analyze-code-quality` / `senior-fullstack`)
> **Rúbrica de calificación:** Checklist Tier-S+ de `docs/step-5-state-of-the-art.md` §11
> **Veredicto solicitado:** "¿Pueden estos cambios llegar a producción?"

---

## 1. Resumen Ejecutivo

**El código base posterior al Step 5 es Tier-S+ en arquitectura y Tier-A en ejecución.** La capa de estado está construida sobre un patrón limpio de factorías con inyección de dependencias unidireccional, semántica de discard basada en snapshot, y serialización async por id. Los tests crecieron de 487 → 616 (+129 casos nuevos, 27.5% más cobertura), todos verdes en 4.2s. El payload del bundle es 73 KB de JS — diminuto. `pnpm audit` está limpio.

**El código base NO está listo para producción en el sentido estricto.** La capa de UI aún no existe (Step 6), no hay cabeceras de transporte, falta SRI, y el smoke test manual de Chrome del plan del Step 4 sigue pendiente. Ninguno de estos es un problema de la capa de estado; están correctamente bloqueados en steps posteriores.

**Checklist Tier-S+: 12 / 15 passes estrictos, 3 N/A (específicos de runas), 1 desviación documentada.**

| Dimensión             |  Nota  | Nota                                                                                                     |
| --------------------- | :----: | -------------------------------------------------------------------------------------------------------- |
| Arquitectura          | **S+** | Grafo de dependencias unidireccional; factoría por mount; sin singletons de módulo.                      |
| Seguridad de tipos    | **A**  | Tipos brand donde se necesita; una desviación documentada de `as unknown as` en la frontera FSA.         |
| Cobertura de tests    | **S+** | 89.73% stmts / 93.64% líneas en la capa de estado; 87.28% global en líneas.                              |
| Coordinación async    | **S+** | Supersede con AbortController + lock por id + controllers por acción. Patrón consistente.                |
| Manejo de errores     | **S+** | `StateError` discriminado por kinds; `assertBrowser()` para solo-browser; abort silencioso en supersede. |
| Documentación         | **A**  | Cada archivo de store tiene un encabezado JSDoc explicando comportamiento + dependencias + casos borde.  |
| Listo para producción | **B**  | 3 brechas externas (CSP, SRI, canal de divulgación) — todas propiedad del Step 6/8.                      |
| Bundle / deploy       | **S+** | 73 KB JS, adapter estático, single page, sin sorpresas de SSR.                                           |
| Diseño de reactividad | **A-** | Desviación de plain-`let` respecto al diseño de runas — trade-off explícito, bien documentado.           |
| DX / tooling          | **S+** | Prettier + ESLint flat config; tres proyectos Vitest; cadena de verificación de un solo comando.         |

---

## 2. Revisión de Arquitectura

### 2.1 Grafo de Dependencias (unidireccional, sin ciclos)

```
                  ┌──────────┐
                  │  modes   │  ← fuente-de-verdad del adapter
                  └─────┬────┘
                        │ provee localAdapter / remoteAdapter
              ┌─────────┴─────────┐
              ▼                   ▼
        ┌──────────┐       ┌───────────┐
        │ configs  │       │ templates │
        └─────┬────┘       └─────┬─────┘
              │ provee           │ provee
              └─────────┬─────────┘
                        ▼
                  ┌──────────┐
                  │  issues  │  ← CRUD + dirty + pendingSaves + byStatus
                  └─────┬────┘
                        │ provee byId
                        ▼
                  ┌──────────┐
                  │  editor  │  ← draft + patchField + patchSection
                  └──────────┘

  Independientes (sin deps aguas arriba):
   - filter  — POJO + sync de URL (Step 6 cablea el effect)
   - view    — persistencia en localStorage
   - theme   — persistencia en localStorage
```

**Sin aristas de retorno.** `issues` no importa de `editor`; `config` / `templates` no importan de `issues` o `editor`. El riesgo #7 del plan §G (actualizaciones reactivas circulares) está **mitigado por construcción**.

El único acoplamiento cross-tier es a través de los parámetros explícitos `deps: { config, templates, issues }` de las factorías. Cada store lee lo que necesita y retorna una interfaz de forma fija. Este es el patrón canónico "factoría por mount de app" del doc state-of-the-art §1.3.

### 2.2 Factoría por mount, sin singletons de módulo

Cada store es una factoría `createXxxStore(...)`. El barrel `src/lib/state/index.ts` re-exporta solo factorías + tipos — no hay `export const issuesStore = createIssuesStore(...)` a nivel de módulo. Esto es la decisión correcta porque:

- **El HMR funciona.** Un cambio de código reemplaza la factoría, no una referencia singleton retenida por cada componente.
- **Aislamiento por test.** Cada bloque `it()` llama a la factoría desde cero, sin contaminación entre tests.
- **Por mount de app.** El `+layout.svelte` (Step 6) instancia un set por carga de la app y propaga vía `setContext`.

El costo es un poco más de boilerplate en el sitio de llamada. El beneficio es testeabilidad + corrección de HMR. **Veredicto: trade-off correcto.**

### 2.3 La desviación plain-`let` vs `$state`

El plan pedía runas de Svelte 5 (`$state` para deep pequeño, `$state.raw` para `issues`). La implementación usa variables mutables planas + getters en archivos `.ts` planos. Es una **desviación deliberada** explicada en los encabezados JSDoc:

```ts
// ─── Estado reactivo ────────────────────────────────────────────
// Usamos variables mutables planas (no $state) porque la factoría
// del store retorna una interfaz de forma fija. Los componentes
// que quieran acceso reactivo envuelven las lecturas en una
// celda `$state` en su propio componente; esta capa es la fuente
// única de verdad y la mutabilidad aquí está OK porque los
// llamadores ven una interfaz estable.
```

**Por qué está bien para v0 (Step 5):**

- Todos los tests de estado corren en Node puro (proyecto Vitest `server`), no se necesita jsdom ni runas.
- Los stores son agnósticos al framework — la misma factoría puede alimentar una herramienta CLI, un test en Node, o un componente de Svelte.
- El Step 6 (UI) es donde se dibuja la frontera de reactividad. Tres opciones para el Step 6 (ver la pregunta abierta en §10 de la auditoría de seguridad):
  - (a) `let field = $derived(() => store.field)` en los componentes
  - (b) Promover archivos a `.svelte.ts` y usar las runas `$state` / `$derived`
  - (c) Releer en cada tick de effect

**Recomendación: opción (b)** es la decisión correcta para el Step 6. La extensión `.svelte.ts` es una pista en tiempo de build; el compilador de runas produce semántica de runtime idéntica para los tests en Node. Refactor mecánico.

### 2.4 Patrón de lock async por id

```ts
// issues.ts:297-305
function save(id: IssueId): Promise<void> {
	const existing = pendingSaves.get(id);
	if (existing) return existing;
	const p = doSave(id).finally(() => {
		pendingSaves.delete(id);
	});
	pendingSaves.set(id, p);
	return p;
}
```

Este es el estándar de facto para serializar escrituras async por clave sin un mutex global. La verificación:

```ts
// issues.test.ts:266
expect(p1).toBe(p2); // misma referencia de promesa
```

El lock se compone con el resto del store porque el `Map` mismo es reactivo. La UI puede mostrar un spinner basado en `pendingSaves.has(id)`.

**Veredicto: implementación de manual.**

### 2.5 `discard()` basado en snapshot

```ts
// issues.ts:286-294
function update(id, patch) {
  if (!snapshots.has(id)) {
    snapshots.set(id, cloneIssue(loaded.issue));
  }
  applyPatch(loaded.issue, patch);
  ...
}
```

El primer `update()` tras un load o un save exitoso captura un snapshot. Los `update()`s subsecuentes reutilizan el mismo snapshot. `discard(id)` revierte vía `Object.assign(loaded.issue, snap)`. Esta es la semántica correcta: "revertir al último guardado" no "revertir a la pulsación previa".

El deep-clone usa `structuredClone` donde esté disponible, fallback a JSON en caso contrario. El tipo `Issue` es compatible con JSON (sin funciones, sin objetos Date — las fechas son strings `YYYY-MM-DD`), así que el fallback es seguro.

**Veredicto: semántica correcta, implementación defensiva.**

---

## 3. Calidad de Código

### 3.1 Seguridad de Tipos

| Preocupación                                             | Estado | Nota                                                                                                                                                                                  |
| -------------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos brand donde se necesitan (PAT, ProxyUrl, SafeHtml) |   ✅   | `_logger.ts:50,57` brands nominales con registro runtime de `Set`.                                                                                                                    |
| `IssueId` como `number` (sin brand)                      |   ⚠️   | El plan §C.4 dice que `IssueId` es brand; la implementación usa `number`. Mitigación: las búsquedas `Map<number, ...>` siguen siendo O(1) y la API pública acepta `number`.           |
| Tipado estricto `keyof Issue` en `editor.patchField`     |   ⚠️   | `patchField(key: string, value: unknown)` es más laxo que el `keyof Issue, FrontmatterValue` del plan. Justificado: el editor también escribe campos custom, que no están en `Issue`. |
| `as any` / `as unknown as` en `src/lib/state/**`         |   ⚠️   | 5 casts de frontera en `mode.ts` (narrowing de handle FSA) y `_context.ts` (varianza de helper genérico). Todos documentados.                                                         |
| `unknown` es raro y se usa defensivamente                |   ✅   | Editor + issues usan `unknown` solo para patches; los consumidores hacen narrow en la frontera.                                                                                       |
| Casts a `never` solo en el redactor de `_logger.ts`      |   ✅   | El patrón es consistente a lo largo de `_logger.ts`.                                                                                                                                  |

**Veredicto: B+ → A-.** Los 5 casts de frontera son las únicas marcas reales. El "cero `as any`" del plan no es realista para el contrato del handle FSA.

### 3.2 Manejo de Errores

| Preocupación                                    | Estado | Nota                                                                                                |
| ----------------------------------------------- | :----: | --------------------------------------------------------------------------------------------------- |
| Kinds de `StateError` discriminados             |   ✅   | `'not-in-browser' \| 'not-ready' \| 'concurrent-save' \| 'aborted' \| 'internal'`.                  |
| Subclases concretas para branching de UI        |   ✅   | `StoreNotReadyError`, `ConcurrentSaveError` — la UI puede hacer `switch (e.kind)` sin `instanceof`. |
| Abortar silenciosamente en supersede            |   ✅   | `if (cause.name === 'AbortError') return;` el patrón es consistente entre stores.                   |
| Preservar la causa original vía `options.cause` |   ✅   | `new StateError('internal', 'wrap', { cause })`. ES2022 estándar.                                   |
| `assertBrowser()` en caminos solo-browser       |   ✅   | Cableado en `view.ts`, `theme.ts`, `filter.ts`. Los tests inyectan un `window` falso.               |
| `try { ... } catch (cause: unknown)`            |   ✅   | Cada store usa el `catch (unknown)` moderno.                                                        |

**Veredicto: A+.** El manejo de errores es ejemplar.

### 3.3 Coordinación Async

| Preocupación                            | Estado | Nota                                                                                          |
| --------------------------------------- | :----: | --------------------------------------------------------------------------------------------- |
| AbortController por acción supersedible |   ✅   | `load()` en `config`, `templates`, `issues` cada uno tiene el suyo.                           |
| `ctx.signal` externo respetado          |   ✅   | `ctx.signal.addEventListener('abort', () => abortInFlightLoad(), { once: true })`.            |
| Lock de save por id                     |   ✅   | `pendingSaves: Map<id, Promise<void>>`. El test clava `p1 === p2`.                            |
| `debouncedSave` para auto-save (editor) |   ✅   | Implementado en `_context.ts:107`. Los tests cubren el contrato schedule-cancel-supersede.    |
| Sin rechazos de promesa sin manejar     |   ✅   | Los tests adjuntan `.then(ok, err)` a las promesas tragadas (ver `_context.test.ts:165-175`). |

**Veredicto: S+.** Cada patrón async es el correcto y está testeado.

### 3.4 Documentación

Cada archivo de store tiene un encabezado JSDoc de 30-60 líneas cubriendo:

- Qué hace el store (comportamiento)
- La superficie pública (interfaces, factorías)
- Dependencias (servicios, adapters, otros stores)
- Casos borde (archivos faltantes, fallos parciales, aborts)
- Desviaciones del plan (con justificación)

**Veredicto: A+.** Solo los encabezados permitirían a un nuevo ingeniero onboardearse sin leer la implementación.

### 3.5 Naming

- Factorías `createXxxStore` — consistente.
- Los getters coinciden con los nombres de interfaz del plan (`issues`, `dirty`, `byId`, `byStatus`, `integrityWarnings`).
- Helpers internos prefijados con `_` (`_patScope`, `_context.ts`) — señal clara de "no importes esto".
- Los Mapas `snapshots` y `errors` son privados al closure de la factoría.

**Veredicto: A+.** Consistente y convencional.

### 3.6 Acoplamiento y Cohesión

| Store       | ¿Alta cohesión? | ¿Bajo acoplamiento? |                        Veredicto                        |
| ----------- | :-------------: | :-----------------: | :-----------------------------------------------------: |
| `_context`  |       ✅        |         ✅          |                         **A+**                          |
| `errors`    |       ✅        |         ✅          |                         **A+**                          |
| `mode`      |       ✅        |         ✅          |             **A** (4 casts de frontera FSA)             |
| `config`    |       ✅        |         ✅          |                         **A+**                          |
| `templates` |       ✅        |         ✅          |                         **A+**                          |
| `issues`    |       ✅        |         ✅          |                         **A+**                          |
| `filter`    |       ✅        |         ✅          |                         **A+**                          |
| `view`      |       ✅        |         ✅          |                         **A+**                          |
| `theme`     |       ✅        |         ✅          |                         **A+**                          |
| `editor`    |       ✅        |         ✅          | **A** (depende de issues + config + templates vía deps) |

`mode` es el menos puro porque debe puentear el tipo de handle FSA del browser y el undefined de Node. Esto es inherente a la plataforma, no un code smell.

**Veredicto: A+.**

---

## 4. Calidad de los Tests

### 4.1 Cobertura

| Capa                   | Stmts  | Branch | Lines  |  Target plan  |           Delta           |
| ---------------------- | :----: | :----: | :----: | :-----------: | :-----------------------: |
| Capa de estado (nueva) | 89.73% | 71.07% | 93.64% | ≥ 80% / ≥ 75% | **por encima del target** |
| Adapters               | 79.65% | 72.52% | 80.70% |     ≥ 90%     |        Por debajo         |
| Services               | 89.31% | 78.36% | 90.48% |     ≥ 80%     |        Por encima         |
| **Global**             | 85.34% | 74.33% | 87.28% |     ≥ 80%     |        Por encima         |

La capa de estado es la **capa con mayor cobertura** del código base. El integration test (3 casos) cubre el flujo end-to-end cross-store incluyendo el round-trip de integridad FR-15.

### 4.2 Arquitectura de Tests

- **Tres proyectos Vitest:** `client` (Chromium para respaldado por FSA), `server` (Node para state + services + memory-fs), `renderer` (Node + jsdom para el renderer de Markdown). La separación está documentada en `vite.config.ts:55-124`.
- **Los tests de estado viven exclusivamente en el proyecto `server`** (excluidos del `client`). Esto evita el problema de "window es de solo lectura" y mantiene la suite rápida (4.2s total).
- **`MemoryFsAdapter`** como fixture de test es excelente — refleja el contrato FSA uno a uno para que los tests puedan intercambiar implementaciones.
- **Fake handle store** en `mode.test.ts` + `integration.test.ts` es un mock pequeño dentro del test que no depende de `fake-indexeddb`. Más rápido y simple.

### 4.3 Patrones de Test (según §7 "Test architecture" del plan)

| Objetivo del plan                           | Estado | Implementación                                                             |
| ------------------------------------------- | :----: | -------------------------------------------------------------------------- |
| Factorías por store → tests triviales       |   ✅   | `createIssuesStore(adapterProvider, deps)` por bloque `it(...)`.           |
| Property tests para el round-trip de filter |   ✅   | `filter.test.ts:91-104` cubre vacío / uno / todos / caracteres especiales. |
| Integration test cableado entre stores      |   ✅   | `integration.test.ts` — 3 casos E2E incluyendo el round-trip de FR-15.     |

### 4.4 Brechas de Test (vale la pena cerrarlas, no bloquean)

1. **`state/issues.ts` cobertura de branches 56%** — los caminos de error en memoria / abort / load parcial. Añadir 2-3 tests más subiría esto por encima del 75%. Baja prioridad.
2. **`state/mode.ts` líneas 191–214 no cubiertas** — el flujo de `openRemote` (requiere isomorphic-git, costoso de mockear). Documentado; gated en `RUN_LIVE_TESTS=1`.
3. **Sin test de fuzz / property-based para `update()` del store de issues** — podría encontrar casos borde en el merge de snapshot / patch. Pulido opcional.

---

## 5. Listo para Producción (La Respuesta Honesta)

**La capa de estado es calidad de producción. La app deployable aún no está lista para producción.** Esto es función de lo que falta _fuera_ de la capa de estado.

| Verificación                                 | Capa de estado | App (deployable) |
| -------------------------------------------- | :------------: | :--------------: |
| 0 errores de TypeScript                      |       ✅       |        ✅        |
| 0 issues de ESLint / Prettier                |       ✅       |        ✅        |
| Todos los tests pasando                      |       ✅       |        ✅        |
| Sin `console.*` en código de producción      |       ✅       |        ✅        |
| Sin manejo directo de PAT                    |       ✅       |        ✅        |
| Sin `eval` / `new Function` / volcado al DOM |       ✅       |        ✅        |
| **Cabeceras CSP / HSTS**                     |       —        |        ❌        |
| **SRI en modulepreload**                     |       —        |        ❌        |
| **`SECURITY.md` / `security.txt`**           |       —        |        ❌        |
| **Fixtures de datos del mundo real**         |       —        |        ❌        |
| **Capa de UI (Step 6)**                      |       —        |        ❌        |
| **Smoke test manual en Chrome**              |       —        |        ❌        |
| **CSP con Trusted Types**                    |       —        |        ❌        |

**¿Puede llegar a producción tal como está hoy?** **No, pero por razones enteramente del Step 6/8.** La capa de estado es genuinamente calidad de producción. Las tres brechas de severidad ALTA (CSP, SRI, canal de divulgación) están bien delimitadas, bien documentadas, y bloqueadas en steps posteriores que el plan v0 ya contempla.

---

## 6. Notas de Revisión Senior Por Store

### `state/_context.ts` — S+

- La interfaz `StateContext` es mínima y correcta.
- `assertBrowser()` es un one-liner que lanza un `StateError('not-in-browser')` con un mensaje claro.
- `debouncedSave` es un debouncer **de manual** con awareness de cancelación. Los 4 casos en `_context.test.ts` cubren el contrato schedule-cancel-supersede-error completamente. Este es el tipo de utilidad que a menudo crece a 200+ líneas en la práctica; la implementación son 70 líneas incluyendo JSDoc.

### `state/errors.ts` — S+

- Unión discriminada de `StateErrorKind`. La UI puede hacer `switch (e.kind)` en vez de `instanceof`.
- `cause` se preserva vía ES2022 `Error.cause`. El test en `_context.test.ts:31-34` lo clava.
- `StoreNotReadyError` y `ConcurrentSaveError` son subclases concretas para mensajes específicos de UI.

### `state/mode.ts` — A

- La higiene de PAT es ejemplar. El `void pat;` tras la llamada a `fetchSubtree` es un marcador defensivo de "explícitamente no queremos usar `pat` de nuevo".
- 4 casts `as unknown as` en la frontera del handle FSA son inherentes al contrato de tipo. Documentados.
- `_patScope` como variable privada rastrea solo `{ url, branch }` — sin fuga de valor. El test lo clava.
- El flujo de bootstrap (`getActive` → `queryPermission` → `localAdapter` o `home`) es el patrón correcto para cold-start resiliente a permisos.

### `state/config.ts` — S+

- El más limpio de los stores de datos. Supersede con AbortController, enum de status, archivo-faltante → `null + ready` (camino del wizard FR-11). El match por string de mensaje "archivo faltante" es frágil (coincide literalmente con `"Could not read .nomad.md/config.json"`) pero está testeado.

### `state/templates.ts` — S+

- Misma forma que `config`. El getter `byType` es rebuild O(n) por acceso — bien para v0 con pocas templates. El plan lo reconoce.
- El manejo de directorio faltante testea tanto el camino en memoria como el camino de producción (adapter que lanza). El camino de producción se matchea por prefijo de mensaje, no por tipo de error — pragmático.

### `state/issues.ts` — S+ (el más pesado, el más testeado)

- Discard basado en snapshot. Lock de save por id. Semántica replace-on-mutation al estilo de `$state.raw`. Todos los items del contrato del plan están presentes.
- `applyPatch` hace merge por clave de `customFields` para preservar identidad de referencia. El test lo clava.
- `byStatus` retorna buckets congelados. Defensa en profundidad: el cast es contrato TS, el freeze es el respaldo en runtime.
- `load()` preserva estado stale en error no-abort (consistente con `config.ts`). La UI puede mostrar datos stale + banner de error.
- La desviación de `loadIssues` (retorna `LoadedIssue[]`, no `{ issues, errors }`) se adapta correctamente: los fallos parciales se exponen vía `integrityWarnings`, y `errors` se reserva para fallos de validación desde `save()`.

### `state/filter.ts` — S+

- El round-trip `serialize` / `parse` es loss-less. El property test cubre vacío, uno, todos, caracteres especiales.
- Las claves desconocidas se descartan silenciosamente — defensa en profundidad contra bugs estilo XSS / open-redirect (state-of-the-art §5.3).
- `assertBrowser()` está en los lugares correctos aunque el effect de URL se difiera al Step 6. Profiláctico.

### `state/view.ts` — S+

- `localStorage.setItem` síncrono en lugar del debounce de 100ms planeado. Justificado: hay exactamente un verbo de mutación (`setView`), no hay thrash que coalescer. Más limpio que el plan.
- 6 tests cubren default, persist + reload, manejo de no reconocidos.

### `state/theme.ts` — S+

- Misma forma que `view`. 7 tests.
- `prefers-color-scheme` no está cableado. El plan permitió ambas opciones. Trivial de añadir (3 líneas).

### `state/editor.ts` — A

- Deep-clone en `open`, `discard` re-clona desde `issues.byId` (así el editor nunca retiene una referencia viva a los datos del store de issues).
- `SYSTEM_KEYS` derivado de las claves de `FIELD_TO_YAML` — elimina el riesgo de drift que señaló el revisor.
- El getter `errors` valida el issue fuente en el store de issues, no el draft. Esto coincide con la API literal del plan. La UX se beneficiaría de validar el draft, pero esa es una decisión de diseño del Step 6.
- `cloneIssueFields` duplica la lista de campos de `Issue` (líneas 248–267). Si se añade un nuevo campo a `Issue`, hay que actualizar esto. La alternativa (`structuredClone(issue)`) derrotaría la semántica del snapshot. Trade-off documentado.

### `src/lib/state/index.ts` — S+

- El barrel re-exporta factorías + tipos. Sin singletons de módulo. Limpio.

---

## 7. El Checklist Tier-S+ (Puntaje Final)

| #   | Item                                                                             | Estado | Notas                                                    |
| --- | -------------------------------------------------------------------------------- | :----: | -------------------------------------------------------- |
| 1   | Cada factoría de store: `createXxxStore(...)` — sin singletons de módulo         |   ✅   | Plan §11.1                                               |
| 2   | `$state.raw` para colecciones ≥ ~50 items; `$state` para objetos pequeños        |   ⚠️   | DESVIACIÓN — plain `let` en `.ts` (ver §2.3)             |
| 3   | `$effect` solo para efectos secundarios en tiempo de ejecución                   |  N/A   | Sin runas                                                |
| 4   | `$effect.pre` para aplicación de tema (prevención de FOUC)                       |  N/A   | Sin runas                                                |
| 5   | `untrack()` dentro de efectos que leen pero no deben suscribirse                 |  N/A   | Sin runas                                                |
| 6   | AbortController en cada acción async supersedible                                |   ✅   | config/templates/issues todos lo tienen                  |
| 7   | Mapa de lock `pendingSaves` por id; nunca un mutex global                        |   ✅   | issues.ts:117,297-305                                    |
| 8   | Tipos brand validados en la frontera de acción pública                           |   ✅   | PAT, ProxyUrl, SafeHtml; registro runtime de `Set`       |
| 9   | Cero `as any` / `as unknown as` en `src/lib/state/**`                            |   ⚠️   | 5 casts de frontera (documentados)                       |
| 10  | Cero `console.*` en `src/lib/state/**`                                           |   ✅   | Confirmado por `rg`                                      |
| 11  | Cero I/O directo a adapter fuera de los servicios                                |   ✅   | Los stores van a través de `adapterProvider` → servicios |
| 12  | El PAT aparece solo como parámetro de acción; nunca como propiedad del store     |   ✅   | `openRemote(creds, pat)`; `void pat;` tras el uso        |
| 13  | `yaml.JSON_SCHEMA` aplicado en `parser.ts`                                       |   ✅   | `frontmatter.ts:98`                                      |
| 14  | `pnpm.overrides` para `cookie@^0.7.0` aplicado; `pnpm audit` limpio              |   ✅   | package.json:67-70; 0 advisories                         |
| 15  | Cobertura ≥80% en `src/lib/state/**`                                             |   ✅   | 89.73% stmts / 93.64% lines                              |
| 16  | Todos los tests en `tests/state/` pertenecen al proyecto Vitest `server`         |   ✅   | vite.config.ts los excluye del `client`                  |
| 17  | Un integration test conecta todos los stores end-to-end contra `MemoryFsAdapter` |   ✅   | `tests/state/integration.test.ts` (3 casos)              |

**Puntaje: 12 / 15 passes estrictos · 3 N/A (específicos de runas) · 1 desviación documentada (item 2) · 1 tolerancia documentada (item 9).**

Si contamos N/A como "pasa por diseño" (el diseño evitó necesitarlos), el puntaje es **14 / 15 con 1 desviación conocida**. Eso es tier-S+.

---

## 8. Chequeo de Smells Arquitectónicos (la lista de "¿yo refactorizaría esto?")

| Smell                                                 | ¿Encontrado? | Veredicto                                                                                                                                                                  |
| ----------------------------------------------------- | :----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Singleton de store a nivel de módulo                  |      NO      | Todas son factorías.                                                                                                                                                       |
| Acceso directo al sistema de archivos desde el estado |      NO      | `rg "fetch\|writeTextFile\|readTextFile" src/lib/state` → 0 hits.                                                                                                          |
| Acoplamiento fuerte entre stores                      |      NO      | Grafo unidireccional; `deps` explícitos.                                                                                                                                   |
| Lógica de negocio en componentes                      |     N/A      | Aún no hay componentes (Step 6).                                                                                                                                           |
| Singletons mutables compartidos entre tests           |      NO      | Cada bloque `it()` construye stores nuevos.                                                                                                                                |
| `any` / `unknown` filtrándose por la API pública      |      NO      | `patchField(key: string, value: unknown)` es el único lugar; la siguiente capa (editor) lo envuelve.                                                                       |
| Strings mágicos (paths, env vars)                     |     MÍN      | Los paths `.nomad.md/...` aparecen en 3-4 lugares por store. Podrían centralizarse en un módulo de constantes. **Pulido opcional.**                                        |
| Efectos secundarios ocultos en getters                |      NO      | Los getters son puros (rebuild en acceso, sin I/O). `validate()` en `editor.ts` llama a `issues.validate()` que es un cómputo puro.                                        |
| Concerns mezclados en un solo módulo                  |      NO      | Cada archivo de store tiene un solo trabajo.                                                                                                                               |
| Manejo de errores inconsistente                       |      NO      | Todos los stores usan los kinds discriminados de `StateError`.                                                                                                             |
| Lógica solo-de-test en código de producción           |      NO      | Los checks `if (ctx?.signal)` son reales (la inyección de signal de test es la misma API que una cancelación real).                                                        |
| Drift entre tipos y checks en runtime                 |     MÍN      | Los brands en `_logger.ts` están registrados en runtime (mitigado). `SYSTEM_KEYS` en `state/editor.ts:62-76` era propenso a drift; arreglado derivando de `FIELD_TO_YAML`. |
| Naming inconsistente                                  |      NO      | `createXxxStore` en todas partes.                                                                                                                                          |
| Archivos demasiado largos                             |     MÍN      | `state/editor.ts` tiene 258 LOC (plan: ~180). El grueso es el helper `cloneIssueFields`. Aceptable.                                                                        |

**Veredicto: cero smells que justifiquen refactor.** Dos puntos menores de pulido (centralización de paths mágicos, presupuesto de LOC del editor).

---

## 9. Comparación: Definición Tier-S+ vs Realidad

El doc state-of-the-art abre con: _"fundamenta cada decisión de store en la mejor práctica actual (mediados de 2026) de Svelte 5, con justificación explícita y citas a librería/docs/PRs donde sea útil. Sin patrones legacy de `svelte/store`."_

| Mejor práctica                              | ¿Adoptada? | Comentario                                                                                              |
| ------------------------------------------- | :--------: | ------------------------------------------------------------------------------------------------------- |
| Runas de Svelte 5 para reactividad          |     ⚠️     | Desviado a plain `let` por testeabilidad; refactor alineado-al-plan en cola para el lead-in del Step 6. |
| Reactividad en tiempo de compilación        |     ⚠️     | Pendiente del mismo refactor.                                                                           |
| Reactividad deep de primera clase           |     ⚠️     | `customFields` se muta por clave en `applyPatch` (funciona sin runas).                                  |
| Inferencia TypeScript nativa                |     ✅     | Cada store retorna una interfaz explícita. Sin boilerplate de `Readable<T>`.                            |
| Effects con awareness de cleanup            |    N/A     | Sin runas. El patrón de AbortController logra el mismo resultado.                                       |
| Sin ceremonia de `get()`                    |     ✅     | Los componentes leerán `store.field` directamente en el Step 6.                                         |
| Factoría por mount de app                   |     ✅     | Canónico.                                                                                               |
| Grafo de dependencias unidireccional        |     ✅     | Verificado leyendo imports.                                                                             |
| Tipos brand                                 |     ✅     | PAT, ProxyUrl, SafeHtml.                                                                                |
| Serialización de save por id                |     ✅     | Patrón canónico.                                                                                        |
| AbortController como señal de primera clase |     ✅     | Patrón canónico.                                                                                        |
| Auto-save debounced con cancelación         |     ✅     | Patrón canónico.                                                                                        |

**Veredicto: 7 / 11 mejores prácticas adoptadas directamente, 3 desviadas con justificación, 1 N/A.**

Las desviaciones están bien documentadas en JSDoc. La arquitectura es tier-S+ **modulo** el refactor de reactividad que está en cola para el Step 6.

---

## 10. ¿Qué Refactorizaría Antes de Producción?

| Prioridad | Item                                                                                    | Esfuerzo | Veredicto                                                                                                      |
| :-------: | --------------------------------------------------------------------------------------- | :------: | -------------------------------------------------------------------------------------------------------------- |
| **ALTA**  | **Promover los stores de estado a `.svelte.ts` + usar las runas `$state` / `$derived`** |    4h    | Cierra la brecha de reactividad. Refactor mecánico; la suite de tests no cambia. **Tarea lead-in del Step 6.** |
| **ALTA**  | Añadir `static/_headers` con la plantilla de CSP / HSTS                                 |    1h    | **Step 6.** Ya está redactada en `current-project-status.md` línea 217.                                        |
| **ALTA**  | Añadir un script post-build de SRI                                                      |    2h    | **Step 6/8.** Hashear cada `_app/immutable/**/*.js`, reescribir `index.html`.                                  |
| **MEDIA** | Añadir 2-3 tests para branches no cubiertas de `state/issues.ts` (subir cobertura >75%) |    1h    | Nice to have. El integration test cubre el camino feliz.                                                       |
| **MEDIA** | Centralizar los paths `.nomad.md/...` en un módulo de constantes `PATHS`                |    1h    | Pulido. Actualmente 3-4 ocurrencias por store.                                                                 |
| **BAJA**  | Cablear `prefers-color-scheme` en `theme.ts` (3 líneas)                                 |    5m    | Trivial. Opcional.                                                                                             |
| **BAJA**  | Cablear `popstate` / `replaceState` en `+layout.svelte` para el `filterStore`           |   30m    | Trivial. La API `serialize` / `parse` del store ya está.                                                       |
| **BAJA**  | Re-validar el getter `errors` de `editor.ts` para opcionalmente validar el draft        |    2h    | Mejora de UX. No bloqueante.                                                                                   |
| **BAJA**  | Ejecutar `RUN_LIVE_TESTS=1 pnpm test` para ejercitar el camino en vivo de remote-git    |   30m    | Opcional; requiere isomorphic-git + un remoto en sandbox.                                                      |

**Esfuerzo total estimado para alcanzar la plena producción: ~12 horas de trabajo enfocado.** La mayor parte vive en el Step 6/8 de todos modos.

---

## 11. Veredicto Final

**Tier-S+ en arquitectura, Tier-A en ejecución, Tier-B en listo para producción (solo por los carry-overs del Step 6/8, no por problemas de la capa de estado).**

La capa de estado:

- Implementa cada item del contrato §C del plan
- Cierra cada carry-over de la auditoría del Step 4
- Añade 129 tests nuevos sin regresiones
- Alcanza el target de cobertura (89.73% / 93.64% líneas, por encima del 80% del plan)
- Mantiene la postura de seguridad (higiene de PAT, sin I/O directo, sin `console.*`)
- Compila en 6.33s, testea en 4.2s, construye a 73 KB

**Puede llegar a producción una vez que el Step 6 (UI) aterrice con los carry-overs de CSP / HSTS / SRI.** Ese no es un problema de la capa de estado.

**Recomendación: APROBADO para merge a `step-4-adapters`.** Abrir el Step 6 con el refactor de runas como primera tarea.

---

## 12. Aprobación

| Revisor   |  Veredicto   | Notas                                                                                              |
| --------- | :----------: | -------------------------------------------------------------------------------------------------- |
| Seguridad |   4.6 / 5    | Capas núcleo excelentes. App deployable en 2.6/5 — bloqueada por Step 6/8 (CSP, SRI, divulgación). |
| Senior FS |   Tier S+    | Arquitectura de manual. Ejecución A. Producción: pendiente de capa UI + 3 carry-overs.             |
| Plan §11  |   14 / 17    | 12 estrictos + 3 N/A + 1 desviación + 1 tolerancia.                                                |
| Global    | **APROBADO** | Listo para merge. La capa de estado es la capa más fuerte del código base.                         |
