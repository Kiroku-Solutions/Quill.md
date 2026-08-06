# Hocuspocus Server

Este es el servidor WebSocket de Hocuspocus autónomo para el soporte de colaboración en tiempo real en `quill.md`.

## Instalación y Ejecución Local

Para ejecutar localmente (requiere Node 22+ y pnpm):

```bash
pnpm install
pnpm start
```

## Docker Compose

Para un despliegue de producción usando Docker:

```bash
docker compose up -d
```

El servidor escuchará en el puerto 1234 y montará un volumen `data` para persistencia en SQLite.
