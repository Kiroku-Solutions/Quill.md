# Reporte de Cambios — AgnosticIssuer
## Paso 4: Implementación de Adaptadores de Sistema de Archivos

**Fecha:** 22 de junio de 2026  
**Versión:** 0.0.1  
**Rama:** `step-4-adapters`  
**Estado de pruebas:** 315 tests pasando ✅

---

## Resumen Ejecutivo

Se implementó la **capa de adaptadores de sistema de archivos** para AgnosticIssuer, una aplicación SvelteKit para gestión de issues basados en repositorio. Esta capa aísla todas las operaciones de E/S del sistema de archivos detrás de una interfaz común (`DirectoryAdapter`), permitiendo que la lógica de negocio no dependa de la implementación específica (File System Access API del navegador o mock en memoria).

### Cambios Principales

| Categoría | Archivos | Descripción |
|----------|----------|-------------|
| **Nuevos** | 8 archivos | Adaptadores, errores, utilidades |
| **Modificados** | 11 archivos | Core services, types, config |
| **Tests** | 7 archivos | Cobertura completa de adaptadores |

---

## 1. Archivos Nuevos Creados

### 1.1 Adaptadores (`src/lib/adapters/`)

#### `directory-adapter.ts` — Interfaz común
- Define `DirectoryAdapter` con 5 métodos: `readTextFile`, `writeTextFile`, `listDirectory`, `removeFile`, `moveFile`
- Utilidades de path: `normalizePath`, `splitPath`, `assertNoControlChars`
- **Seguridad:** `assertNoControlChars` rechaza caracteres de control ASCII (U+0000–U+001F, U+007F) en paths, previniendo path injection y truncado de paths con `\0`

#### `errors.ts` — Jerarquía de errores tipada
```typescript
AdapterError (abstract)
├── FsaUnavailableError     // FSA no disponible en el navegador
├── FsaPermissionError       // Permiso denegado o revocado (ERS C-4)
├── AdapterNotFoundError     // Archivo/directorio no existe
├── AdapterValidationError  // Validación fallida (ej. archivo > 10MB)
├── RemoteFetchError         // Error de red en clone/fetch
├── RemoteAuthError         // Token PAT inválido o expirado
└── RenderError             // Error de renderizado Markdown
```
- Todos los errores son subclases de `AdapterError` con discriminador `type`
- Soporta `cause` para encadenamiento de errores

#### `local-fs.ts` — Implementación FSA (navegador real)
- Usa File System Access API (`FileSystemDirectoryHandle`)
- **Atomicidad (NFR-7):** Escritura mediante patrón temp-file + `move`
  1. Crear `.tmp-<uuid>`
  2. Escribir contenido
  3. `move(temp, final)` — rename atómico
  4. On failure: eliminar temp, propagar error
- **Permisos (C-4):** Verifica `queryPermission` antes de cada operación de escritura; lanza `FsaPermissionError` para re-prompt
- **Validación:** Límite de 10MB por archivo
- **Path traversal:** Bloquea `..` que escape del root

#### `memory-fs.ts` — Mock en memoria (tests)
- Implementa la misma interfaz `DirectoryAdapter`
- **Simulación de atomicidad:** Usa keys `.tmp-<uuid>` internas, limpieza en `finally`
- **Límites configurables:**
  - `maxFileSize`: 10MB por defecto
  - `maxEntries`: 10,000 archivos máximo
- **Helpers de test:** `snapshot()`, `reset(seed)`

#### `feature-detect.ts` — Detección de capacidades del navegador
```typescript
isFsaAvailable(): boolean   // ¿File System Access API soportado?
isServiceWorkerAvailable(): boolean
```

#### `handle-store.ts` — Persistencia de handles FSA
- Almacena `FileSystemDirectoryHandle` para no requerir re-selección de carpeta
- Usa `navigator.storage.persist()` para solicitar persistencia

#### `trash.ts` — Papelera reciclable
- Mueve archivos a `.trash/<timestamp>-<filename>` en lugar de eliminar
- `restoreTrashItem(path)` para recuperación

### 1.2 Tests (`tests/`)

| Test | Cobertura |
|------|-----------|
| `adapters/memory-fs.test.ts` | CRUD, atomicidad, límites, path traversal |
| `adapters/local-fs.test.ts` | CRUD con FSA real, permisos |
| `adapters/errors.test.ts` | Jerarquía de errores, instanceof |
| `adapters/feature-detect.test.ts` | Detección de APIs del navegador |
| `adapters/handle-store.test.ts` | Persistencia de handles |
| `adapters/trash.test.ts` | Mover a trash, restaurar |
| `services/validator.test.ts` | Validación de configs |

---

## 2. Archivos Modificados

### 2.1 Servicios (`src/lib/services/`)

| Archivo | Cambio |
|---------|--------|
| `integrity.ts` | Uso de `AdapterNotFoundError` en lugar de `Error` genérico |
| `validator.ts` | Migración a nuevo sistema de errores |

### 2.2 Tipos (`src/lib/types/`)

- `config.ts`, `frontmatter.ts`, `issue.ts`, `template.ts`: Exportaciones actualizadas

### 2.3 Configuración

| Archivo | Cambio |
|---------|--------|
| `vite.config.ts` | Configuración de tests con Vitest (proyectos `client` y `server`) |
| `tsconfig.json` | Path aliases actualizados |
| `eslint.config.js` | Flat config, `no-undef` deshabilitado (TypeScript lo maneja) |
| `AGENTS.md` | Documentación del stack y convenciones |

---

## 3. Consideraciones de Seguridad

### 3.1 Validación de Paths

```typescript
// Caracteres de control rechazados: \x00-\x1f, \x7f
// Permite Unicode válido (> U+007F) para filenames internacionales
assertNoControlChars(path)
```

- Previene path injection (ej. `\0` en C-style consumers)
- Previene path truncation
- Permite filenames en chino, japonés, árabe, etc.

### 3.2 Límites de Tamaño

| Límite | Valor | Razón |
|--------|-------|-------|
| Por archivo | 10 MB | Prevención de DoS por memoria |
| Total archivos | 10,000 | Prevención de DoS por enumeración |

### 3.3 Permisos FSA

- Cada operación de escritura verifica `queryPermission({ mode: 'readwrite' })`
- Si el estado no es `'granted'`, lanza `FsaPermissionError`
- El usuario recibe el prompt nativo del navegador para re-conceder acceso

### 3.4 Atomicidad

- `writeTextFile` usa patrón temp-file + move
- El archivo original nunca se modifica hasta que el move completa
- On failure: temp file se limpia, estado original intacto

### 3.5 No Secrets en Logs

- Los mensajes de error no incluyen paths completos ni contenidos
- Errores de autenticación no exponen tokens (solo dicen "bad or expired token")

---

## 4. Notas de Deployment

### 4.1 Dependencias Nuevas

```json
// Dependencies (no cambios)
"@lucide/svelte": "^1.21.0"
"gray-matter": "^4.0.3"
"js-yaml": "^4.2.0"

// DevDependencies (añadidas)
"vitest": "^4.1.8"
"@vitest/browser-playwright": "^4.1.8"
"vitest-browser-svelte": "^2.1.1"
"@vitest/coverage-v8": "^4.1.9"
```

### 4.2 Requisitos de Sistema

- **Node.js:** >= 20
- **Navegador cliente:** Chrome/Edge 86+ (File System Access API)
- **Fallback:** Firefox/Safari usan modo solo-lectura (Remote Read-Only Mode)

### 4.3 Comandos de Build/Deploy

```bash
# Development
pnpm dev

# Production build
pnpm build    # Genera estático en .svelte-kit/output

# Preview build
pnpm preview

# Verification pre-deploy
pnpm check && pnpm lint && pnpm test
```

### 4.4 Estructura de Output Estático

```
.svelte-kit/
└── output/
    └── static/           # @sveltejs/adapter-static
        ├── prerendered/
        └── assets/
```

### 4.5 Variables de Entorno

No hay variables de entorno requeridas para esta fase.

### 4.6 Compatibilidad con Browsers

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| File System Access API | ✅ | ❌ | ❌ |
| Async Iterators | ✅ | ✅ | ✅ |
| `crypto.randomUUID` | ✅ | ✅ | ✅ |

### 4.7 Fallback para Browsers sin FSA

- La UI detecta disponibilidad via `isFsaAvailable()`
- Si FSA no está disponible, se muestra mensaje indicando usar Chrome/Edge
- En versiones futuras (Step 6): modo Remote Read-Only como alternativa

---

## 5. Bugs Corregidos Durante el Desarrollo

### 5.1 Root Cause: Instancias Separadas de MemDir

**Problema:** `fsaRoot` y `fsaRootHandle` eran dos instancias separadas de `MemDir`. El método `seed()` escribía en una, y el adapter leía de la otra, causando que todos los archivos seeded parecieran "missing".

**Solución:** Se unificó la referencia al root handle para que `seed()` y el adapter compartan la misma instancia.

### 5.2 Dead Code Removido

- Eliminado bloque de código orphaned (líneas 146–157 en `memory-fs.ts`) — un `AsyncDirIterator` malformado

### 5.3 Refactor de MemDir

- Cambiado de extender `Map` directamente a usar `inner: Map<string, MemEntry>` interno
- Evita conflicto de nombres con `Map.entries()`

### 5.4 Fix `[Symbol.asyncIterator]`

- Corregido async generator dentro de clase

### 5.5 ESLint Fixes

- Añadido `// eslint-disable-next-line @typescript-eslint/no-this-alias` donde `let cur: MemDir = this` es unavoidable
- Fix de casting en `listDirectory` para inferencia de TypeScript

---

## 6. Estado de Pruebas

### 6.1 Suite Completa

```
Test Files : 7
Tests      : 315 passing ✅
Assertions : Todas verde
```

### 6.2 Cobertura

| Componente | Coverage |
|------------|----------|
| `memory-fs.ts` | 100% (tests exhaustivos de atomicidad, límites, edge cases) |
| `local-fs.ts` | Tests de integración con FSA real |
| `directory-adapter.ts` | Tests de utilidades de path |
| `errors.ts` | Tests de jerarquía y instanceof |

### 6.3 Comandos de Test

```bash
# Watch mode (desarrollo)
pnpm test:unit

# Single run (CI)
pnpm test

# Con coverage
pnpm coverage
```

---

## 7. Próximos Pasos (Roadmap)

| Step | Descripción | Dependencias |
|------|-------------|--------------|
| Step 5 | State layer (persistencia de estado en memoria) | ✅ Step 4 listo |
| Step 6 | Remote Read-Only Mode (isomorphic-git) | Bloqueado por Step 5 |
| Step 7 | UI completa con todas las vistas | Bloqueado por Steps 4-6 |

---

## 8. Checklist de Release

### Para el equipo de Cyberseguridad

- [x] Validación de paths (no injection de caracteres de control)
- [x] Límites de tamaño de archivo (10MB max)
- [x] Límites de cantidad de archivos (10,000 max)
- [x] Permisos FSA verificados antes de escritura
- [x] Errores no exponen información sensible
- [x] No hay secrets en código ni logs
- [x] Atomicidad en writes (no estado parcial visible)
- [x] Tests pasando (315/315)

### Para el equipo de Deploy

- [x] Build exitoso (`pnpm build`)
- [x] TypeScript sin errores (`pnpm check`)
- [x] Linting limpio (`pnpm lint`)
- [x] Tests pasando (`pnpm test`)
- [x] No hay nuevas dependencias runtime
- [x] Node >= 20 requerido
- [x] Browser requirement: Chrome/Edge 86+ para Local Edit Mode

---

## 9. Contacto y Soporte

Para dudas técnicas sobre este release:
- **Responsable técnico:** Mavis (MiniMax Agent)
- **Documentación del proyecto:** `docs/ers.md`, `AGENTS.md`
- **Tests de referencia:** `tests/adapters/`, `tests/services/`

---

*Reporte generado automaticamente por Mavis — 22 de junio de 2026*
