"""Prueba del flujo de consumo de la app móvil contra un servidor (HU-33).

Recorre, como lo haría la app: iniciar sesión → descargar los datos → resolver el QR de una
trampa → registrar la lectura (y reenviarla) → consultar el MTD → renovar la sesión. Cada
respuesta se compara con el código esperado y se valida contra el `openapi.json` que publica el
mismo servidor, y el resultado queda en un informe en Markdown.

    docker compose exec -e FLUJO_CORREO=... -e FLUJO_CLAVE=... api \\
        python -m app.scripts.flujo_movil --url http://nginx --informe /tmp/flujo.md

Las credenciales van por variables de entorno (no en la línea de comandos, que queda en el
historial). Registra una lectura real: úsese con un técnico de un predio de pruebas.
No importa nada de la aplicación: solo habla HTTP con el servidor.
"""

import argparse
import asyncio
import os
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from jsonschema import Draft202012Validator

PREFIJO = "/api/v1"
ZONA = ZoneInfo("America/Bogota")


@dataclass
class Paso:
    nombre: str
    metodo: str
    ruta: str
    esperado: int
    obtenido: int
    ms: float
    esquema: str  # «conforme», «no conforme: …» o «sin cuerpo»
    nota: str = ""
    detenido: bool = False

    @property
    def conforme(self) -> bool:
        return (
            not self.detenido
            and self.obtenido == self.esperado
            and not self.esquema.startswith("no conforme")
        )


class FlujoFallido(Exception):
    pass


class Flujo:
    def __init__(self, cliente: httpx.AsyncClient) -> None:
        self.cliente = cliente
        self.pasos: list[Paso] = []
        self.openapi: dict[str, Any] = {}
        self.encabezados: dict[str, str] = {}

    async def cargar_documentacion(self) -> None:
        respuesta = await self.cliente.get(f"{PREFIJO}/openapi.json")
        respuesta.raise_for_status()
        self.openapi = respuesta.json()

    async def llamar(
        self, nombre: str, metodo: str, plantilla: str, esperado: int, **kwargs: Any
    ) -> httpx.Response:
        """Hace la petición a `plantilla` (ruta documentada, p. ej. `/trampas/qr/{codigo}`) con
        `ruta=` ya resuelta si tiene parámetros. Registra el paso y valida el cuerpo contra el
        esquema documentado para ese código. Si el código no es el esperado, el flujo se detiene."""
        ruta = kwargs.pop("ruta", plantilla)
        inicio = time.perf_counter()
        respuesta = await self.cliente.request(
            metodo,
            f"{PREFIJO}{ruta}",
            headers={**self.encabezados, **kwargs.pop("headers", {})},
            **kwargs,
        )
        ms = (time.perf_counter() - inicio) * 1000
        paso = Paso(
            nombre,
            metodo,
            plantilla,
            esperado,
            respuesta.status_code,
            ms,
            self._validar(metodo, plantilla, respuesta),
        )
        self.pasos.append(paso)
        if respuesta.status_code != esperado:
            paso.nota = respuesta.text[:200]
            raise FlujoFallido(f"{nombre}: se esperaba {esperado} y llegó {respuesta.status_code}")
        return respuesta

    def _validar(self, metodo: str, plantilla: str, respuesta: httpx.Response) -> str:
        operacion = self.openapi["paths"].get(f"{PREFIJO}{plantilla}", {}).get(metodo.lower())
        if operacion is None:
            return "no conforme: el endpoint no está documentado"
        documentada = operacion["responses"].get(str(respuesta.status_code))
        if documentada is None:
            return f"no conforme: el código {respuesta.status_code} no está documentado"
        esquema = documentada.get("content", {}).get("application/json", {}).get("schema")
        if esquema is None or not respuesta.content:
            return "sin cuerpo"
        # Las referencias `#/components/...` se resuelven contra los componentes del documento.
        validador = Draft202012Validator({**esquema, "components": self.openapi["components"]})
        errores = sorted(validador.iter_errors(respuesta.json()), key=lambda e: list(e.path))
        if errores:
            ruta = "/".join(str(p) for p in errores[0].path) or "(raíz)"
            return f"no conforme: {ruta}: {errores[0].message[:120]}"
        return "conforme"


def _elegir_trampa(cambios: dict[str, Any], codigo_qr: str | None) -> dict[str, Any]:
    """La trampa del QR indicado o, si no se indica, la primera activa sin lectura hoy."""
    hoy = datetime.now(ZONA).date().isoformat()
    leidas_hoy = {
        lec["trampa_id"]
        for lec in cambios["lecturas"]["creados"]
        if lec["observado_en"][:10] == hoy and lec["estado"] != "rechazada"
    }
    for trampa in cambios["trampas"]["creados"]:
        if codigo_qr is not None:
            if trampa["codigo_qr"] == codigo_qr.upper():
                return trampa
        elif trampa["estado"] == "activa" and trampa["id"] not in leidas_hoy:
            return trampa
    raise FlujoFallido(
        "No hay una trampa activa sin lectura de hoy en los predios del usuario"
        if codigo_qr is None
        else f"El usuario no ve la trampa del QR {codigo_qr}"
    )


async def recorrer(
    cliente: httpx.AsyncClient, correo: str, clave: str, codigo_qr: str | None = None
) -> Flujo:
    flujo = Flujo(cliente)
    await flujo.cargar_documentacion()
    try:
        await _recorrer(flujo, correo, clave, codigo_qr)
    except FlujoFallido as error:
        flujo.pasos.append(Paso("Flujo detenido", "", "", 0, 0, 0, "", str(error), detenido=True))
    return flujo


async def _recorrer(flujo: Flujo, correo: str, clave: str, codigo_qr: str | None) -> None:
    movil = {"X-Cliente": "movil"}
    await flujo.llamar("Estado del servidor", "GET", "/health", 200)

    # 1. Iniciar sesión como cliente nativo: el token de renovación llega en el cuerpo.
    sesion = (
        await flujo.llamar(
            "Iniciar sesión",
            "POST",
            "/auth/token",
            200,
            data={"username": correo, "password": clave},
            headers=movil,
        )
    ).json()
    if not sesion.get("refresh_token"):
        raise FlujoFallido("El cliente móvil no recibió el token de renovación")
    flujo.encabezados = {"Authorization": f"Bearer {sesion['access_token']}"}
    yo = (await flujo.llamar("Usuario de la sesión", "GET", "/auth/yo", 200)).json()
    flujo.pasos[-1].nota = f"rol {yo['rol']}"

    # 2. Descargar lo necesario para trabajar sin conexión.
    cambios = (await flujo.llamar("Carga completa", "GET", "/sync/cambios", 200)).json()
    flujo.pasos[-1].nota = (
        f"{len(cambios['predios']['creados'])} predios, {len(cambios['trampas']['creados'])} "
        f"trampas, {len(cambios['rutas']['creados'])} rutas"
    )
    trampa = _elegir_trampa(cambios, codigo_qr)

    # 3. Leer el QR de la trampa en campo.
    resuelta = (
        await flujo.llamar(
            "Resolver el QR",
            "GET",
            "/trampas/qr/{codigo}",
            200,
            ruta=f"/trampas/qr/{trampa['codigo_qr']}",
        )
    ).json()
    if resuelta["trampa"]["id"] != trampa["id"]:
        raise FlujoFallido("El QR resolvió otra trampa")
    flujo.pasos[-1].nota = f"{resuelta['trampa']['codigo_ica']} · lote {resuelta['lote']['codigo']}"
    preparacion = (
        await flujo.llamar(
            "Preparar la lectura",
            "GET",
            "/visitas/lecturas/preparar",
            200,
            params={"trampa_id": trampa["id"]},
        )
    ).json()
    flujo.pasos[-1].nota = f"{preparacion['dias_exposicion']} días de exposición"

    # 4. Registrar la lectura (guardada sin conexión, con id del dispositivo) y reenviarla.
    jackson = trampa["tipo"] == "jackson"
    lectura = {
        "id": str(uuid.uuid4()),
        "trampa_id": trampa["id"],
        "observado_en": datetime.now(UTC).isoformat(),
        "capitata_machos": 2 if jackson else 0,
        "capitata_hembras": 1 if jackson else 0,
        "anastrepha": 0 if jackson else 3,
        "estado_trampa": "buena",
        "cambio_atrayente": False,
        "observaciones": "Prueba del flujo móvil (HU-33)",
        "posicion": trampa["geom"],
        "precision_m": 5,
    }
    for nombre, esperado in (("Registrar la lectura", "creada"), ("Reenviarla", "existente")):
        [resultado] = (
            await flujo.llamar(nombre, "POST", "/sync/lecturas", 200, json={"lecturas": [lectura]})
        ).json()["resultados"]
        if resultado["resultado"] != esperado:
            raise FlujoFallido(f"{nombre}: {resultado['resultado']} ({resultado['detalle']})")
        flujo.pasos[-1].nota = f"{resultado['resultado']} ({resultado['codigo']})"

    # 5. Consultar el MTD de la semana con la lectura recién registrada.
    hoy = datetime.now(ZONA).date()
    especie = "capitata" if jackson else "anastrepha"
    mtd = (
        await flujo.llamar(
            "Consultar el MTD",
            "GET",
            "/mtd",
            200,
            params={
                "predio_id": resuelta["lote"]["predio_id"],
                "desde": (hoy - timedelta(days=hoy.weekday())).isoformat(),
                "hasta": hoy.isoformat(),
                "especie": especie,
            },
        )
    ).json()
    [periodo] = mtd["periodo"]
    if periodo["moscas"] < 3:
        raise FlujoFallido("El MTD de la semana no incluye las moscas registradas")
    valor = "sin dato" if periodo["mtd"] is None else f"{periodo['mtd']:.4f}"
    flujo.pasos[-1].nota = (
        f"{especie}: M={periodo['moscas']}, T={periodo['trampas']}, "
        f"D={periodo['dias_promedio']:.2f}, MTD={valor}"
    )

    # 6. Renovar la sesión con el token del cuerpo (el teléfono no usa cookies).
    flujo.encabezados = {}
    await flujo.llamar(
        "Renovar la sesión",
        "POST",
        "/auth/renovar",
        200,
        json={"refresh_token": sesion["refresh_token"]},
        headers=movil,
    )


def informe(flujo: Flujo, url: str, inicio: datetime) -> str:
    conformes = sum(p.conforme for p in flujo.pasos)
    total = len(flujo.pasos)
    lineas = [
        "# Prueba del flujo de consumo móvil (HU-33)",
        "",
        f"- Servidor: `{url}`",
        f"- Fecha: {inicio.astimezone(ZONA):%d/%m/%Y %H:%M} (America/Bogota)",
        f"- Documentación usada: `{PREFIJO}/openapi.json` del mismo servidor "
        f"(versión {flujo.openapi.get('info', {}).get('version', '?')})",
        f"- Resultado: **{conformes} de {total} pasos conformes**",
        "",
        "| # | Paso | Petición | Esperado | Obtenido | ms | Esquema | Detalle |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, p in enumerate(flujo.pasos, start=1):
        peticion = f"`{p.metodo} {p.ruta}`" if p.metodo else ""
        lineas.append(
            f"| {i} | {p.nombre} | {peticion} | {p.esperado or ''} | {p.obtenido or ''} | "
            f"{p.ms:.0f} | {p.esquema} | {p.nota.replace('|', '/')} |"
        )
    return "\n".join(lineas) + "\n"


def main() -> None:
    argumentos = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argumentos.add_argument("--url", default="http://nginx", help="Dirección del servidor")
    argumentos.add_argument("--codigo-qr", help="QR de la trampa (por defecto, una activa)")
    argumentos.add_argument("--informe", type=Path, help="Archivo Markdown con los resultados")
    opciones = argumentos.parse_args()
    correo, clave = os.environ.get("FLUJO_CORREO"), os.environ.get("FLUJO_CLAVE")
    if not correo or not clave:
        sys.exit("Defina FLUJO_CORREO y FLUJO_CLAVE (un técnico de un predio de pruebas).")

    async def ejecutar() -> Flujo:
        async with httpx.AsyncClient(base_url=opciones.url, timeout=30) as cliente:
            return await recorrer(cliente, correo, clave, opciones.codigo_qr)

    inicio = datetime.now(UTC)
    flujo = asyncio.run(ejecutar())
    texto = informe(flujo, opciones.url, inicio)
    if opciones.informe:
        opciones.informe.write_text(texto, encoding="utf-8")
    print(texto)
    sys.exit(0 if all(p.conforme for p in flujo.pasos) else 1)


if __name__ == "__main__":
    main()
