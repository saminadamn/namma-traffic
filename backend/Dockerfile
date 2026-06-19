FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p cache && \
    python -c "\
from astram_routing.graph import load_graph; \
load_graph(backend='osmnx', cache_path='cache/bengaluru_drive.graphml', osmnx_dist_from_point=(12.9716, 77.5946, 20000))" \
    || echo "OSM pre-cache skipped — will download on first request"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
