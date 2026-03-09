#!/bin/bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3020}"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "${APP_DIR}"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "GtubeVersor necesita Node.js instalado para ejecutarse en macOS." buttons {"OK"} default button "OK" with icon stop'
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display dialog "No se encontro npm. Instala Node.js completo y vuelve a intentar." buttons {"OK"} default button "OK" with icon stop'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependencias..."
  npm install
fi

if lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Ya hay algo escuchando en localhost:${PORT}. Se abrira la app existente."
  open "http://localhost:${PORT}"
  echo ""
  echo "Presiona Enter para cerrar este lanzador."
  read -r _
  exit 0
fi

echo "Iniciando GtubeVersor en localhost:${PORT}..."
node server.js &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "http://localhost:${PORT}/api/formats" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

open "http://localhost:${PORT}"

echo ""
echo "GtubeVersor esta abierto."
echo "Cuando cierres esta ventana de Terminal, el server se detendra."
echo "Presiona Enter para cerrar la app."
read -r _
