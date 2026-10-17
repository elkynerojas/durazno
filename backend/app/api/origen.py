"""Rechazo de escrituras que llegan desde otro sitio (CSRF, p. ej. un formulario externo que
inicia sesión a la víctima en la cuenta del atacante)."""

from app.core.config import ENTORNOS_LOCALES, Settings

METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


def origen_permitido(metodo: str, origen: str | None, settings: Settings) -> bool:
    """`False` si una petición que modifica datos trae un `Origin` que no es el del aplicativo.

    Sin `Origin` (app móvil, curl, mismo sitio en navegadores antiguos) se acepta: los navegadores
    actuales siempre lo envían en peticiones de otro sitio. En desarrollo no se aplica.
    """
    if metodo in METODOS_SEGUROS or origen is None:
        return True
    if settings.environment in ENTORNOS_LOCALES:
        return True
    return origen in settings.cors_origin_list
