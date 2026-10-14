---
name: cerrar-hu
description: Verifica que una historia del BACKLOG.md cumple todos sus criterios de aceptación y convenciones, y la deja lista para revisión con su mensaje de commit.
argument-hint: HU-xx
disable-model-invocation: true
---

Cierra la historia **$ARGUMENTS**.

1. Lanza el agente `verificador-criterios` con la historia $ARGUMENTS. Espera su tabla de
   criterios y tareas (cumple / parcial / no cumple) y el resultado de pruebas y linters.
2. En paralelo, sobre los cambios de la rama frente a `main` (`git diff main...HEAD` más lo no
   commiteado), lanza los agentes `revisor-convenciones` y `auditor-seguridad`.
3. Si la historia toca un flujo de usuario, ejecuta las E2E:
   `docker compose exec api python -m app.scripts.sembrar_e2e` y
   `docker compose --profile e2e run --rm e2e`.
4. Consolida en una sola respuesta:
   - Criterios que no cumplen o parciales, con lo que falta.
   - Hallazgos de convenciones y de seguridad ordenados por gravedad (los de seguridad Crítica o
     Alta bloquean el cierre).
   - Pruebas y linters: pasaron o fallaron (con la salida relevante).
5. Si hay pendientes: no cambies el estado; pregunta si se corrigen ahora.
6. Si todo cumple:
   - Marca las casillas que falten y cambia el estado a `En revisión` en `BACKLOG.md`
     (pasa a `Hecho` solo cuando el usuario confirme la revisión del compañero o el merge).
   - Propón el mensaje de commit: `HU-xx: <resumen en infinitivo>` con viñetas de lo hecho.
     No hagas commit ni push sin confirmación.
   - Recuerda actualizar `Backlog_Durazno_Icota.xlsx`.
