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