#!/usr/bin/env bash

set -euo pipefail

APP_NAME="gtubeversor"
APP_DIR="${1:-/opt/gtubeversor}"
APP_PORT="${PORT:-3020}"
DOMAIN="${DOMAIN:-_}"

echo "[1/7] Instalando paquetes base..."
sudo apt update
sudo apt install -y curl git nginx ffmpeg

if ! command -v node >/dev/null 2>&1; then
  echo "[2/7] Instalando Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "[2/7] Node.js ya existe: $(node -v)"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[3/7] Instalando PM2..."
  sudo npm install -g pm2
else
  echo "[3/7] PM2 ya existe."
fi

echo "[4/7] Preparando carpeta app..."
sudo mkdir -p "${APP_DIR}"
sudo chown -R "$USER":"$USER" "${APP_DIR}"

echo "[5/7] Copiando/actualizando app..."
if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "Clona tu repo dentro de ${APP_DIR} antes de seguir."
  echo "Ejemplo: git clone https://github.com/anasheman123/youtubetomp3giako.git ${APP_DIR}"
  exit 1
fi

cd "${APP_DIR}"
git pull --rebase
npm ci --omit=dev
mkdir -p data/uploads

if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i "s/^PORT=.*/PORT=${APP_PORT}/" .env
fi

echo "[6/7] Iniciando PM2..."
pm2 start ecosystem.config.cjs --env production || pm2 restart "${APP_NAME}"
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash || true

echo "[7/7] Configurando Nginx..."
sudo tee /etc/nginx/sites-available/"${APP_NAME}" >/dev/null <<EOF
server {
  listen 80;
  server_name ${DOMAIN};

  client_max_body_size 300M;

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

sudo ln -sf /etc/nginx/sites-available/"${APP_NAME}" /etc/nginx/sites-enabled/"${APP_NAME}"
sudo nginx -t
sudo systemctl reload nginx

echo "Listo. App en http://${DOMAIN} (o IP publica)."
echo "Siguiente: SSL con certbot."

