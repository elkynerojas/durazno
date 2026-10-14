---
name: nuevo-modulo
description: Crea una entidad del dominio de punta a punta (modelo PostGIS, migración, esquemas, endpoints /api/v1 y pruebas) siguiendo las convenciones del proyecto. Úsalo para lote, trampa, ruta, visita, lectura_trampa o plan_actividad.
argument-hint: [entidad] [descripción de campos]
---

Crea el módulo **$ARGUMENTS** siguiendo `CLAUDE.md` y `backend/CLAUDE.md`.

Antes de escribir código:
0. Ubica en `BACKLOG.md` la historia que pide este módulo: sus criterios de aceptación definen
   campos, validaciones y pruebas. Si no hay historia, pregunta antes de seguir.
1. Lee `backend/app/db/base.py` y los modelos existentes en `backend/app/models/`.
2. Propón en una lista breve los campos, tipos, geometría (si aplica), relaciones y
   restricciones, y los endpoints. Si algún campo no está claro (p. ej. campos del formulario
   de la trampa que aún no valida el personal de Icota), pregunta en lugar de inventarlo.

Luego, en este orden:
1. Modelo en `backend/app/models/<entidad>.py` heredando `EntidadSincronizable, Base`.
   Geometrías con SRID 4326 e índice espacial. Importarlo en `app/models/__init__.py`.
2. Migración: `docker compose exec api alembic revision --autogenerate -m "crear <entidad>"`.
   Revisa el archivo generado y corrige lo que Alembic no detecte. No la apliques sin
   confirmación.
3. Esquemas Pydantic en `backend/app/schemas/<entidad>.py` (`Crear` con `id` opcional,
   `Actualizar`, `Leer`). Geometrías como GeoJSON.
4. Lógica no trivial en `backend/app/services/<entidad>.py`.
5. Router en `backend/app/api/v1/endpoints/<grupo>.py`, registrado en `router.py`: listar
   (filtrando `deleted_at`), obtener, crear (idempotente por `id`), actualizar y borrado lógico.
   Cada endpoint con `summary` y respuestas de error documentadas. Protege con `UsuarioActualDep`
   (`backend/app/api/deps.py`) y restringe por rol según la historia (técnico registra, agrónomo
   administra, productor consulta).
6. Pruebas en `backend/tests/`, incluidas las validaciones geoespaciales (polígono inválido,
   trampa fuera de su lote), idempotencia por `id`, borrado lógico y acceso por rol (401/403).
   Para consultas espaciales no triviales consulta antes al agente `experto-geoespacial`.
7. Ejecuta `docker compose exec api ruff check .` y `docker compose exec api pytest`.

Marca en `BACKLOG.md` las tareas de la historia que quedaron hechas y termina con una línea de
lo creado y lo que queda pendiente.
