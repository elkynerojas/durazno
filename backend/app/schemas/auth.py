import uuid

from pydantic import BaseModel, ConfigDict, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = Field(
        default=None,
        description="Solo para clientes nativos (cabecera `X-Cliente: movil`). En el navegador "
        "viaja en la cookie `HttpOnly` `icota_renovacion` y aquí llega `null`.",
    )
    token_type: str = "bearer"  # noqa: S105 - tipo de token OAuth2, no es una clave
    expires_in: int = Field(description="Segundos de vigencia del token de acceso")


class RenovarEntrada(BaseModel):
    refresh_token: str | None = Field(
        default=None,
        description="Solo clientes nativos. El navegador no envía cuerpo: usa la cookie.",
    )


class UsuarioLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    correo: str
    nombre_completo: str
    rol: str
