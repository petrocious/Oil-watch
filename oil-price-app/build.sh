#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-registry.local:5000}"
TAG="${TAG:-v1}"

echo "▶ Building backend..."
docker build -t ${REGISTRY}/oilwatch-backend:${TAG} ./Backend

echo "▶ Building frontend..."
docker build -t ${REGISTRY}/oilwatch-frontend:${TAG} ./Frontend

echo "✅ Images built:"
docker images | grep oilwatch