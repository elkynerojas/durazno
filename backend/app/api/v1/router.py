from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, usuarios

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(usuarios.router)

# Grupos de servicios previstos (Tabla 2 de la propuesta). Regístralos aquí
# a medida que se implementen, cada uno en app/api/v1/endpoints/<grupo>.py:
#   auth, usuarios, lotes, trampas (incluye QR), rutas, visitas, mtd, plan
