# FastAPI skill engine — use with Railway, Fly.io, Render, etc.
FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN mkdir -p /data

ENV PYTHONUNBUFFERED=1
# Writable dir for DNC queue SQLite (mount a volume at /data in production)
ENV DNC_QUEUE_DB_PATH=/data/dnc_queue.db

EXPOSE 8000

# Railway/Render set PORT
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'
