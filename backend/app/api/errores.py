"""Cuerpo de las respuestas de error en el esquema OpenAPI (HU-31).

Los endpoints documentan sus errores solo con `description`; aquí se les añade el cuerpo que
envía FastAPI (`{"detail": "..."}`) para que la app móvil sepa qué leer sin probar la API.
"""

from typing import Any

ESQUEMA_ERROR = {
    "title": "Error",
    "type": "object",
    "required": ["detail"],
    "properties": {
        "detail": {
            "type": "string",
            "title": "Detalle",
            "description": "Mensaje en español, listo para mostrarlo al usuario",
        }
    },
}
REF_ERROR = {"$ref": "#/components/schemas/Error"}
# Mensajes exactos que se conocen; en los demás códigos el ejemplo es la descripción.
EJEMPLOS = {
    "401": "Sesión inválida o expirada",  # UsuarioActualDep (`app/api/deps.py`)
    "403": "No tiene permiso para realizar esta acción",  # requiere_rol
}
EJEMPLO_INICIO_SESION = "Correo o contraseña incorrectos"


def documentar_errores(esquema: dict[str, Any]) -> dict[str, Any]:
    esquema.setdefault("components", {}).setdefault("schemas", {})["Error"] = ESQUEMA_ERROR
    for ruta, operaciones in esquema["paths"].items():
        for operacion in operaciones.values():
            for codigo, respuesta in operacion.get("responses", {}).items():
                if codigo == "422":
                    _validacion_o_negocio(respuesta)
                elif codigo[0] in "45" and "content" not in respuesta:
                    detalle = EJEMPLOS.get(codigo, respuesta["description"])
                    if codigo == "401" and ruta.endswith("/auth/token"):
                        detalle = EJEMPLO_INICIO_SESION
                    respuesta["content"] = {
                        "application/json": {"schema": REF_ERROR, "example": {"detail": detalle}}
                    }
    return esquema


def _validacion_o_negocio(respuesta: dict[str, Any]) -> None:
    """422: la lista de errores de Pydantic o, si lo lanza una regla del dominio, un texto."""
    contenido = respuesta.setdefault("content", {}).setdefault("application/json", {})
    validacion = contenido.get("schema", {"$ref": "#/components/schemas/HTTPValidationError"})
    contenido["schema"] = {"anyOf": [validacion, REF_ERROR]}
