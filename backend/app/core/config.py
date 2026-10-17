from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

CLAVES_DE_EJEMPLO = {"solo-desarrollo-cambie-esta-clave", "cambie_esta_clave_secreta"}
ENTORNOS_LOCALES = {"development", "test"}


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (ver .env.example en la raíz)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Durazno Icota API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    postgres_user: str = "icota"
    postgres_password: str = "icota"  # noqa: S105 - solo desarrollo; se toma de .env
    postgres_db: str = "durazno_icota"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # Firma de los tokens JWT. El valor por defecto solo sirve en desarrollo.
    secret_key: str = "solo-desarrollo-cambie-esta-clave"  # noqa: S105 - ver validación
    jwt_algoritmo: str = "HS256"
    token_minutos: int = 15
    renovacion_dias: int = 7
    # Tope absoluto de una sesión, aunque se renueve: luego hay que volver a iniciar sesión.
    sesion_max_dias: int = 30

    # Límite de intentos fallidos de inicio de sesión por correo.
    intentos_maximos: int = 5
    intentos_ventana_minutos: int = 15

    # Orígenes permitidos para CORS, separados por coma.
    cors_origins: str = "http://localhost:5173"

    # Dirección pública del aplicativo: el QR de cada trampa codifica <qr_url_base>/t/<código>.
    qr_url_base: str = "http://localhost:5173"

    @model_validator(mode="after")
    def _exigir_clave_segura(self) -> "Settings":
        if self.environment not in ENTORNOS_LOCALES and (
            self.secret_key in CLAVES_DE_EJEMPLO or len(self.secret_key) < 32
        ):
            raise ValueError(
                "SECRET_KEY insegura: fuera de desarrollo use al menos 32 caracteres "
                "aleatorios (openssl rand -hex 32)."
            )
        return self

    @model_validator(mode="after")
    def _exigir_qr_https(self) -> "Settings":
        if self.environment not in ENTORNOS_LOCALES and not self.qr_url_base.startswith("https://"):
            raise ValueError("QR_URL_BASE debe usar https:// fuera de desarrollo.")
        return self

    @property
    def database_url(self) -> str:
        # psycopg 3 sirve tanto para el motor asíncrono (API) como para Alembic.
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
