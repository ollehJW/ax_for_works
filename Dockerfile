FROM node:24-alpine AS frontend
WORKDIR /build
COPY .build/ca-certificates.crt /tmp/build-ca.crt
COPY frontend/package*.json ./
RUN NODE_EXTRA_CA_CERTS=/tmp/build-ca.crt npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./backend/requirements.txt
COPY .build/ca-certificates.crt /etc/ssl/certs/ax-ca-bundle.crt
ENV AX_UPSTREAM_CA_BUNDLE=/etc/ssl/certs/ax-ca-bundle.crt
RUN pip install --cert /etc/ssl/certs/ax-ca-bundle.crt --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY config/ ./config/
COPY --from=frontend /build/dist ./frontend/dist/
USER 1000:1000
EXPOSE 8443
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8443", "--ssl-certfile", "/tls/fullchain.pem", "--ssl-keyfile", "/tls/privkey.pem", "--no-proxy-headers"]
