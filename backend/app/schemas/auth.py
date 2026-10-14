import uuid

from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - tipo de token OAuth2, no es una clave


class UsuarioLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre_usuario: str
    nombre_completo: str
    rol: str
