"""Límite de intentos fallidos de inicio de sesión, por correo.

El registro vive en memoria del proceso: se reinicia al reiniciar la API y no se comparte entre
réplicas. Basta mientras la API corra en una sola instancia.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field

# Tope de correos registrados: al llenarse se descarta el más antiguo, para que una avalancha de
# correos distintos no haga crecer la memoria ni el tiempo por petición.
MAX_CLAVES = 10_000


@dataclass
class LimiteIntentos:
    maximo: int
    ventana_s: float
    reloj: Callable[[], float] = time.monotonic
    max_claves: int = MAX_CLAVES
    _fallos: dict[str, list[float]] = field(default_factory=dict)

    def _vigentes(self, clave: str) -> list[float]:
        limite = self.reloj() - self.ventana_s
        fallos = [t for t in self._fallos.get(clave, []) if t > limite]
        if fallos:
            self._fallos[clave] = fallos
        else:
            self._fallos.pop(clave, None)
        return fallos

    def segundos_bloqueo(self, clave: str) -> int:
        """Segundos que faltan para poder intentar de nuevo (0 si no está bloqueado)."""
        fallos = self._vigentes(clave)
        if len(fallos) < self.maximo:
            return 0
        return max(1, int(fallos[-self.maximo] + self.ventana_s - self.reloj()) + 1)

    def registrar_fallo(self, clave: str) -> None:
        if clave not in self._fallos and len(self._fallos) >= self.max_claves:
            del self._fallos[next(iter(self._fallos))]
        fallos = self._fallos.setdefault(clave, [])
        fallos.append(self.reloj())
        del fallos[: -self.maximo]

    def reiniciar(self, clave: str | None = None) -> None:
        if clave is None:
            self._fallos.clear()
        else:
            self._fallos.pop(clave, None)
