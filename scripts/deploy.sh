#!/bin/bash
set -e

APP_DIR="/opt/metrics-app"
IMAGE_NAME="metrics-app:latest"
WORKER1="192.168.10.243"
NAMESPACE="app-production"
DEPLOYMENT="metrics-app"
TMP_TAR="/tmp/metrics-app.tar"

echo "==> [1/5] Git pull"
cd "$APP_DIR"
git pull origin main

echo "==> [2/5] Docker build"
docker build -t "$IMAGE_NAME" .

echo "==> [3/5] Export image"
docker save "$IMAGE_NAME" -o "$TMP_TAR"

echo "==> [4/5] Transfer + load sur worker-1 ($WORKER1)"
scp "$TMP_TAR" "romain@$WORKER1:$TMP_TAR"
ssh "romain@$WORKER1" "docker load -i $TMP_TAR && rm $TMP_TAR"
rm "$TMP_TAR"

echo "==> [5/5] Nettoyage quotas/limitranges + rollout restart"
kubectl delete resourcequota,limitrange -n "$NAMESPACE" -l managed_by=reserve-endpoint 2>/dev/null || true
kubectl rollout restart deployment/"$DEPLOYMENT" -n "$NAMESPACE"
kubectl rollout status deployment/"$DEPLOYMENT" -n "$NAMESPACE"

echo ""
echo "Deploy terminé."
