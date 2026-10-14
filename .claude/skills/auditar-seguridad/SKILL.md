---
name: auditar-seguridad
description: Ejecuta la auditoría de seguridad del proyecto — reglas de seguridad de ruff, vulnerabilidades de dependencias Python y npm, búsqueda de secretos con gitleaks y revisión del código con el agente auditor-seguridad — y entrega un reporte por gravedad. No modifica nada.
argument-hint: [alcance opcional: rama, archivos o HU-xx]
---

Audita la seguridad de **$ARGUMENTS** (por defecto, los cambios de la rama frente a `main`;
si no hay cambios, todo el proyecto). Solo lectura: no corrijas nada sin que el usuario lo pida.

1. Herramientas automáticas (reporta la salida relevante de cada una):
   - `docker compose exec api ruff check . --select S`
   - `docker compose exec api pip-audit -r requirements.txt`
   - `docker compose exec frontend npm audit --omit=dev`
   - `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.24.2 git /repo --no-banner`
2. Lanza el agente `auditor-seguridad` sobre el mismo alcance.
3. Revisa la configuración si cambió: `docker-compose*.yml` (puertos de db y pgAdmin solo en
   `127.0.0.1`), `nginx/*.conf` (cabeceras), `.env.example` (sin secretos reales),
   `backend/app/core/config.py` (validación de `SECRET_KEY`). No leas `.env`.

Formato del reporte:
- Tabla: gravedad (Crítica / Alta / Media / Baja) · hallazgo · `archivo:línea` · corrección sugerida.
- Dependencias vulnerables con la versión que corrige.
- Una línea final: apto o no apto para fusionar.
