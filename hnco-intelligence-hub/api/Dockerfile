# HN.CO Intelligence Hub — API (FastAPI + OpenAI Agents SDK).
# Build from the hnco-intelligence-hub folder so ../shared/catalog.json is available:
#   docker build -f api/Dockerfile -t hnco-api .
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/api
COPY api/pyproject.toml ./
COPY api/app ./app
RUN pip install --no-cache-dir .
COPY shared /srv/shared
RUN useradd --system --uid 10001 hnco && mkdir -p /srv/api/data && chown -R hnco /srv/api/data
USER hnco
ENV ENVIRONMENT=production CATALOG_PATH=/srv/shared/catalog.json LOCAL_ARTIFACT_DIR=/srv/api/data/artifacts
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
