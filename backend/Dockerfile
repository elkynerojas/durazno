FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# En producción se instalan solo las dependencias de ejecución (sin pytest, ruff, debugpy...).
ARG REQUISITOS=requirements-dev.txt
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r ${REQUISITOS}

COPY . .

EXPOSE 8000

# En desarrollo docker-compose sobrescribe este comando para aplicar
# migraciones y activar la recarga automática.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
