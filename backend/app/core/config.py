from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (ver .env.example en la raíz)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Durazno Icota API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    postgres_user: str = "icota"
    postgres_password: str = "icota"
    postgres_db: str = "durazno_icota"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # Orígenes permitidos para CORS, separados por coma.
    cors_origins: str = "http://localhost:5173"

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
