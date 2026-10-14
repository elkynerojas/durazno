"""Pruebas del límite de intentos fallidos con un reloj controlado."""

from app.services.intentos import LimiteIntentos


class Reloj:
    def __init__(self) -> None:
        self.ahora = 1000.0

    def __call__(self) -> float:
        return self.ahora


def test_bloquea_al_llegar_al_maximo_y_libera_al_vencer_la_ventana():
    reloj = Reloj()
    limite = LimiteIntentos(maximo=3, ventana_s=60, reloj=reloj)
    for _ in range(2):
        limite.registrar_fallo("a@ejemplo.com")
    assert limite.segundos_bloqueo("a@ejemplo.com") == 0

    limite.registrar_fallo("a@ejemplo.com")
    assert limite.segundos_bloqueo("a@ejemplo.com") == 61
    assert limite.segundos_bloqueo("otro@ejemplo.com") == 0

    reloj.ahora += 30
    assert limite.segundos_bloqueo("a@ejemplo.com") == 31
    reloj.ahora += 31
    assert limite.segundos_bloqueo("a@ejemplo.com") == 0


def test_los_fallos_viejos_salen_de_la_ventana():
    reloj = Reloj()
    limite = LimiteIntentos(maximo=2, ventana_s=60, reloj=reloj)
    limite.registrar_fallo("a@ejemplo.com")
    reloj.ahora += 61
    limite.registrar_fallo("a@ejemplo.com")
    assert limite.segundos_bloqueo("a@ejemplo.com") == 0


def test_reiniciar_borra_los_fallos():
    limite = LimiteIntentos(maximo=1, ventana_s=60, reloj=Reloj())
    limite.registrar_fallo("a@ejemplo.com")
    limite.registrar_fallo("b@ejemplo.com")
    limite.reiniciar("a@ejemplo.com")
    assert limite.segundos_bloqueo("a@ejemplo.com") == 0
    assert limite.segundos_bloqueo("b@ejemplo.com") > 0
    limite.reiniciar()
    assert limite.segundos_bloqueo("b@ejemplo.com") == 0


def test_descarta_el_correo_mas_antiguo_al_llegar_al_tope():
    limite = LimiteIntentos(maximo=1, ventana_s=60, reloj=Reloj(), max_claves=2)
    for correo in ("a@ejemplo.com", "b@ejemplo.com", "c@ejemplo.com"):
        limite.registrar_fallo(correo)
    assert limite.segundos_bloqueo("a@ejemplo.com") == 0
    assert limite.segundos_bloqueo("b@ejemplo.com") > 0
    assert limite.segundos_bloqueo("c@ejemplo.com") > 0


def test_guarda_como_maximo_tantos_fallos_como_el_limite():
    limite = LimiteIntentos(maximo=3, ventana_s=60, reloj=Reloj())
    for _ in range(50):
        limite.registrar_fallo("a@ejemplo.com")
    assert len(limite._fallos["a@ejemplo.com"]) == 3
