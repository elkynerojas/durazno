"""Rechazo de contraseñas triviales (auditoría HU-06)."""

# Claves que aparecen primero en cualquier diccionario de ataque, más las obvias del proyecto.
COMUNES = {
    "12345678",
    "123456789",
    "1234567890",
    "87654321",
    "11111111",
    "00000000",
    "password",
    "password1",
    "contraseña",
    "contrasena",
    "qwertyui",
    "qwerty123",
    "abc12345",
    "iloveyou",
    "colombia",
    "colombia1",
    "durazno123",
    "icota123",
    "icota2026",
    "cacota123",
    "agronomo",
    "tecnico1",
}
SECUENCIAS = ("0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl")


def _es_secuencia(texto: str) -> bool:
    return any(texto in serie or texto in serie[::-1] for serie in SECUENCIAS)


def motivo_clave_debil(clave: str, correo: str | None = None) -> str | None:
    """Mensaje en español si la clave es trivial, o `None` si se acepta."""
    normalizada = clave.lower()
    if normalizada in COMUNES:
        return "La contraseña es demasiado común; use una frase o combinación propia"
    if len(set(normalizada)) < 4:
        return "La contraseña debe tener al menos 4 caracteres distintos"
    if _es_secuencia(normalizada):
        return "La contraseña no puede ser una secuencia de teclas o números"
    usuario = (correo or "").split("@")[0].lower()
    if len(usuario) >= 4 and usuario in normalizada:
        return "La contraseña no puede contener el correo del usuario"
    return None
