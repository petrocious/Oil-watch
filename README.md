# 📈 Stock Watcher

> A **cloud-native, production-ready** stock price monitoring web application built with Python, Flask, MySQL, Redis, and Kubernetes.

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.0-black?logo=flask)
![Docker](https://img.shields.io/badge/Docker-containerized-2496ED?logo=docker)
![Kubernetes](https://img.shields.io/badge/Kubernetes-orchestrated-326CE5?logo=kubernetes)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🚀 Overview

**Stock Watcher** is a real-time stock price watcher that pulls market data from **Yahoo Finance** (free source), caches hot data in **Redis**, persists queries and price snapshots in **MySQL**, and exposes the data through a modern **Flask web dashboard** and REST API.

The application is designed to be **container-first** and **Kubernetes-native**, with production-grade features like:

- 📊 Resource limits & requests to prevent memory/CPU leaks
- 🔐 Secrets-based configuration (no plaintext credentials)
- 💾 Persistent volume claims for data durability
- 🔄 Rolling updates for zero-downtime deployments
- 📈 Horizontal Pod Autoscaling (HPA) based on CPU & memory
- 🛡️ NetworkPolicies for least-privilege pod communication
- 🩺 Liveness / Readiness / Startup probes
- 📉 Prometheus metrics endpoint for observability

---

## ✨ Features

| Feature                     | Description                                                |
| --------------------------- | ---------------------------------------------------------- |
| 🔍 **Real-Time Quotes**     | Fetch live stock prices via Yahoo Finance API              |
| 📅 **Historical Charts**    | Interactive Chart.js graphs for 30-day price history       |
| ⚡ **Redis Caching**         | 5-minute TTL cache to reduce external API calls            |
| 🗄️ **MySQL Persistence**   | Logs all queries, price snapshots, and system metrics      |
| 🔎 **Stock Search**         | Symbol/name lookup with instant feedback                   |
| 🩺 **Health Endpoints**     | `/health`, `/ready`, `/startup` for Kubernetes probes      |
| 📊 **Prometheus Metrics**   | `/metrics` endpoint for scraping by Prometheus             |
| 🐳 **Docker Ready**         | Multi-stage, non-root, minimal image                       |
| ☸️ **Kubernetes Manifests** | Full set of production manifests (HPA, PDB, NetworkPolicy) |

---

## 🏗️ Architecture

```
                    ┌─────────────────┐
                    │   Web Browser   │
                    └────────┬────────┘
                             │ HTTPS
                    ┌────────▼────────┐
                    │  NGINX Ingress  │
                    └────────┬────────┘
                             │
              ┌──────────────▼──────────────┐
              │   Flask Web App (3 replicas)│
              │   Gunicorn + Python 3.11    │
              └────┬──────────────────┬─────┘
                   │                  │
          ┌────────▼───────┐  ┌───────▼────────┐
          │ Redis Cache    │  │ MySQL Database │
          │ (5 min TTL)    │  │ (persistent)   │
          └────────────────┘  └────────────────┘
                   │                  │
                   └──────► Yahoo Finance API
```

---

## 📂 Project Structure

```
stock-watcher/
├── app/
│   ├── __init__.py
│   ├── main.py              # Flask app entry point
│   ├── config.py            # Config from env vars
│   ├── database.py          # DB & Redis initialization
│   ├── models.py            # SQLAlchemy models
│   ├── stock_service.py     # Yahoo Finance + cache logic
│   ├── templates/           # Jinja2 HTML templates
│   └── static/              # CSS & JS assets
├── kubernetes/
│   ├── 00-namespace.yaml
│   ├── 01-secrets.yaml
│   ├── 02-configmap.yaml
│   ├── 03-pvc.yaml
│   ├── 04-mysql.yaml
│   ├── 05-redis.yaml
│   ├── 06-webapp.yaml
│   ├── 07-ingress.yaml
│   ├── 08-hpa.yaml
│   ├── 09-pdb.yaml
│   └── 10-network-policies.yaml
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── build-and-push.sh
├── deploy.sh
└── README.md
```

---
