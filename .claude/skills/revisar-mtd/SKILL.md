---
name: revisar-mtd
description: Revisa o implementa el cálculo del índice MTD (moscas/trampa/día) y sus pruebas contra casos calculados a mano según el Manual Técnico de Trampeo del ICA. Úsalo al tocar cualquier código del cálculo o del historial MTD.
---

Revisa el cálculo del MTD del proyecto.

Fórmula (Manual Técnico de Trampeo del ICA): `MTD = M / (T × D)`, donde M = moscas capturadas
de una especie en el periodo, T = trampas revisadas y D = días promedio de exposición.

Verifica:
1. Se calcula por especie o tipo de trampa (Jackson/*C. capitata* separado de
   McPhail/*Anastrepha*), nunca mezclado.
2. Solo cuentan trampas activas y lecturas sin `deleted_at`; las lecturas `rechazada` se excluyen
   (HU-26).
3. Los días de exposición salen de la lectura (fecha de revisión menos la de la revisión o
   el cebado anterior), no se asumen.
4. `T × D = 0` devuelve `null`, sin dividir por cero.
5. El consolidado es a nivel de predio; los historiales por lote y por trampa son de consulta.
6. Redondeo: el valor se guarda sin redondear; se redondea solo al presentar (4 decimales).
7. El resultado expone M, T y D usados junto al MTD (HU-28), agrupado por especie y semana ISO
   (ojo con los años de 53 semanas). `calcular_mtd` vive en `backend/app/services/mtd.py` como
   función pura, sin acceso a la base.

Pruebas mínimas (crea las que falten en `backend/tests/test_mtd.py`), cada una con el cálculo a
mano en un comentario:
- Caso simple: 12 moscas, 4 trampas, 7 días → 12 / (4 × 7) = 0,4286.
- Caso sin capturas → 0.
- Caso sin trampas revisadas → `null`.
- Caso con dos especies → dos MTD independientes.
- Caso con días de exposición distintos entre trampas → usa el promedio.
- Caso con una lectura rechazada → no suma en M ni en T.

Ejecuta `docker compose exec api pytest tests/test_mtd.py` y reporta el resultado.
