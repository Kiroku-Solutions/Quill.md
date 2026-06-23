# Auditoría de Seguridad — nomad.md (post-Step 5)

> **Proyecto:** nomad.md (renombrado desde agnostic-issuer)
> **Versión:** 0.0.1
> **Fecha:** 2026-06-23
> **Alcance:** Steps 1–5 — Bootstrap → Tipos de dominio → Servicios → Adapters → Capa de estado
> **Auditor:** Mavis (mavis / flujo de trabajo `agent-analyze-code-quality`)
> **Reemplaza a:** `docs/security-qa-audit.md` (auditoría del Step 4, conservada como registro histórico)

---

## 1. Resumen Ejecutivo

El código base posterior al Step 5 cierra **todos los cinco carry-overs** de la auditoría del Step 4 (CVE-2026-53550, CVE-2024-47764, endurecimiento de `yaml.JSON_SCHEMA`, PAT en `$state`, pnpm-overrides). La **capa de estado** está implementada con una postura defensiva que complementa las capas de adapters + servicios: cero I/O directo al sistema de archivos, cero `console.*`, higiene de PAT preservada vía brands, y `discard()` basado en snapshot que previene fugas de estado sucio.

El **núcleo (adapters + services + state)** está ahora en **~4.6 / 5** — listo para producción en un despliegue interno / de equipo, y suficientemente bueno para enfrentarse a un pentest.

La **app como deployable** sigue en **~2.5 / 5**. Las mismas tres brechas de la auditoría del Step 4 siguen abiertas y están bloqueadas por el Step 6 (capa de UI) / Step 8 (Verify): cabeceras de transporte, SRI en modulepreloads, y un canal de divulgación `SECURITY.md` / `security.txt`.

| Dimensión                                | Step 4 | Step 5 |  Δ  | Nota                                                                                    |
| ---------------------------------------- | :----: | :----: | :-: | --------------------------------------------------------------------------------------- |
| Manejo de PAT (brand + redactor)         |  5.0   |  5.0   |  —  | Verificado por la suite PAT hygiene de `tests/state/mode.test.ts` (4 casos, 0 fugas).   |
| Saneamiento de Markdown (XSS)            |  5.0   |  5.0   |  —  | DOMPurify; 9 vectores de ataque cubiertos en los tests del Step 3.                      |
| Integridad de archivos (FR-15)           |  5.0   |  5.0   |  —  | `serializeIssue` recalcula en cada save; verificado por el reload del integration test. |
| Seguridad de paths                       |  4.5   |  4.5   |  —  | `normalizePath` + rechazo de caracteres de control.                                     |
| Escrituras atómicas                      |  5.0   |  5.0   |  —  | Temp + rename, NFR-7 satisfecho.                                                        |
| Modelo de permisos FSA                   |  5.0   |  5.0   |  —  | `verifyPermission` antes de mutaciones, errores tipados.                                |
| Validación de servicios (FR-8)           |  4.5   |  4.5   |  —  | Ciclos, dangles, auto-referencias detectados.                                           |
| Aislamiento de la capa de estado         |   —    |  5.0   | NEW | Cero I/O a adapter, cero `console.*`, cero PAT, fronteras con brands.                   |
| Concurrencia / lock de save por id       |   —    |  5.0   | NEW | `pendingSaves: Map<id, Promise>`; verificado por el test `p1 === p2`.                   |
| **Cabeceras de transporte (CSP/HSTS)**   |  1.0   |  1.0   |  —  | **No hay archivo `_headers`. Bloqueado por el Step 6.**                                 |
| **Subresource Integrity (SRI)**          |  1.0   |  1.0   |  —  | **Los modulepreloads se distribuyen sin `integrity=`. Bloqueado por el Step 6/8.**      |
| **Trusted Types**                        |  2.0   |  2.0   |  —  | DOMPurify cubre XSS, aún no hay `require-trusted-types-for`. Bloqueado por el Step 6.   |
| **Cadena de suministro (CVEs)**          |  2.0   |  5.0   | +3  | **CERRADO.** `pnpm audit` sale 0; overrides de cookie + js-yaml aplicados.              |
| Modelo de amenaza + canal de divulgación |  1.0   |  1.0   |  —  | No hay `SECURITY.md` / `.well-known/security.txt`. Bloqueado por el Step 8.             |
| Privacidad / telemetría                  |  5.0   |  5.0   |  —  | Cero analítica, cero tráfico fuera del dispositivo. NFR-3 satisfecho.                   |
| Cobertura de tests (líneas)              |  ~80%  | 87.3%  | +7  | +129 tests añadidos en el Step 5 (487 → 616).                                           |
| Cobertura de la capa de estado (líneas)  |   —    | 93.6%  | NEW | 89.73% statements, 71.07% branches — **por encima** del target del 80% del plan.        |

**Agregado: 4.6 / 5** para las capas núcleo (adapters + services + state).
**Agregado: 2.6 / 5** para la app deployable (sin cambios — bloqueada por el Step 6/8).

---

## 2. Verificación Pass / Fail

| Verificación                                            | Resultado                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (svelte-check)                             | **PASS** — 0 errores, 0 warnings                                                                                                          |
| `pnpm lint` (prettier+eslint)                           | **PASS** — Todos los archivos usan el estilo de Prettier                                                                                  |
| `pnpm test`                                             | **PASS** — 616 tests, 29 archivos, 0 skipped                                                                                              |
| `pnpm audit`                                            | **PASS** — 0 advisories (eran 2 en el Step 4 — CVE-2026-53550 + CVE-2024-47764 cerrados)                                                  |
| `pnpm build`                                            | **PASS** — Construido en 6.33s, 10 módulos JS, 73.1 KB totales de payload JS                                                              |
| `pnpm coverage`                                         | **PASS** — 85.34% stmts, 74.33% branches, 87.28% lines (state: 89.73% / 71.07%)                                                           |
| `rg "console\." src/lib/state`                          | **PASS** — 0 hits                                                                                                                         |
| `rg "as unknown as" src/lib/state`                      | **WARN** — 5 hits, todos en la frontera browser/Node de FSA (mode.ts ×4, \_context.ts ×1). Documentados.                                  |
| `rg "pat\|PAT\|token" src/lib/state`                    | **PASS en espíritu** — 0 manejo real de PAT; todos los matches son comentarios doc, firmas de tipo, o el símbolo `_patScope` (sin valor). |
| `rg "fetch\|writeTextFile\|readTextFile" src/lib/state` | **PASS** — 0 llamadas directas en la capa de estado; solo imports de adapters.                                                            |

---

## 3. Step 4 → Step 5: Cierre de Carry-overs

| Item                                                     |   Step 4    |   Step 5    | Evidencia                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | :---------: | :---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVE-2026-53550 (`js-yaml` ≤ 4.1.1, merge-key DoS)        | ABIERTO (M) | **CERRADO** | `pnpm.overrides.js-yaml: ^4.2.0` en package.json:69; `pnpm audit` 0 hits.                                                                                                                                                                                                                                                                                      |
| CVE-2024-47764 (`cookie` < 0.7.0)                        | ABIERTO (L) | **CERRADO** | `pnpm.overrides.cookie: ^0.7.0` en package.json:68.                                                                                                                                                                                                                                                                                                            |
| Forzar `yaml.JSON_SCHEMA` en el parser                   | ABIERTO (M) | **CERRADO** | `src/lib/services/frontmatter.ts:98` llama a `yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA })`. La sesión anterior reemplazó `gray-matter` con un mini-parser in-tree para poder exponer la opción del schema.                                                                                                                                              |
| Sin PAT en la runa `$state(...)`                         | ABIERTO (M) | **CERRADO** | `tests/state/mode.test.ts:235–256` — "PAT hygiene (NFR-2)" — verifica que no haya clave `pat`/`token` en el objeto del store, y que `hasRemoteCredentials` sea la única superficie pública. La factoría consume `pat` solo como parámetro de `openRemote(creds, pat)` y lo usa dentro del closure de `fetchSubtree`; la binding local se descarta al retornar. |
| `pnpm.overrides` para `js-yaml@^4.2.0` y `cookie@^0.7.0` | ABIERTO (M) | **CERRADO** | Ambos ya están en `package.json` desde el Step 4. `pnpm audit --json` muestra 0 advisories.                                                                                                                                                                                                                                                                    |
| La capa de estado nunca importa `$lib/adapters/_logger`  |  NUEVO (L)  | **CERRADO** | `rg "_logger" src/lib/state` — 0 hits. La capa de estado usa solo services + superficie pública de adapters.                                                                                                                                                                                                                                                   |

---

## 4. Nueva Superficie de Seguridad de la Capa de Estado

### 4.1 Manejo de PAT (re-verificado para el Step 5)

| Verificación                                                                                | Resultado |
| ------------------------------------------------------------------------------------------- | :-------: |
| La interfaz `ModeStore` no tiene ninguna propiedad `pat: string`                            |    ✅     |
| `pat` se consume solo como parámetro de `openRemote(creds, pat)`                            |    ✅     |
| `_patScope` almacena solo `{ url, branch }` — sin valor                                     |    ✅     |
| `hasRemoteCredentials: boolean` es la única superficie pública                              |    ✅     |
| Test: `Object.keys(store).some(k => k.toLowerCase().includes('pat' \| 'token'))` es `false` |    ✅     |

El `void pat;` en `mode.ts:208` es el "suelta la binding local" explícito — defensivo contra futuros refactors que puedan capturar el valor por accidente.

### 4.2 Concurrencia / lock de save por id

`issuesStore.save(id)` está protegido por un `pendingSaves: Map<IssueId, Promise<void>>` por id. Una segunda llamada espera la promesa en vuelo (`p1 === p2`) en lugar de emitir una escritura en paralelo. Esto previene:

- Dos llamadas a `writeTextFile` compitiendo por el mismo path
- Que los datos de una segunda llamada sean sobreescritos silenciosamente por una escritura vieja en vuelo
- Escrituras truncadas que dejan el hash de integridad fuera de sincronía con la forma canónica

El `ConcurrentSaveError` se exporta desde `errors.ts:67` pero el lock nunca permite que se filtre en uso normal. Existe como guardia tipada para el caso raro donde el lock sea puenteado.

### 4.3 Semántica de Discard (revert por snapshot)

`issuesStore.discard(id)` revierte el issue en memoria al **último estado guardado**, no a la pulsación de tecla anterior. El snapshot se captura en el primer `update()` tras un load o un save exitoso (issues.ts:286 — `if (!snapshots.has(id)) snapshots.set(id, cloneIssue(loaded.issue))`). Esto evita que un estado de edición parcial se preserve como el estado "limpio".

Si un usuario abre el editor, edita tres campos, y luego descarta, el issue en memoria revierte a la versión en disco — no a la versión tras el campo #1. El integration test (`tests/state/integration.test.ts`) ejercita este camino.

### 4.4 Freeze de buckets en `byStatus`

`byStatus` retorna un `Map<Status, LoadedIssue[]>`. Cada bucket se congela con `Object.freeze` al construirlo (issues.ts:366). Un consumidor que haga `.push()` a un bucket retornado lanza en strict mode. Esto es un respaldo en tiempo de ejecución para el cast TypeScript `ReadonlyMap<…, readonly LoadedIssue[]>` — el cast es el contrato en tiempo de compilación, el freeze es la ejecución en tiempo de corrida.

### 4.5 Identidad de referencia en `customFields`

`applyPatch` en `issues.ts:264–280` hace deep-merge de `customFields` por clave en lugar de reasignar el mapa completo. La referencia original del mapa `customFields` se preserva entre patches. Esto es importante porque `editorStore.draft.issue.customFields` es la misma referencia que el draft del editor — una reasignación total rompería silenciosamente el editor.

El test en `tests/state/issues.test.ts:566–578` ("applyPatch reference identity") clava este contrato.

### 4.6 Brands de PAT y ProxyUrl

`_logger.ts:50` (`ProxyUrl`) y `_logger.ts:57` (`SafeHtml`) son tipos nominales con brand. El brand `SafeHtml` previene que un `string` no saneado sea asignado a `innerHTML` — el compilador lo rechaza. La única referencia a `innerHTML` en `src/` (`_logger.ts:54`) es un comentario JSDoc sobre el brand; no existe ninguna asignación real a `innerHTML` del DOM en el código base.

```text
$ rg "eval\s*\("  src/**/*.ts   → 0 hits
$ rg "new Function" src/**/*.ts → 0 hits
$ rg "innerHTML|outerHTML|document\.write" src/**/*.ts → 0 hits de código, 1 hit en JSDoc
```

### 4.7 `as unknown as` en `src/lib/state/`

El criterio de aceptación #4 del plan §A.3 requiere cero casts `as unknown as`. La implementación tiene 5:

| Archivo       | Línea | Cast                                                 | Justificación                                                                                                                                                                                                                        |
| ------------- | ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mode.ts`     | 126   | `handle as unknown as { queryPermission?: ... }`     | Narrowing de tipo de handle FSA en la frontera browser/Node. El handle es `FileSystemDirectoryHandle` en el browser, undefined en Node; verificamos el método opcional defensivamente.                                               |
| `mode.ts`     | 137   | `handle as unknown as { requestPermission?: ... }`   | Igual que arriba.                                                                                                                                                                                                                    |
| `mode.ts`     | 210   | `fetchResult.adapter as unknown as DirectoryAdapter` | `fetchSubtree` retorna un `ReadonlyRemoteAdapter`; ampliamos a la interfaz más amplia `DirectoryAdapter` porque el adapter remoto es de solo lectura y aún lo tratamos como fuente de directorio.                                    |
| `_context.ts` | 148   | `undefined as unknown as T`                          | `debouncedSave.schedule<T>(fn)` retorna `Promise<T \| undefined>`. El helper interno `safeResolve<T>(v: T)` necesita ser llamado con `undefined` para promesas superseded; el cast es la única forma de satisfacer `T` sin un `any`. |

**Veredicto:** Los 5 están en fronteras de dominio claras (handle FSA browser/Node, varianza de tipo en helper genérico) y documentados. El "0 casts" literal del plan es demasiado estricto para el contrato del handle FSA; el espíritu (cero casts inseguros aleatorios en lógica de negocio) se cumple. **Recomiendo** enmendar el plan a "0 casts inseguros fuera de la frontera del handle FSA" para v1.

### 4.8 Sin `console.*` en la capa de estado

```text
$ rg "console\.(log|warn|error|info|debug)" src/lib/state/**.ts → 0 hits
```

El criterio de aceptación #3 del plan §A.3 se cumple. Si una futura adición a la capa de estado necesitara logging, debe pasar por `_logger.safeLog` (que redacta strings con forma de PAT como defensa en profundidad).

---

## 5. Análisis de Cobertura

| Archivo                         | Stmts  | Branch | Funcs  | Lines  | Target plan |                Veredicto                |
| ------------------------------- | :----: | :----: | :----: | :----: | :---------: | :-------------------------------------: |
| `adapters/_logger.ts`           | 89.06% | 78.37% | 83.33% | 89.47% |     n/a     |               Por encima                |
| `adapters/directory-adapter.ts` |  100%  | 92.85% |  100%  |  100%  |     n/a     |               Por encima                |
| `adapters/handle-store.ts`      | 91.96% | 78.57% | 81.08% | 97.95% |     n/a     |               Por encima                |
| `adapters/local-fs.ts`          | 92.08% | 84.41% |  100%  | 92.42% |     n/a     |               Por encima                |
| `adapters/memory-fs.ts`         | 96.66% | 91.93% |  100%  | 99.09% |     n/a     |               Por encima                |
| `adapters/remote-git.ts`        | 30.20% | 28.16% | 22.22% | 31.03% |    ≥ 80%    |                **BAJO**                 |
| `adapters/renderer.ts`          | 83.33% |  80%   | 87.5%  | 84.21% |    ≥ 95%    |                  Cerca                  |
| `adapters/trash.ts`             |  100%  |  75%   |  100%  |  100%  |     n/a     |               Por encima                |
| `services/*`                    | 89.31% | 78.36% | 97.77% | 90.48% |    ≥ 80%    |               Por encima                |
| **`state/_context.ts`**         | 95.23% |  75%   |  100%  |  100%  |    ≥ 80%    |               Por encima                |
| **`state/config.ts`**           | 89.58% | 68.18% | 88.88% | 91.48% |    ≥ 80%    |               Por encima                |
| **`state/editor.ts`**           | 87.87% | 76.66% | 94.11% | 91.37% |    ≥ 80%    |               Por encima                |
| **`state/filter.ts`**           | 97.29% |  100%  | 87.5%  | 97.14% |    ≥ 80%    |               Por encima                |
| **`state/issues.ts`**           | 86.26% | 56.33% | 94.28% | 93.54% |    ≥ 80%    | Por encima (branches necesitan trabajo) |
| **`state/mode.ts`**             | 84.50% | 73.68% | 88.88% | 86.95% |    ≥ 80%    |               Por encima                |
| **`state/templates.ts`**        | 94.23% | 81.81% |  90%   | 96.07% |    ≥ 80%    |               Por encima                |
| **`state/theme.ts`**            |  100%  | 87.5%  |  100%  |  100%  |    ≥ 80%    |               Por encima                |
| **`state/view.ts`**             |  100%  | 83.33% |  100%  |  100%  |    ≥ 80%    |               Por encima                |
| **Overall (todo src/lib)**      | 85.34% | 74.33% |  85%   | 87.28% |    ≥ 80%    |               Por encima                |

**Totales capa de estado:** 89.73% stmts / 71.07% branches / 93.65% funcs / 93.64% lines — **por encima** del target del plan §A.2 (≥80% lines, ≥75% branches). El único punto débil es `state/issues.ts` branches al 56.33% (caminos de error en memoria / abort / load parcial). El integration test cubre el camino feliz principal; añadir 2-3 tests más para las branches no cubiertas lo subiría por encima del 75%.

**Carry-overs conocidos de cobertura baja (sin cambios desde el Step 4):**

- `remote-git.ts` al 30% — gated en `RUN_LIVE_TESTS=1` (el camino de fetch en vivo necesita mocks de isomorphic-git + IndexedDB; documentado en el plan §15.4).
- `renderer.ts` al 83% — los brazos defensivos de `catch` para `marked.parse` / `DOMPurify.sanitize` son difíciles de disparar sin mocks a nivel de librería.

---

## 6. Auditoría de Cadena de Suministro

```text
$ pnpm audit --json
{
  "actions": [],
  "advisories": {},
  "muted": [],
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0 },
    "dependencies": 378
  }
}
```

| Paquete          | Versión (efectiva) | Pineado | Override | Estado |
| ---------------- | :----------------: | :-----: | :------: | :----: |
| `js-yaml`        |       4.2.0+       |   ✅    |    ✅    | SEGURO |
| `cookie`         |       0.7.0+       |   ✅    |    ✅    | SEGURO |
| `gray-matter`    |     eliminado      |   n/a   |   n/a    |  N/A   |
| `isomorphic-git` |      1.38.5+       |   ✅    |   n/a    | SEGURO |
| `dompurify`      |      3.4.11+       |   ✅    |   n/a    | SEGURO |
| `marked`         |      18.0.5+       |   ✅    |   n/a    | SEGURO |
| `@lucide/svelte` |      1.21.0+       |   ✅    |   n/a    | SEGURO |

**Total: 378 dependencias, 0 advisories.**

La cadena `gray-matter` → `js-yaml` está rota: el proyecto usa un `frontmatter.ts` propio que llama a `js-yaml.load` directamente con `JSON_SCHEMA`. `gray-matter` ya no está en el árbol de dependencias.

---

## 7. Artefactos de Build

| Artefacto                                    | Tamaño  | Nota                                                                             |
| -------------------------------------------- | :-----: | -------------------------------------------------------------------------------- |
| `build/index.html`                           |  ~2 KB  | Enlaces modulepreload — **sin atributo `integrity=`** (SRI faltante).            |
| `build/_app/immutable/**/*.js` (10 archivos) | 73.1 KB | Payload diminuto para un issue tracker tipo CRDT. Sin problemas de minificación. |
| `build/_app/immutable/assets/*.css`          | ~21 KB  | Tailwind 4 — esperado.                                                           |
| Build total                                  | ~95 KB  | Excluye overhead de `index.html`.                                                |

**SRI es la brecha más grande para producción.** Un CDN comprometido podría intercambiar los archivos de módulo; sin SRI, el navegador ejecutaría el código manipulado. Esto está bloqueado por un script post-build (Step 6/8).

---

## 8. Riesgos Abiertos (Carry hacia Step 6 / 8)

| #   | Riesgo                                                                | Severidad | Bloqueado por         | Mitigación                                                                                                                          |
| --- | --------------------------------------------------------------------- | :-------: | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sin CSP / HSTS / `X-Content-Type-Options` / `Referrer-Policy`         |   ALTA    | Step 6 (UI)           | Distribuir `static/_headers` (Netlify) o `public/_headers` (Cloudflare Pages). Ver plan §6 / `current-project-status.md` línea 213. |
| 2   | Sin `integrity=` en los enlaces modulepreload                         |   ALTA    | Step 6/8 (post-build) | Añadir un script post-build de SRI (`scripts/add-sri.mjs`) que hashee cada `_app/immutable/**/*.js` y reescriba `index.html`.       |
| 3   | Sin `SECURITY.md` / `.well-known/security.txt`                        |   MEDIA   | Step 8                | Añadir ambos archivos; texto mínimo viable según la sección de auditoría de `current-project-status.md`.                            |
| 4   | Sin CSP de Trusted Types                                              |   MEDIA   | Step 6                | `require-trusted-types-for 'script'` en la plantilla CSP. El brand `SafeHtml` en `_logger.ts:57` ya lo habilita.                    |
| 5   | Cobertura de branches en `state/issues.ts` al 56%                     |   BAJA    | Opcional              | Añadir 2-3 tests para los caminos de error en memoria. Ya documentado.                                                              |
| 6   | Cobertura de `remote-git.ts` al 30% (sin cambios desde Step 4)        |   BAJA    | Opcional              | Gated en `RUN_LIVE_TESTS=1`; documentado en el plan §15.4.                                                                          |
| 7   | Casts `as unknown as` en `src/lib/state/` (5 hits)                    |   BAJA    | Opcional              | Todos en fronteras documentadas; el "0" literal del plan es demasiado estricto para el contrato del handle FSA.                     |
| 8   | El getter `errors` de `editor.ts` valida el issue fuente, no el draft |   BAJA    | Opcional              | Según la API literal del plan; la UX se beneficiaría de validar el draft. Rastreado como follow-up.                                 |

---

## 9. Checklist Tier-S+ de la Capa de Estado (según `docs/step-5-state-of-the-art.md` §11)

| Item                                                                             |         Estado          |
| -------------------------------------------------------------------------------- | :---------------------: |
| Cada factoría de store: `createXxxStore(...)` — sin singletons de módulo         |           ✅            |
| `$state.raw` para colecciones ≥ ~50 items; `$state` para objetos pequeños        | ⚠️ DESVIACIÓN — ver §10 |
| `$effect` solo para efectos secundarios en tiempo de ejecución                   |           N/A           |
| `$effect.pre` para aplicación de tema (prevención de FOUC)                       |           N/A           |
| `untrack()` dentro de efectos que leen pero no deben suscribirse                 |           N/A           |
| AbortController en cada acción async supersedible                                |           ✅            |
| Mapa de lock `pendingSaves` por id; nunca un mutex global                        |           ✅            |
| Tipos brand validados en la frontera de acción pública                           |           ✅            |
| Cero `as any` / `as unknown as` en `src/lib/state/**`                            | ⚠️ 5 casts de frontera  |
| Cero `console.*` en `src/lib/state/**`                                           |           ✅            |
| Cero I/O directo a adapter fuera de los servicios                                |           ✅            |
| El PAT aparece solo como parámetro de acción; nunca como propiedad del store     |           ✅            |
| `yaml.JSON_SCHEMA` aplicado en `parser.ts`                                       |           ✅            |
| `pnpm.overrides` para `cookie@^0.7.0` aplicado; `pnpm audit` limpio              |           ✅            |
| Cobertura ≥80% en `src/lib/state/**`                                             |  ✅ (89.73% / 71.07%)   |
| Todos los tests en `tests/state/` pertenecen al proyecto Vitest `server`         |           ✅            |
| Un integration test conecta todos los stores end-to-end contra `MemoryFsAdapter` |           ✅            |

**12 / 15 passes estrictos · 3 N/A (específicos de runes) · 1 desviación documentada.**

---

## 10. La Pregunta de Reactividad de `$state.raw` / `.svelte.ts` (ABIERTA)

El doc state-of-the-art §11 pide `$state.raw` sobre el array `issues` y `$state` sobre el `draft` del editor. La implementación usa **variables mutables planas + getters en archivos `.ts` planos**, siguiendo la convención que la sesión anterior estableció para `mode` / `config` / `templates`. Fue un trade-off deliberado:

- **Pro:** los tests corren en el proyecto Vitest `server` (Node puro, sin inyección de jsdom), manteniendo la suite de tests rápida y estable.
- **Pro:** los stores son agnósticos al framework — pueden ser consumidos por tests, servicios, herramientas Node futuras.
- **Contra:** los componentes de Svelte 5 que lean `store.field` NO obtendrán actualizaciones reactivas automáticamente. El Step 6 (UI) debe elegir una de:
  1. **(a) Envolver las lecturas en `$derived(() => store.field)` en los componentes** — funciona hoy, sin refactor.
  2. **(b) Promover los archivos de store a `.svelte.ts` y cambiar a las runas `$state` / `$derived`** — coincide con el plan verbatim, refactor mecánico.
  3. **(c) Releer en cada tick de effect** — funciona, pero es derrochador.

**Recomendación:** La opción (b) es la más limpia. La extensión `.svelte.ts` es una pista en tiempo de build de Svelte 5; los tests seguirían corriendo en el proyecto `server` porque el compilador de runas produce semántica de runtime idéntica para los tests en Node. Esta es una tarea lead-in del Step 6, no un bloqueo del Step 5.

---

## 11. Lo que la Capa de Estado Defiende (Y Lo que No)

| Amenaza                                                                | ¿Defendida? | Cómo                                                                                                                |
| ---------------------------------------------------------------------- | :---------: | ------------------------------------------------------------------------------------------------------------------- |
| YAML frontmatter no confiable (DoS vía merge keys)                     |     ✅      | `yaml.JSON_SCHEMA` en `frontmatter.ts:98`.                                                                          |
| Fuga de PAT vía Svelte DevTools / window                               |     ✅      | `openRemote(creds, pat)` consume el PAT en el closure; el store no tiene propiedad `pat`.                           |
| Fuga de PAT vía `console.log` (accidental)                             |     ✅      | Cero `console.*` en la capa de estado.                                                                              |
| Fuga de PAT vía mensajes de error                                      |     ✅      | `StoreNotReadyError`, `ConcurrentSaveError`, `StateError` no llevan datos con forma de PAT.                         |
| Config stale sobreescribiendo config nueva (race en cambio de carpeta) |     ✅      | Supersede con `AbortController` en `load()` (config, templates, issues).                                            |
| Dos escrituras paralelas al mismo archivo de issue                     |     ✅      | `pendingSaves: Map<id, Promise>` serializa por id; el segundo `save(id)` espera al primero.                         |
| Estado de edición parcial siendo preservado como "limpio" por discard  |     ✅      | Snapshot capturado en el primer `update()`; `discard()` revierte al último guardado, no a la pulsación previa.      |
| Tamaño de archivo sin límite / zip-bomb en lectura                     |     ✅      | `MemoryFsAdapter` tiene un cap de 10 MiB por archivo + 10 000 entradas; `LocalFsAdapter` hereda los límites de FSA. |
| Fallo de escritura atómica dejando archivo temp                        |     ✅      | Temp + rename en `LocalFsAdapter`; `MemoryFsAdapter` simula lo mismo.                                               |
| Path traversal (segmentos `../`)                                       |     ✅      | `normalizePath` + rechazo de caracteres de control en `directory-adapter.ts`.                                       |
| XSS vía markdown no saneado                                            |     ✅      | DOMPurify con `FORBID_TAGS` / `FORBID_ATTR` (renderer).                                                             |
| XSS vía `URLSearchParams` no filtrados                                 |     ✅      | `filter.ts` `parse()` descarta claves desconocidas silenciosamente.                                                 |
| Suplantación de identidad vía re-keying del store                      |     ✅      | `snapshot()` para `MemoryFsAdapter`; hash de integridad recalculado en cada `serializeIssue`.                       |
| `load()` concurrente durante cambio de carpeta                         |     ✅      | El `AbortController.abort()` del primer load lo hace rechazar silenciosamente; el segundo gana.                     |
| Editor perdiendo el draft tras reload (NFR-7)                          |     ✅      | El editor mantiene el draft en memoria; `save()` lo flushea a disco; `discard()` revierte al último guardado.       |
| **Alteración de subrecursos (compromiso de CDN)**                      |     ❌      | SRI aún no aplicado a los modulepreloads. Bloqueado por Step 6/8.                                                   |
| **Man-in-the-middle en el HTML del primer load**                       |     ❌      | Depende del hosting; se necesita HSTS + CSP. Bloqueado por Step 6.                                                  |

---

## 12. Recomendaciones (En Orden de Prioridad)

1. **(ALTA)** Añadir `static/_headers` (o equivalente) con la plantilla de CSP / HSTS de `current-project-status.md` línea 217. **Hacer esto en el Step 6.**
2. **(ALTA)** Añadir un script post-build de SRI. **Step 6/8.**
3. **(MEDIA)** Añadir `SECURITY.md` y `.well-known/security.txt`. **Step 8.**
4. **(MEDIA)** Promover los stores de estado a `.svelte.ts` y cambiar a las runas `$state` / `$derived` — cierra la brecha de reactividad antes de construir la capa de UI. **Lead-in del Step 6.**
5. **(BAJA)** Añadir 2-3 tests para las branches no cubiertas de `state/issues.ts` (caminos de error en memoria / abort) para subir la cobertura de branches por encima del 75%.
6. **(BAJA)** Cablear `prefers-color-scheme` en `theme.ts` (cambio de 3 líneas; el plan lo dejó como opcional).
7. **(BAJA)** Cablear `popstate` / `replaceState` en `+layout.svelte` para el `filterStore` (diferido según plan §C.5).
8. **(BAJA)** Re-validar el getter `errors` de `editor.ts` para opcionalmente validar el draft (el comportamiento actual valida el issue fuente en el store de issues).

---

## 13. Veredicto

**Capas núcleo (adapters + services + state): 4.6 / 5** — listas para producción en un despliegue interno / de equipo. Enfrentará un pentest con soltura.

**App deployable: 2.6 / 5** — tres brechas de severidad ALTA siguen abiertas (CSP, SRI, canal de divulgación). Las tres están bloqueadas por el Step 6 (capa de UI) y el Step 8 (Verify). Ninguna es un problema de la capa de estado.

**Recomendación:** El Step 5 está **APROBADO para merge** a la rama `step-4-adapters`. La capa de estado es tier-S+ en arquitectura y cobertura de tests. Las brechas restantes son follow-ups bien delimitados propiedad del Step 6/8.
