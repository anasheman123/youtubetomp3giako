#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/gtubeversor}"

cd "${APP_DIR}"
git pull --rebase
npm ci --omit=dev
pm2 reload gtubeversor --update-env
pm2 save

echo "Deploy actualizado."

