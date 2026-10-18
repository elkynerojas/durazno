"""Siembra el predio de demostración para probar y presentar el aplicativo en línea.

    docker compose exec -e ADMIN_CORREO=admin@ejemplo.co api \\
        python -m app.scripts.sembrar_demostracion

Crea «Finca La Esperanza (demostración)» con tres lotes, seis trampas, rutas, plan de actividades
y cuatro semanas de lecturas (las anteriores a esta semana, validadas), y las cuentas ficticias
Laura Gómez (agrónoma) y Andrés Rojas (técnico), asignadas al predio, con la misma contraseña que
ADMIN_CORREO (se copia su hash: nadie ve la clave).

Todo se crea por la API (http://localhost:8000), con sus validaciones y cálculos, usando una cuenta
de administrador temporal que se elimina al terminar. Si el predio ya existe, no hace nada.
"""

import asyncio
import os
import secrets
import sys
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario
from app.services.auth import hashear_clave

PREDIO = os.environ.get("DEMO_PREDIO", "Finca La Esperanza (demostración)")
PREFIJO_ICA = os.environ.get("DEMO_PREFIJO_ICA", "NS-CAC-01")
API = os.environ.get("API_URL", "http://localhost:8000/api/v1")
ZONA = ZoneInfo("America/Bogota")
CUENTAS = {
    "agronoma": ("laura.gomez@demo.persica", "Laura Gómez", "agronomo"),
    "tecnico": ("andres.rojas@demo.persica", "Andrés Rojas", "tecnico"),
}


def cuadro(x0: float, y0: float, x1: float, y1: float) -> dict:
    anillo = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    return {"type": "Polygon", "coordinates": [anillo]}


class Api:
    def __init__(self, cliente: httpx.Client, correo: str, clave: str) -> None:
        respuesta = cliente.post(
            "/auth/token",
            data={"username": correo, "password": clave},
            headers={"X-Cliente": "movil"},
        )
        respuesta.raise_for_status()
        self.cliente = cliente
        self.encabezados = {"Authorization": f"Bearer {respuesta.json()['access_token']}"}

    def __call__(self, metodo: str, ruta: str, cuerpo: dict | None = None, **params):
        respuesta = self.cliente.request(
            metodo, ruta, json=cuerpo, params=params or None, headers=self.encabezados
        )
        if respuesta.status_code >= 400:
            sys.exit(f"{metodo} {ruta}: {respuesta.status_code} {respuesta.text[:300]}")
        return None if respuesta.status_code == 204 else respuesta.json()


async def preparar_cuentas(admin_correo: str) -> tuple[dict, dict, str]:
    """Cuenta temporal de administrador y cuentas de demostración con claves temporales."""
    temporales = {}
    async with SessionLocal() as session:
        admin = await session.scalar(
            select(Usuario).where(Usuario.correo == admin_correo, Usuario.deleted_at.is_(None))
        )
        if admin is None:
            sys.exit(f"No existe la cuenta {admin_correo}: créela antes de sembrar.")
        sembrador = f"sembrador.{secrets.token_hex(4)}@demo.persica"
        for clave_cuenta, (correo, nombre, rol) in {
            **CUENTAS,
            "sembrador": (sembrador, "Siembra temporal", "administrador"),
        }.items():
            clave = secrets.token_urlsafe(24)
            temporales[clave_cuenta] = (correo, clave)
            usuario = await session.scalar(select(Usuario).where(Usuario.correo == correo))
            if usuario is None:
                usuario = Usuario(correo=correo, nombre_completo=nombre, rol=rol)
                session.add(usuario)
            usuario.clave_hash = hashear_clave(clave)
            usuario.activo = True
            usuario.deleted_at = None
            usuario.autorizacion_datos_en = datetime.now(UTC)
        await session.commit()
    # Cada asyncio.run usa su propio bucle: el motor no puede reutilizar conexiones del anterior.
    await engine.dispose()
    return temporales, {c: temporales[c][0] for c in CUENTAS}, admin.clave_hash


async def cerrar_cuentas(temporales: dict, clave_hash_admin: str) -> None:
    """Las cuentas de demostración toman la clave del administrador; la temporal se elimina."""
    ahora = datetime.now(UTC)
    async with SessionLocal() as session:
        for clave_cuenta, (correo, _) in temporales.items():
            usuario = await session.scalar(select(Usuario).where(Usuario.correo == correo))
            usuario.sesion_valida_desde = ahora
            if clave_cuenta == "sembrador":
                usuario.activo = False
                usuario.deleted_at = ahora
            else:
                usuario.clave_hash = clave_hash_admin
        await session.commit()
    await engine.dispose()


def sembrar(cliente: httpx.Client, temporales: dict) -> str:
    admin = Api(cliente, *temporales["sembrador"])
    if any(p["nombre"] == PREDIO for p in admin("GET", "/predios")):
        return "El predio de demostración ya existe: no se siembra de nuevo."

    cuentas = {c["correo"]: c for c in admin("GET", "/usuarios")}
    agronoma = cuentas[temporales["agronoma"][0]]
    tecnico = cuentas[temporales["tecnico"][0]]
    predio = admin(
        "POST",
        "/predios",
        {
            "nombre": PREDIO,
            "vereda": "Icota",
            "municipio": "Cácota",
            "registro_ica": "54-125-0042",
            "limite": cuadro(-72.6448, 7.2642, -72.6382, 7.2683),
            "color_limite": "#ff6b35",
        },
    )
    for persona in (agronoma, tecnico):
        admin("PUT", f"/predios/{predio['id']}/usuarios/{persona['id']}")

    hoy = datetime.now(ZONA).date()
    lotes = [
        admin("POST", "/lotes", {"predio_id": predio["id"], **datos})
        for datos in (
            {"codigo": "L-01", "nombre": "Lote del río", "color": "#ffd60a",
             "geom": cuadro(-72.644, 7.265, -72.6415, 7.2675)},
            {"codigo": "L-02", "nombre": "Lote alto", "color": "#52b788",
             "geom": cuadro(-72.6415, 7.265, -72.639, 7.2675)},
            {"codigo": "L-03", "nombre": "Lote de la casa", "color": "#4cc9f0",
             "geom": cuadro(-72.644, 7.2675, -72.6415, 7.268)},
        )
    ]  # fmt: skip
    trampas = [
        admin(
            "POST",
            "/trampas",
            {
                "lote_id": lotes[lote]["id"],
                "codigo_ica": codigo,
                "tipo": tipo,
                "atrayente": "Trimedlure" if tipo == "jackson" else "Proteína hidrolizada",
                "fecha_instalacion": str(hoy - timedelta(days=40)),
                "geom": {"type": "Point", "coordinates": [lng, lat]},
            },
        )
        for codigo, lote, tipo, lng, lat in (
            (f"{PREFIJO_ICA}01", 0, "jackson", -72.6432, 7.2662),
            (f"{PREFIJO_ICA}02", 0, "mcphail", -72.6424, 7.2668),
            (f"{PREFIJO_ICA}03", 0, "jackson", -72.6421, 7.2657),
            (f"{PREFIJO_ICA}04", 1, "jackson", -72.6402, 7.2663),
            (f"{PREFIJO_ICA}05", 1, "mcphail", -72.6398, 7.2669),
            (f"{PREFIJO_ICA}06", 2, "jackson", -72.643, 7.26775),
        )
    ]
    for lote in lotes[:2]:
        propuesta = admin("GET", "/rutas/propuesta", lote_id=lote["id"])
        admin(
            "POST",
            "/rutas",
            {"lote_id": lote["id"], "trampas": [p["trampa_id"] for p in propuesta["paradas"]]},
        )

    anio, semana, _ = hoy.isocalendar()
    inicio = max(1, semana - 5)
    for lote in lotes[:2]:
        admin(
            "POST",
            "/plan",
            {
                "lote_id": lote["id"],
                "tipo": "visita_monitoreo",
                "anio": anio,
                "semana": inicio,
                "responsable_id": tecnico["id"],
                "repetir": {"cada_semanas": 1, "hasta_semana": min(52, semana + 8)},
            },
        )
    admin(
        "POST",
        "/plan",
        {
            "lote_id": lotes[0]["id"],
            "tipo": "cambio_atrayente",
            "tipo_trampa": "jackson",
            "anio": anio,
            "semana": inicio + 1,
            "responsable_id": tecnico["id"],
            "repetir": {"cada_semanas": 4, "hasta_semana": min(52, semana + 10)},
        },
    )
    for lote, labor, semana_labor, responsable, notas in (
        (lotes[1], "poda", semana + 2, agronoma, "Poda de formación después de la cosecha"),
        (lotes[0], "fertilizacion", semana, tecnico, None),
    ):
        admin(
            "POST",
            "/plan",
            {
                "lote_id": lote["id"],
                "tipo": "labor_cultural",
                "labor": labor,
                "anio": anio,
                "semana": min(52, semana_labor),
                "responsable_id": responsable["id"],
                **({"notas": notas} if notas else {}),
            },
        )

    # Cuatro semanas de lecturas del técnico y dos de esta semana (una tomada lejos de la trampa).
    campo = Api(cliente, *temporales["tecnico"])
    capturas = iter(
        [
            (2, 1, 0), (0, 0, 3), (1, 0, 0), (4, 2, 0), (0, 0, 1), (1, 1, 0),
            (3, 1, 0), (0, 0, 5), (2, 2, 0), (6, 3, 0), (0, 0, 2), (2, 0, 0),
            (1, 0, 0), (0, 0, 2), (0, 0, 0), (3, 2, 0), (0, 0, 4), (1, 0, 0),
            (5, 2, 0), (0, 0, 6), (2, 1, 0), (8, 4, 0), (0, 0, 3), (3, 1, 0),
        ]
    )  # fmt: skip
    ahora = datetime.now(UTC)
    lecturas = []
    for atras in (28, 21, 14, 7):
        for trampa in trampas:
            machos, hembras, anastrepha = next(capturas)
            jackson = trampa["tipo"] == "jackson"
            lng, lat = trampa["geom"]["coordinates"]
            lecturas.append(
                {
                    "id": str(uuid.uuid4()),
                    "trampa_id": trampa["id"],
                    "observado_en": (ahora - timedelta(days=atras)).isoformat(),
                    "capitata_machos": machos if jackson else 0,
                    "capitata_hembras": hembras if jackson else 0,
                    "anastrepha": 0 if jackson else (anastrepha or machos),
                    "estado_trampa": "buena",
                    "cambio_atrayente": False,
                    "posicion": {"type": "Point", "coordinates": [lng + 0.00004, lat]},
                    "precision_m": 6,
                }
            )
    for trampa, lejos, machos in ((trampas[0], False, 3), (trampas[3], True, 9)):
        lng, lat = trampa["geom"]["coordinates"]
        lecturas.append(
            {
                "id": str(uuid.uuid4()),
                "trampa_id": trampa["id"],
                "observado_en": (ahora - timedelta(hours=1)).isoformat(),
                "capitata_machos": machos,
                "capitata_hembras": 2,
                "anastrepha": 0,
                "estado_trampa": "buena",
                "cambio_atrayente": False,
                **(
                    {"observaciones": "Frutos maduros caídos alrededor de la trampa"}
                    if lejos
                    else {}
                ),
                "posicion": {
                    "type": "Point",
                    "coordinates": [lng + (0.0021 if lejos else 0.00003), lat],
                },
                "precision_m": 8,
            }
        )
    resultados = campo("POST", "/sync/lecturas", {"lecturas": lecturas})["resultados"]
    errores = [r for r in resultados if r["resultado"] == "error"]
    if errores:
        sys.exit(f"Lecturas con error: {errores[:3]}")
    for resultado in resultados[:24]:
        admin("POST", f"/visitas/lecturas/{resultado['id']}/revision", {"estado": "validada"})
    return (
        f"Predio «{PREDIO}» sembrado: {len(lotes)} lotes, {len(trampas)} trampas, 2 rutas, "
        f"plan de actividades y {len(lecturas)} lecturas."
    )


def main() -> None:
    admin_correo = os.environ.get("ADMIN_CORREO", "").strip().lower()
    if not admin_correo:
        sys.exit("Defina ADMIN_CORREO: la cuenta cuya contraseña tomarán las de demostración.")
    temporales, _, clave_hash_admin = asyncio.run(preparar_cuentas(admin_correo))
    try:
        with httpx.Client(base_url=API, timeout=60) as cliente:
            print(sembrar(cliente, temporales))
    finally:
        asyncio.run(cerrar_cuentas(temporales, clave_hash_admin))
    correos = ", ".join(c for c, _, _ in CUENTAS.values())
    print(f"Cuentas de demostración ({correos}) con la contraseña de {admin_correo}.")


if __name__ == "__main__":
    main()
