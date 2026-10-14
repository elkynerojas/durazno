---
name: estado-sprint
description: Reporta el avance del sprint actual según BACKLOG.md (historias, puntos hechos y pendientes, riesgos y qué sigue). Úsalo cuando pregunten cómo va el sprint, qué falta o qué sigue.
argument-hint: [S0-S5 opcional]
allowed-tools: Read, Grep, Bash(date *), Bash(git log *), Bash(git branch), Bash(git branch -a)
---

Reporta el estado del sprint **$ARGUMENTS** (si viene vacío, el sprint que corresponde a la fecha
de hoy según la tabla "Sprints" de `BACKLOG.md`). Solo lectura: no modifiques ningún archivo.

1. Lee `BACKLOG.md`. Identifica el sprint, sus fechas y sus historias.
2. Por cada historia del sprint: estado, prioridad, puntos, responsable y tareas `[x]` / total.
3. Calcula puntos hechos (historias `Hecho`) y en curso, y días hábiles restantes del sprint.
4. Señala también historias de otros sprints que estén `En curso` o adelantadas.
5. Contrasta con `git log --oneline -20` y `git branch`: si hay commits `HU-xx` cuya historia sigue
   `Por hacer`, avísalo como posible desfase del backlog.
6. Riesgos: historias *Debe* sin empezar cerca del fin del sprint; S4 es el sprint más cargado
   (si se atrasa se recortan primero *Podría* y luego *Debería*); tareas [Campo] que dependen de Icota.

Formato de salida, corto:
- Una línea de encabezado: sprint, fechas, días restantes, puntos hechos / total.
- Tabla: HU · título · estado · prioridad · pts · tareas.
- "Siguiente recomendado": la HU *Debe* de mayor prioridad sin dependencias pendientes.
- Riesgos en máximo 3 viñetas.
