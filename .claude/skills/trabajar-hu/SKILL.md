---
name: trabajar-hu
description: Arranca o continúa una historia de usuario del BACKLOG.md (HU-xx) de punta a punta respetando sus criterios de aceptación.
argument-hint: [HU-xx]
disable-model-invocation: true
---

Trabaja la historia **$ARGUMENTS** de `BACKLOG.md`. Si viene vacío, propone la siguiente historia
*Debe* del sprint actual (ver `/estado-sprint`) y espera confirmación antes de seguir.

## 1. Entender
1. Lee la historia completa en `BACKLOG.md`: criterios de aceptación (definición de terminado) y tareas.
2. Revisa dependencias: modelos, endpoints o utilidades de otras HU que necesite. Si una
   dependencia *Debe* no está hecha, avisa y pregunta si se adelanta.
3. Revisa el código existente antes de proponer nada nuevo (modelos, `services/`, `api/deps.py`,
   `src/api/client.js`, `src/utils/`).
4. Si un criterio choca con `CLAUDE.md` o con el código existente, o un campo depende del SRS sin
   validar (HU-01), detente y pregunta. No inventes campos del dominio.

## 2. Preparar
1. Si no estás en la rama de la historia, propone `git switch -c hu-xx-slug-corto` y créala con
   confirmación.
2. Cambia el estado de la historia a `En curso` en `BACKLOG.md`.
3. Presenta un plan breve: una línea por tarea `HU-xx.n`, en orden BD → API → Pruebas → Web.

## 3. Implementar, tarea por tarea
- [BD]/[API]: sigue la skill `nuevo-modulo` (modelo, migración revisada, esquemas, servicio, router).
- [Web]: sigue la skill `nueva-vista-mapa`.
- Cálculo MTD o historial: sigue la skill `revisar-mtd`.
- Consultas espaciales no triviales (área, traslapes, distancias, rutas): consulta al agente
  `experto-geoespacial` antes de escribirlas.
- [Doc]: delega en el agente `redactor-tecnico` solo si el usuario lo pide.
- [Campo]: no son de código; recuérdalas como pendientes del equipo.

Cada tarea [API] o [Web] lleva sus pruebas en el mismo cambio (skill `escribir-pruebas`); la
lógica de `services/` se escribe con la prueba primero. Si la tarea toca autenticación, permisos,
archivos subidos o datos personales, consulta al agente `auditor-seguridad`.

Al terminar cada tarea: ejecuta las pruebas y el linter que apliquen y marca su casilla `- [x]`.
Cambios pequeños y verificables; no implementes nada fuera de la historia.

## 4. Al final
Reporta en 2–3 líneas qué tareas quedaron hechas y cuáles pendientes, y sugiere `/cerrar-hu $ARGUMENTS`.
Recuerda actualizar `Backlog_Durazno_Icota.xlsx`. No hagas commit sin que el usuario lo pida.
