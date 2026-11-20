# Stage 1: Build React + TypeScript + Tailwind + Firebase Auth/Firestore Frontend
FROM node:22-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
ENV VITE_API_BASE_URL=""
RUN npm run build

# Stage 2: Production FastAPI + XGBoost Adaptive Engine for Google Cloud Run
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    FOREXA_STORAGE=local \
    GCP_PROJECT_ID=forexa-e5dc7 \
    GCP_REGION=asia-south1 \
    PORT=8080

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY data/processed /app/data/processed
COPY data/artifacts /app/data/artifacts
COPY data/forexa.duckdb /app/data/forexa.duckdb
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

EXPOSE 8080
CMD ["uvicorn", "forexa.api:app", "--host", "0.0.0.0", "--port", "8080"]
