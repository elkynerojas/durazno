"""Modelos ORM del dominio.

Importa aquí cada modelo nuevo para que Alembic lo detecte al autogenerar
migraciones, por ejemplo:

    from app.models.lote import Lote  # noqa: F401
"""

from app.db.base import Base  # noqa: F401
from app.models.lote import Lote  # noqa: F401
from app.models.predio import Predio  # noqa: F401
from app.models.predio_usuario import PredioUsuario  # noqa: F401
from app.models.reemplazo_qr import ReemplazoQr  # noqa: F401
from app.models.trampa import Trampa  # noqa: F401
from app.models.usuario import Usuario  # noqa: F401
