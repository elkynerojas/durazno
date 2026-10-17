import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Rol = Literal["tecnico", "agronomo", "productor"]
NombreCompleto = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)
]
Clave = Annotated[str, Field(min_length=8, max_length=128)]


class UsuarioCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: si se envía, reenviar el mismo `id` no duplica"
    )
    correo: EmailStr
    nombre_completo: NombreCompleto
    rol: Rol
    clave: Clave = Field(description="Contraseña inicial que el agrónomo entrega al titular")
    autorizacion_datos: bool = Field(
        description="Confirma que el titular fue informado del tratamiento de sus datos "
        "(Ley 1581 de 2012) y lo autorizó. Debe ser `true`."
    )

    @field_validator("correo")
    @classmethod
    def _normalizar_correo(cls, correo: str) -> str:
        return correo.lower()

    @field_validator("autorizacion_datos")
    @classmethod
    def _exigir_autorizacion(cls, valor: bool) -> bool:
        if not valor:
            raise ValueError("Se requiere la autorización del titular para tratar sus datos")
        return valor


class UsuarioActualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correo: EmailStr | None = None
    nombre_completo: NombreCompleto | None = None
    rol: Rol | None = None
    activo: bool | None = Field(default=None, description="`false` desactiva la cuenta")
    clave: Clave | None = Field(default=None, description="Restablece la contraseña")

    @field_validator("correo")
    @classmethod
    def _normalizar_correo(cls, correo: str | None) -> str | None:
        return correo.lower() if correo else correo

    @model_validator(mode="after")
    def _rechazar_nulos(self) -> "UsuarioActualizar":
        nulos = sorted(c for c in self.model_fields_set if getattr(self, c) is None)
        if nulos:
            raise ValueError(f"Estos campos no admiten null: {', '.join(nulos)}")
        return self


class UsuarioAdminLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    correo: str
    nombre_completo: str
    rol: Rol
    activo: bool
    autorizacion_datos_en: datetime | None
    created_at: datetime
    updated_at: datetime
