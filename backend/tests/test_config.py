"""Validación de la configuración sensible."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

CLAVE_FUERTE = "a" * 64


@pytest.mark.parametrize("clave", ["solo-desarrollo-cambie-esta-clave", "corta"])
def test_produccion_rechaza_clave_insegura(clave):
    with pytest.raises(ValidationError, match="SECRET_KEY insegura"):
        Settings(environment="production", secret_key=clave)


def test_produccion_acepta_clave_fuerte():
    configuracion = Settings(
        environment="production", secret_key=CLAVE_FUERTE, qr_url_base="https://icota.co"
    )
    assert configuracion.secret_key == CLAVE_FUERTE


def test_produccion_exige_https_en_la_url_del_qr():
    with pytest.raises(ValidationError, match="QR_URL_BASE"):
        Settings(environment="production", secret_key=CLAVE_FUERTE, qr_url_base="http://icota.co")


def test_desarrollo_permite_clave_de_ejemplo():
    Settings(environment="development", secret_key="solo-desarrollo-cambie-esta-clave")
