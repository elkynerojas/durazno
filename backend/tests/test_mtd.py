"""Pruebas del índice MTD (HU-28) con casos calculados a mano (skill /revisar-mtd)."""

import uuid
from datetime import UTC, date, datetime

import pypdfium2 as pdfium
import pytest

from app.api.v1.endpoints import mtd as mtd_endpoint
from app.api.v1.endpoints import visitas
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.mtd import (
    LecturaMtd,
    calcular_mtd,
    mtd_por_semana,
    resumir,
    semanas_entre,
)
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

T1, T2, T3, T4 = (uuid.uuid4() for _ in range(4))


def _lectura(trampa, tipo="jackson", capitata=0, anastrepha=0, dias=7, fecha=None, validada=True):
    return LecturaMtd(
        trampa_id=trampa,
        tipo_trampa=tipo,
        fecha=fecha or date(2026, 10, 14),
        capitata=capitata,
        anastrepha=anastrepha,
        dias_exposicion=dias,
        validada=validada,
    )


# --- calcular_mtd ---


def test_caso_simple():
    # 12 moscas, 4 trampas, 7 días: 12 / (4 × 7) = 12 / 28 = 0,428571…
    assert calcular_mtd(12, 4, 7) == pytest.approx(0.4286, abs=1e-4)


def test_sin_capturas_es_cero():
    # 0 / (4 × 7) = 0
    assert calcular_mtd(0, 4, 7) == 0


def test_sin_trampas_o_sin_dias_no_esta_definido():
    # T × D = 0: sin dato, nunca se divide por cero.
    assert calcular_mtd(0, 0, 0) is None
    assert calcular_mtd(5, 3, 0) is None


# --- resumir (M, T y D de una especie) ---


def test_cuatro_trampas_de_7_dias():
    # Jackson: 3 + 5 + 4 + 0 = 12 moscas; T = 4; D = 28 / 4 = 7; MTD = 12 / 28 = 0,4286.
    lecturas = [
        _lectura(T1, capitata=3),
        _lectura(T2, capitata=5),
        _lectura(T3, capitata=4),
        _lectura(T4, capitata=0),
    ]
    fila = resumir("capitata", lecturas)
    assert (fila.moscas, fila.trampas, fila.dias_promedio) == (12, 4, 7)
    assert fila.mtd == pytest.approx(0.4286, abs=1e-4)


def test_dos_especies_independientes():
    # Jackson T1 (6 capitata, 1 anastrepha) y McPhail T2 (2 capitata, 9 anastrepha), 7 días.
    # C. capitata solo cuenta en Jackson: 6 / (1 × 7) = 0,8571.
    # Anastrepha solo cuenta en McPhail: 9 / (1 × 7) = 1,2857.
    lecturas = [
        _lectura(T1, "jackson", capitata=6, anastrepha=1),
        _lectura(T2, "mcphail", capitata=2, anastrepha=9),
    ]
    capitata, anastrepha = resumir("capitata", lecturas), resumir("anastrepha", lecturas)
    assert (capitata.moscas, capitata.trampas) == (6, 1)
    assert capitata.mtd == pytest.approx(0.8571, abs=1e-4)
    assert (anastrepha.moscas, anastrepha.trampas) == (9, 1)
    assert anastrepha.mtd == pytest.approx(1.2857, abs=1e-4)


def test_dias_distintos_usan_el_promedio():
    # 10 moscas en T1 (7 días), T2 (5 días) y T3 (9 días): D = 21 / 3 = 7;
    # MTD = 10 / (3 × 7) = 0,4762.
    lecturas = [
        _lectura(T1, capitata=4, dias=7),
        _lectura(T2, capitata=2, dias=5),
        _lectura(T3, capitata=4, dias=9),
    ]
    fila = resumir("capitata", lecturas)
    assert (fila.moscas, fila.trampas, fila.dias_promedio) == (10, 3, 7)
    assert fila.mtd == pytest.approx(0.4762, abs=1e-4)


def test_una_trampa_leida_dos_veces_suma_sus_dias():
    # T1 leída dos veces (7 + 7 días, 2 + 3 moscas) y T2 una vez (14 días, 1 mosca):
    # M = 6; T = 2; D = 28 / 2 = 14; MTD = 6 / (2 × 14) = 0,2143.
    lecturas = [
        _lectura(T1, capitata=2, dias=7),
        _lectura(T1, capitata=3, dias=7),
        _lectura(T2, capitata=1, dias=14),
    ]
    fila = resumir("capitata", lecturas)
    assert (fila.moscas, fila.trampas, fila.dias_promedio) == (6, 2, 14)
    assert fila.mtd == pytest.approx(0.2143, abs=1e-4)


def test_cuenta_las_pendientes_de_validar():
    fila = resumir("capitata", [_lectura(T1, capitata=1), _lectura(T2, validada=False)])
    assert fila.pendientes == 1


# --- por semana ---


def test_semanas_del_rango_y_anios_de_53_semanas():
    assert semanas_entre(date(2026, 10, 12), date(2026, 10, 25)) == [(2026, 42), (2026, 43)]
    # 2026 tiene 53 semanas: el 28 de diciembre es de la S53 y el 4 de enero de 2027, de la S1.
    assert semanas_entre(date(2026, 12, 28), date(2027, 1, 4)) == [(2026, 53), (2027, 1)]
    # Un miércoles cuenta su semana entera.
    assert semanas_entre(date(2026, 10, 14), date(2026, 10, 14)) == [(2026, 42)]


def test_mtd_por_semana_incluye_las_semanas_sin_lecturas():
    lecturas = [
        _lectura(T1, capitata=7, fecha=date(2026, 10, 13)),  # S42
        _lectura(T1, capitata=14, fecha=date(2026, 10, 27)),  # S44
    ]
    filas = mtd_por_semana(lecturas, date(2026, 10, 12), date(2026, 11, 1), ["capitata"])
    assert [(f.semana, f.moscas, f.trampas, f.mtd) for f in filas] == [
        (42, 7, 1, 1.0),  # 7 / (1 × 7) = 1
        (43, 0, 0, None),  # sin lecturas: sin dato
        (44, 14, 1, 2.0),  # 14 / (1 × 7) = 2
    ]


# --- Endpoint GET /mtd (consolidado del predio) ---

URL = "/api/v1/mtd"
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


@pytest.fixture
async def predio(session, predio_vacio, crear_usuario, monkeypatch):
    monkeypatch.setattr(visitas, "ahora", lambda: datetime(2026, 10, 28, 18, 0, tzinfo=UTC))
    monkeypatch.setattr(mtd_endpoint, "hoy_bogota", lambda: date(2026, 10, 25))
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-01",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[A])),
    )
    session.add(lote)
    await session.flush()

    def trampa(codigo, tipo):
        return Trampa(
            lote_id=lote.id,
            codigo_ica=codigo,
            codigo_qr=generar_codigo(),
            tipo=tipo,
            atrayente="x",
            fecha_instalacion=date(2026, 10, 7),
            geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
        )

    trampas = {
        "J1": trampa("J1", "jackson"),
        "J2": trampa("J2", "jackson"),
        "M1": trampa("M1", "mcphail"),
    }
    session.add_all(trampas.values())
    await session.flush()
    tecnico = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[predio_vacio])
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[predio_vacio])
    return {"predio": predio_vacio, "trampas": trampas, "tecnico": tecnico, "agronomo": agronomo}


async def _registrar(cliente, datos, codigo, dia, machos=0, hembras=0, anastrepha=0):
    respuesta = await cliente.post(
        "/api/v1/visitas/lecturas",
        json={
            "trampa_id": str(datos["trampas"][codigo].id),
            "observado_en": f"2026-10-{dia:02d}T08:00:00-05:00",
            "capitata_machos": machos,
            "capitata_hembras": hembras,
            "anastrepha": anastrepha,
            "estado_trampa": "buena",
            "cambio_atrayente": False,
        },
        headers=encabezados(datos["tecnico"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


async def test_mtd_del_predio_calculado_a_mano(cliente, predio):
    # Instaladas el 7 de octubre. Semana 42 (12–18 oct), lecturas del 14: 7 días cada una.
    await _registrar(cliente, predio, "J1", 14, machos=3, hembras=1)
    await _registrar(cliente, predio, "J2", 14, machos=2)
    await _registrar(cliente, predio, "M1", 14, machos=1, anastrepha=5)  # la capitata no cuenta
    # Semana 43 (19–25 oct), lecturas del 21: 7 días desde la anterior.
    await _registrar(cliente, predio, "J1", 21)
    rechazada = await _registrar(cliente, predio, "J2", 21, machos=50)
    await cliente.post(
        f"/api/v1/visitas/lecturas/{rechazada['id']}/revision",
        json={"estado": "rechazada", "motivo": "Conteo imposible"},
        headers=encabezados(predio["agronomo"]),
    )

    respuesta = await cliente.get(
        URL,
        params={
            "predio_id": str(predio["predio"].id),
            "desde": "2026-10-12",
            "hasta": "2026-10-25",
        },
        headers=encabezados(predio["tecnico"]),
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    semanas = {(f["especie"], f["semana"]): f for f in cuerpo["semanas"]}
    resumen = lambda f: (f["moscas"], f["trampas"], f["dias_promedio"], f["mtd"])  # noqa: E731

    # C. capitata S42: M = 4 + 2 = 6; T = 2; D = 7; MTD = 6 / (2 × 7) = 0,4286.
    m, t, d, valor = resumen(semanas["capitata", 42])
    assert (m, t, d) == (6, 2, 7) and valor == pytest.approx(0.4286, abs=1e-4)
    # Anastrepha S42 (solo McPhail): 5 / (1 × 7) = 0,7143.
    m, t, d, valor = resumen(semanas["anastrepha", 42])
    assert (m, t, d) == (5, 1, 7) and valor == pytest.approx(0.7143, abs=1e-4)
    # C. capitata S43: la rechazada de J2 (50 moscas) no suma en M ni en T: 0 / (1 × 7) = 0.
    assert resumen(semanas["capitata", 43]) == (0, 1, 7, 0)
    # Anastrepha S43: sin lecturas McPhail, sin dato.
    assert resumen(semanas["anastrepha", 43]) == (0, 0, 0, None)

    # Periodo, C. capitata: M = 6; T = 2 (J1, J2); D = (7 + 7 + 7) / 2 = 10,5;
    # MTD = 6 / (2 × 10,5) = 6 / 21 = 0,2857.
    capitata = next(f for f in cuerpo["periodo"] if f["especie"] == "capitata")
    m, t, d, valor = resumen(capitata)
    assert (m, t, d, capitata["semana"]) == (6, 2, 10.5, None)
    assert valor == pytest.approx(0.2857, abs=1e-4)
    assert capitata["pendientes"] == 3  # registradas, aún sin validar


async def test_por_defecto_las_ultimas_12_semanas_y_una_especie(cliente, predio):
    respuesta = await cliente.get(
        URL,
        params={"predio_id": str(predio["predio"].id), "especie": "anastrepha"},
        headers=encabezados(predio["tecnico"]),
    )
    cuerpo = respuesta.json()
    assert (cuerpo["desde"], cuerpo["hasta"]) == ("2026-08-03", "2026-10-25")
    assert {f["especie"] for f in cuerpo["semanas"]} == {"anastrepha"}
    assert len(cuerpo["semanas"]) == 12
    assert all(f["mtd"] is None for f in cuerpo["semanas"])


async def test_permisos_y_rango_invalido(cliente, predio, crear_usuario, session):
    params = {"predio_id": str(predio["predio"].id)}
    assert (await cliente.get(URL, params=params)).status_code == 401
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[otro])
    assert (await cliente.get(URL, params=params, headers=encabezados(ajeno))).status_code == 404
    h = encabezados(predio["tecnico"])
    al_reves = await cliente.get(
        URL, params={**params, "desde": "2026-10-20", "hasta": "2026-10-01"}, headers=h
    )
    assert al_reves.status_code == 422
    largo = await cliente.get(
        URL, params={**params, "desde": "2020-01-01", "hasta": "2026-10-01"}, headers=h
    )
    assert largo.status_code == 422


# --- Historial de capturas y CSV (HU-27) ---

URL_HISTORIAL = "/api/v1/historial"


async def _escenario(cliente, predio):
    """Las lecturas del MTD calculado a mano, con una rechazada."""
    await _registrar(cliente, predio, "J1", 14, machos=3, hembras=1)
    await _registrar(cliente, predio, "J2", 14, machos=2)
    await _registrar(cliente, predio, "M1", 14, machos=1, anastrepha=5)
    await _registrar(cliente, predio, "J1", 21)
    rechazada = await _registrar(cliente, predio, "J2", 21, machos=50)
    await cliente.post(
        f"/api/v1/visitas/lecturas/{rechazada['id']}/revision",
        json={"estado": "rechazada", "motivo": "Conteo imposible"},
        headers=encabezados(predio["agronomo"]),
    )


async def test_historial_del_predio_con_serie_y_mtd_por_trampa(cliente, predio):
    await _escenario(cliente, predio)
    respuesta = await cliente.get(
        URL_HISTORIAL,
        params={
            "predio_id": str(predio["predio"].id),
            "desde": "2026-10-12",
            "hasta": "2026-10-25",
        },
        headers=encabezados(predio["tecnico"]),
    )
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 4  # la rechazada no aparece
    assert [(x["trampa_codigo_ica"], x["observado_en"][:10]) for x in cuerpo["lecturas"]][0] == (
        "J1",
        "2026-10-21",
    )
    # Serie: el 14, C. capitata en Jackson = 4 + 2 = 6 (la de McPhail no suma); Anastrepha = 5.
    assert cuerpo["serie"] == [
        {"fecha": "2026-10-14", "capitata": 6, "anastrepha": 5, "lecturas": 3},
        {"fecha": "2026-10-21", "capitata": 0, "anastrepha": 0, "lecturas": 1},
    ]
    j1 = next(
        x
        for x in cuerpo["lecturas"]
        if x["trampa_codigo_ica"] == "J1" and x["observado_en"].startswith("2026-10-14")
    )
    # MTD de J1 el 14: 4 ÷ (1 × 7) = 0,5714.
    assert j1["mtd"] == pytest.approx(0.5714, abs=1e-4)
    m1 = next(x for x in cuerpo["lecturas"] if x["trampa_codigo_ica"] == "M1")
    assert m1["mtd"] == pytest.approx(5 / 7, abs=1e-4)  # McPhail: Anastrepha


async def test_historial_filtra_por_especie_trampa_y_pagina(cliente, predio):
    await _escenario(cliente, predio)
    h = encabezados(predio["tecnico"])
    rango = {"desde": "2026-10-12", "hasta": "2026-10-25"}
    anastrepha = await cliente.get(
        URL_HISTORIAL,
        params={"predio_id": str(predio["predio"].id), "especie": "anastrepha", **rango},
        headers=h,
    )
    assert [x["trampa_codigo_ica"] for x in anastrepha.json()["lecturas"]] == ["M1"]

    params = {"trampa_id": str(predio["trampas"]["J1"].id), "por_pagina": 1, **rango}
    pagina2 = (await cliente.get(URL_HISTORIAL, params={**params, "pagina": 2}, headers=h)).json()
    assert (pagina2["total"], pagina2["pagina"]) == (2, 2)
    assert [x["observado_en"][:10] for x in pagina2["lecturas"]] == ["2026-10-14"]
    assert len(pagina2["serie"]) == 2  # la serie no se pagina


async def test_exportar_el_historial_a_csv(cliente, predio):
    await _escenario(cliente, predio)
    respuesta = await cliente.get(
        f"{URL_HISTORIAL}.csv",
        params={
            "lote_id": str(next(iter(predio["trampas"].values())).lote_id),
            "desde": "2026-10-12",
            "hasta": "2026-10-25",
        },
        headers=encabezados(predio["tecnico"]),
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "text/csv; charset=utf-8"
    assert respuesta.headers["content-disposition"] == (
        'attachment; filename="historial-lote-L-01-20261012-20261025.csv"'
    )
    texto = respuesta.content.decode("utf-8")
    assert texto.startswith("﻿")
    lineas = texto.lstrip("﻿").splitlines()
    assert lineas[0].split(";")[:3] == ["Fecha y hora", "Lote", "Trampa (código ICA)"]
    assert len(lineas) == 5  # encabezado + 4 lecturas (sin la rechazada)
    # De la más antigua a la más reciente, hora de Bogotá y coma decimal: 4 ÷ 7 = 0,5714.
    assert lineas[1] == "14/10/2026 08:00;L-01;J1;Jackson;3;1;0;7;0,5714;registrada"
    assert "Persona de Prueba" not in texto  # sin datos personales


async def test_historial_permisos_y_ambito(cliente, predio, crear_usuario, session):
    params = {"predio_id": str(predio["predio"].id)}
    assert (await cliente.get(URL_HISTORIAL, params=params)).status_code == 401
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[otro])
    h = encabezados(ajeno)
    assert (await cliente.get(URL_HISTORIAL, params=params, headers=h)).status_code == 404
    assert (await cliente.get(f"{URL_HISTORIAL}.csv", params=params, headers=h)).status_code == 404
    sin_ambito = await cliente.get(URL_HISTORIAL, headers=encabezados(predio["tecnico"]))
    assert sin_ambito.status_code == 422


# --- Reporte MTD para el ICA en CSV y PDF (HU-29) ---


def _texto_pdf(pdf: bytes) -> str:
    return "\n".join(p.get_textpage().get_text_bounded() for p in pdfium.PdfDocument(pdf))


async def test_reporte_csv_con_el_mtd_calculado_a_mano(cliente, predio):
    await _escenario(cliente, predio)
    predio["predio"].registro_ica = "54-125-0001"
    respuesta = await cliente.get(
        f"{URL}/reporte.csv",
        # Del miércoles 14 al domingo 25: la semana 42 va recortada desde el 14.
        params={
            "predio_id": str(predio["predio"].id),
            "desde": "2026-10-14",
            "hasta": "2026-10-25",
        },
        headers=encabezados(predio["tecnico"]),
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "text/csv; charset=utf-8"
    assert respuesta.headers["content-disposition"] == (
        'attachment; filename="mtd-Finca-Icota-20261014-20261025.csv"'
    )
    texto = respuesta.content.decode("utf-8")
    assert texto.startswith("﻿")
    lineas = texto.lstrip("﻿").splitlines()
    assert lineas[0].split(";")[-5:] == [
        "M (moscas)",
        "T (trampas revisadas)",
        "D (días promedio)",
        "MTD",
        "Lecturas sin validar",
    ]
    assert len(lineas) == 5  # encabezado + 2 especies × 2 semanas
    predio_csv = "Finca Icota;54-125-0001;Cácota;Icota"
    # C. capitata S42: 6 ÷ (2 × 7) = 0,4286; tres lecturas registradas sin validar.
    assert lineas[1] == (
        f"{predio_csv};2026;42;14/10/2026;18/10/2026;Ceratitis capitata;Jackson + trimedlure;"
        "6;2;7,00;0,4286;2"
    )
    # C. capitata S43: la rechazada no cuenta; 0 ÷ (1 × 7) = 0.
    assert lineas[2].endswith(
        ";2026;43;19/10/2026;25/10/2026;Ceratitis capitata;Jackson + trimedlure;0;1;7,00;0,0000;1"
    )
    # Anastrepha S43: sin lecturas McPhail, MTD vacío (sin dato).
    assert lineas[4].endswith(";Anastrepha spp.;McPhail + proteína hidrolizada;0;0;0,00;;0")
    assert "Persona de Prueba" not in texto  # sin datos personales


async def test_reporte_pdf_con_consolidado_y_semanas(cliente, predio):
    await _escenario(cliente, predio)
    respuesta = await cliente.get(
        f"{URL}/reporte.pdf",
        params={
            "predio_id": str(predio["predio"].id),
            "desde": "2026-10-12",
            "hasta": "2026-10-25",
        },
        headers=encabezados(predio["agronomo"]),
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/pdf"
    assert respuesta.headers["content-disposition"].endswith('-20261012-20261025.pdf"')
    texto = _texto_pdf(respuesta.content)
    assert "Finca Icota" in texto and "Periodo: 12/10/2026 a 25/10/2026" in texto
    # Consolidado de C. capitata: 6 ÷ (2 × 10,5) = 0,2857; Anastrepha: 5 ÷ (1 × 7) = 0,7143.
    assert "0,2857" in texto and "0,7143" in texto
    assert "2026-S42" in texto and "0,4286" in texto
    assert "sin dato" in texto  # Anastrepha S43
    assert "Incluye 4 lecturas sin validar" in texto
    assert "Página 1" in texto


async def test_reporte_permisos_y_rango(cliente, predio, crear_usuario, session):
    params = {"predio_id": str(predio["predio"].id)}
    for formato in ("csv", "pdf"):
        url = f"{URL}/reporte.{formato}"
        assert (await cliente.get(url, params=params)).status_code == 401
        productor = await crear_usuario(
            _correo("productor"), rol="productor", predios=[predio["predio"]]
        )
        assert (
            await cliente.get(url, params=params, headers=encabezados(productor))
        ).status_code == 200
        otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
        session.add(otro)
        await session.flush()
        ajeno = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[otro])
        assert (
            await cliente.get(url, params=params, headers=encabezados(ajeno))
        ).status_code == 404
        al_reves = await cliente.get(
            url,
            params={**params, "desde": "2026-10-20", "hasta": "2026-10-01"},
            headers=encabezados(predio["tecnico"]),
        )
        assert al_reves.status_code == 422
