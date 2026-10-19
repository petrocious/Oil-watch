🐳 This is a testapp  for kubernetes learning





Featuring a full 3 tier app, Wokring images, that deployed locally.



Build Local Frontend & Backend Images for Your K8s Cluster
Since you're on Proxmox + Kubernetes (likely a local cluster like kubeadm or k3s), you have two clean options for "local images":

Option    When to use
A. Local Docker Registry    Multi-node cluster (best practice) — every node can pull
B. ctr / crictl import into containerd    Single-node, or you want to skip a registry
I'll show both, plus the actual Dockerfiles, project layout, and build scripts for frontend + backend.

📁 Full Project Layout
text
oilwatch/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── html/
│       ├── index.html
│       ├── styles.css
│       └── app.js
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── db.py
│       ├── models.py
│       └── scraper.py
├── build.sh
└── push.sh
🥇 PART A — Local Docker Registry (Recommended for Multi-Node)

1. Install a local registry (on any node — or a 4th VM)
   bash
   docker run -d -p 5000:5000 --restart=always --name registry registry:2
   Verify:

bash
curl http://localhost:5000/v2/_catalog

# → {"repositories":[]}

2. Configure Kubernetes nodes to trust it
   On every K8s node, edit containerd:

bash
sudo nano /etc/containerd/config.toml
Find or add:

toml
[plugins."io.containerd.grpc.v1.cri".registry.mirrors."registry.local:5000"]
  endpoint = ["http://registry.local:5000"]

[plugins."io.containerd.grpc.v1.cri".registry.configs."registry.local:5000".tls]
  insecure_skip_verify = true
Then:

bash
sudo systemctl restart containerd
Simpler alternative — add a DNS entry on every node:

bash
echo "192.168.1.50  registry.local" | sudo tee -a /etc/hosts
Replace 192.168.1.50 with the IP of the machine running the registry.

🎨 FRONTEND — frontend/Dockerfile
dockerfile
FROM nginx:1.27-alpine

# Clean default content

RUN rm -rf /usr/share/nginx/html/* \
 && rm -f /etc/nginx/conf.d/default.conf

# Copy config & static site

COPY nginx.conf /etc/nginx/conf.d/oilwatch.conf
COPY html/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
frontend/nginx.conf
nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy to backend Service in same namespace
    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
    
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;
    
    location ~* \.(css|js|woff2?|png|svg|ico)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

}
Note: backend here is the K8s Service name (see 04-backend.yaml). NGINX resolves it via cluster DNS — no IPs needed.

🐍 BACKEND — backend/Dockerfile
dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps (for psycopg2)

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code

COPY app/ ./app/

EXPOSE 8000

# Healthcheck for K8s

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -fs http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
backend/requirements.txt
text
fastapi==0.115.0
uvicorn[standard]==0.30.6
psycopg2-binary==2.9.9
SQLAlchemy==2.0.35
httpx==0.27.2
apscheduler==3.10.4
pydantic==2.9.2
backend/app/main.py (minimal but complete)
python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from .db import init_db, get_series
from .scraper import fetch_and_store

app = FastAPI(title="OILWATCH API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    sched = BackgroundScheduler()
    sched.add_job(fetch_and_store, "interval", minutes=30, id="scrape")
    sched.start()
    fetch_and_store()  # seed immediately

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/prices")
def prices(days: int = 30):
    return {"series": get_series(days)}
backend/app/db.py
python
import os
from sqlalchemy import create_engine, text

DB_URL = os.getenv("DATABASE_URL", "postgresql://oiluser:StrongPassword123!@postgres:5432/oilprice")
engine = create_engine(DB_URL, pool_pre_ping=True)

def init_db():
    with engine.begin() as c:
        c.execute(text("""
            CREATE TABLE IF NOT EXISTS prices (
              id SERIAL PRIMARY KEY,
              symbol TEXT NOT NULL,
              ts TIMESTAMPTZ NOT NULL,
              value NUMERIC(10,4) NOT NULL,
              UNIQUE(symbol, ts)
            );
            CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts DESC);
        """))

def get_series(days: int = 30):
    out = {}
    with engine.connect() as c:
        for sym in ("ho", "ulsd", "rbob", "wti"):
            rows = c.execute(text("""
                SELECT EXTRACT(EPOCH FROM ts)*1000 AS t, value
                FROM prices WHERE symbol = :s
                  AND ts > NOW() - (:d || ' days')::interval
                ORDER BY ts
            """), {"s": sym, "d": days}).fetchall()
            out[sym] = [{"t": int(r[0]), "v": float(r[1])} for r in rows]
    return out
backend/app/scraper.py
python
import os, random
from datetime import datetime, timedelta
from sqlalchemy import text
from .db import engine

# Demo generator — swap for real EIA API later

BASE = {"ho": 2.85, "ulsd": 3.45, "rbob": 3.05, "wti": 78.5}

def fetch_and_store():
    now = datetime.utcnow()
    with engine.begin() as c:
        for sym, base in BASE.items():
            for h in range(0, 24, 6):
                ts = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=h)
                val = base + random.uniform(-0.15, 0.15)
                c.execute(text("""
                    INSERT INTO prices (symbol, ts, value)
                    VALUES (:s, :t, :v)
                    ON CONFLICT (symbol, ts) DO UPDATE SET value = EXCLUDED.value
                """), {"s": sym, "t": ts, "v": round(val, 3)})
    print(f"[scraper] stored {len(BASE)*4} rows at {now.isoformat()}")
🔌 To use real EIA data later: replace the loop with an httpx.get("https://api.eia.gov/v2/...") call. Everything else stays the same.

🏗️ build.sh — Build Both Images
bash
#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-registry.local:5000}"
TAG="${TAG:-v1}"

echo "▶ Building backend..."
docker build -t ${REGISTRY}/oilwatch-backend:${TAG} ./backend

echo "▶ Building frontend..."
docker build -t ${REGISTRY}/oilwatch-frontend:${TAG} ./frontend

echo "✅ Images built:"
docker images | grep oilwatch
Make it executable:

bash
chmod +x build.sh
./build.sh
📤 push.sh — Push to Local Registry
bash
#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-registry.local:5000}"
TAG="${TAG:-v1}"

for img in oilwatch-backend oilwatch-frontend; do
  echo "▶ Pushing ${img}..."
  docker push ${REGISTRY}/${img}:${TAG}
done

echo "✅ Pushed. Registry catalog:"
curl -s http://${REGISTRY}/v2/_catalog | python3 -m json.tool
Run:

bash
chmod +x push.sh
./push.sh
🥈 PART B — Alternative: Import Directly into containerd (No Registry)
If you don't want a registry (single-node cluster or dev), you can import images straight into containerd on each node.

1. Build with the plain names
   bash
   docker build -t oilwatch-frontend:v1 ./frontend
   docker build -t oilwatch-backend:v1  ./backend
2. Save & copy to nodes
   bash
   docker save oilwatch-frontend:v1 -o frontend.tar
   docker save oilwatch-backend:v1  -o backend.tar

scp frontend.tar backend.tar user@worker-1:/tmp/
scp frontend.tar backend.tar user@worker-2:/tmp/
3. Import into containerd on each node
bash

# On each node

sudo ctr -n k8s.io images import /tmp/frontend.tar
sudo ctr -n k8s.io images import /tmp/backend.tar

# Verify

sudo ctr -n k8s.io images ls | grep oilwatch
4. Use imagePullPolicy: Never in the manifests
yaml
containers:

- name: nginx
  image: oilwatch-frontend:v1
  imagePullPolicy: Never      # ← critical, otherwise K8s tries to pull
  ⚠️ Must repeat on every node. If a pod lands on a node without the image, it fails. That's why the registry is better for multi-node.

🚀 Deploy to Kubernetes
k8s/04-backend.yaml
yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: oil-price-app
spec:
  replicas: 1
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  selector:
    matchLabels: { app: backend }
  template:
    metadata:
      labels: { app: backend }
    spec:
      containers:
      - name: backend
        image: registry.local:5000/oilwatch-backend:v1
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8000
        envFrom:
        - secretRef: { name: db-secrets }
        readinessProbe:
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet: { path: /health, port: 8000 }
          initialDelaySeconds: 15
          periodSeconds: 20
        resources:
          requests: { cpu: "100m", memory: "128Mi" }
          limits:   { cpu: "500m", memory: "512Mi" }

---

apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: oil-price-app
spec:
  selector: { app: backend }
  ports:

- port: 8000
  targetPort: 8000
  k8s/05-frontend.yaml
  yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
  name: frontend
  namespace: oil-price-app
  spec:
  replicas: 2
  strategy:
  type: RollingUpdate
  rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  selector:
  matchLabels: { app: frontend }
  template:
  metadata:
    labels: { app: frontend }
  spec:
    containers:
  - name: nginx
    image: registry.local:5000/oilwatch-frontend:v1
    imagePullPolicy: IfNotPresent
    ports:
    - containerPort: 80
      readinessProbe:
      httpGet: { path: /, port: 80 }
      initialDelaySeconds: 3
      periodSeconds: 5
      livenessProbe:
      httpGet: { path: /, port: 80 }
      initialDelaySeconds: 10
      periodSeconds: 20
      resources:
      requests: { cpu: "50m", memory: "64Mi" }
      limits:   { cpu: "200m", memory: "128Mi" }

---

apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: oil-price-app
spec:
  type: NodePort
  selector: { app: frontend }
  ports:

- port: 80
  targetPort: 80
  nodePort: 30080
  Apply everything
  bash
  kubectl apply -f k8s/
  kubectl -n oil-price-app rollout status deployment/backend
  kubectl -n oil-price-app rollout status deployment/frontend
  Visit
  text
  http://<any-node-ip>:30080
  The /api/prices call will be proxied by NGINX → backend:8000 → Postgres, and return real (or scraped) data.

🔁 Update Workflow (Dev Loop)
After changing frontend or backend code:

bash

# 1. Rebuild with a new tag

TAG=v2 ./build.sh
TAG=v2 ./push.sh

# 2. Roll the deployment (zero-downtime)

kubectl -n oil-price-app set image deployment/frontend \
  nginx=registry.local:5000/oilwatch-frontend:v2

kubectl -n oil-price-app set image deployment/backend \
  backend=registry.local:5000/oilwatch-backend:v2

# 3. Watch it

kubectl -n oil-price-app rollout status deployment/frontend
kubectl -n oil-price-app rollout status deployment/backend
Or use kubectl rollout restart if you use :latest (not recommended).

✅ Quick Verification Checklist
bash

# Registry has both images?

curl http://registry.local:5000/v2/_catalog

# → {"repositories":["oilwatch-backend","oilwatch-frontend"]}

# Nodes can pull?

kubectl describe pod -n oil-price-app -l app=frontend | grep -A2 Events

# Backend healthy?

kubectl -n oil-price-app exec deploy/backend -- curl -s localhost:8000/health

# → {"status":"ok"}

# API returns data?

kubectl -n oil-price-app port-forward svc/backend 8000:8000 &
curl -s localhost:8000/prices?days=7 | head -c 300

# Frontend live?

curl -I http://<node-ip>:30080
🧠 TL;DR — What You Now Have
Component    Deliverable
Frontend image    registry.local:5000/oilwatch-frontend:v1 — NGINX + OILWATCH static site + /api proxy
Backend image    registry.local:5000/oilwatch-backend:v1 — FastAPI + SQLAlchemy + scheduler
Registry    Local registry:2 on port 5000, trusted by all K8s nodes
Deploy    kubectl apply -f k8s/ → zero-downtime rollout, health-checked, PVC-backed
Update loop    ./build.sh && ./push.sh && kubectl set image ...
Want me to also:

Add a Jenkinsfile that automates build.sh → push.sh → kubectl set image on every Git push?

Add a docker-compose.yml so you can test frontend+backend+postgres locally before pushing to K8s?

Wire the real EIA API (free key) into scraper.py so prices are live, not demo