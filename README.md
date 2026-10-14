# Durazno Icota — Trazabilidad del trampeo de moscas de la fruta

Aplicativo web para la gestión y trazabilidad geolocalizada del monitoreo de trampas de moscas
de la fruta en el cultivo de durazno de la vereda Icota (Cácota, Norte de Santander), alineado
con el Plan Nacional de Moscas de la Fruta del ICA.

Trabajo de grado — Tecnología en Gestión de Redes y Sistemas Teleinformáticos, ISER.

## Requisitos

- Docker Desktop (o Docker Engine con Compose v2).
- Visual Studio Code con las extensiones recomendadas (VS Code las sugiere al abrir la carpeta).
- Opcional: Claude Code (`CLAUDE.md` y `.claude/` ya traen el contexto del proyecto).

No hace falta instalar Python, Node ni PostgreSQL en el equipo: todo corre en contenedores.

## Primer arranque

```bash
cp .env.example .env        # en Windows (PowerShell): copy .env.example .env
docker compose up -d --build
```

| Servicio           | URL                          | Notas |
|--------------------|------------------------------|-------|
| Aplicativo web     | http://localhost:5173        | React + Vite con recarga en caliente |
| API (Swagger)      | http://localhost/docs   | Documentación OpenAPI |
| pgAdmin            | http://localhost:5050        | El servidor ya aparece registrado; pide la clave de `POSTGRES_PASSWORD` |
| PostgreSQL/PostGIS | `localhost:5432`             | Para SQLTools, QGIS u otros clientes (solo desde este equipo) |

En la barra superior del aplicativo debe aparecer **API ok · PostGIS 3.6…**; eso confirma que los
cuatro contenedores se comunican.

## Contenedores

| Servicio   | Imagen / base              | Función |
|------------|----------------------------|---------|
| `db`       | `postgis/postgis:18-3.6`   | Base de datos con extensión espacial |
| `api`      | `python:3.13-slim`         | FastAPI; aplica migraciones al arrancar |
| `frontend` | `node:22-alpine`           | React 19 + Vite, Leaflet |
| `pgadmin`  | `dpage/pgadmin4:9`         | Administración web de la base |

## Uso diario

```bash
docker compose up -d                       # levantar
docker compose stop                        # detener (conserva los datos)
docker compose logs -f api                 # ver logs
docker compose exec api pytest --cov       # pruebas del backend
docker compose exec frontend npm test      # pruebas del frontend (Vitest)
docker compose exec api python -m app.scripts.sembrar_e2e   # usuario de pruebas E2E
docker compose --profile e2e run --rm e2e  # pruebas E2E (Playwright)
docker compose exec api alembic revision --autogenerate -m "crear lote"
docker compose exec api alembic upgrade head
docker compose exec frontend npm install <paquete>
```

Las mismas acciones están en VS Code como tareas (`Ctrl+Shift+P` → *Tasks: Run Task*).

> `docker compose down -v` **borra la base de datos**. Úsalo solo si quieres empezar de cero.

## Depuración

- **API:** en VS Code, *Run and Debug* → “API: adjuntar depurador (Docker)”. Levanta la API con
  debugpy en el puerto 5678 (`docker-compose.debug.yml`).
- **Frontend:** “Frontend: abrir en Chrome”.

## Trabajo con Claude Code

- `CLAUDE.md` (raíz, `backend/` y `frontend/`): contexto del proyecto, dominio, fórmula del MTD y
  convenciones. Mantenerlo actualizado cuando cambie una decisión de diseño.
- `.claude/settings.json`: permisos compartidos (permite pruebas y linters; pide confirmación
  para migraciones y `git push`; bloquea leer `.env` y borrar volúmenes).
- `BACKLOG.md`: historias de usuario, criterios de aceptación y sprints; Claude trabaja a partir de él.
- Skills y agentes del proyecto en `.claude/skills/` y `.claude/agents/`; la tabla de cuándo usar
  cada uno está en `CLAUDE.md` (sección "Flujo de trabajo con IA"). Las más usadas:
  `/estado-sprint`, `/trabajar-hu HU-xx` y `/cerrar-hu HU-xx`.
- Preferencias personales: `CLAUDE.local.md` y `.claude/settings.local.json` (no se suben a Git).

## Solución de problemas

- **El puerto 5432 está ocupado:** cambia `POSTGRES_PORT_HOST` en `.env` (p. ej. 5433).
- **La recarga en caliente no funciona en Windows:** verifica `VITE_USE_POLLING=true` en `.env`.
  Para mejor rendimiento, clona el repositorio dentro de WSL 2.
- **Errores `\r` o `bad interpreter`:** el repositorio fuerza finales de línea LF
  (`.gitattributes`); vuelve a clonar si se clonó antes de este archivo.
