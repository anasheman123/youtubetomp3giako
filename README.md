# GtubeVersor

Herramienta local para extraer MP3 o MP4 desde varios links y crear video simple desde imagen + audio.

## Uso

```bash
npm install
npm start
```

Abre `http://localhost:3020`.

## Cuentas y acceso

La app ahora puede usarse sin login, en modo `anonymous`.

Opciones de acceso:
- invitado sin cuenta
- registro con usuario + password
- login local
- login con Google si configuras OAuth

Variables opcionales para Google en `.env`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://tu-dominio.com/api/auth/google/callback
```

## Pagos con Paddle

La pagina `Subscribe` ahora usa `Paddle Checkout` hospedado para upgrades de plan. La app no procesa tarjetas directamente.

Variables nuevas en `.env`:

```bash
APP_BASE_URL=https://tu-dominio.com
PADDLE_ENV=sandbox
PADDLE_API_KEY=...
PADDLE_CLIENT_TOKEN=...
PADDLE_WEBHOOK_SECRET=...
PADDLE_PRICE_RISING=pri_...
PADDLE_PRICE_STANDOUT=pri_...
PADDLE_PRICE_ICON=pri_...
```

Flujo:
- `Rising` = pago unico
- `Standout` = pago unico
- `Icon` = pago unico
- Paddle abre checkout
- el webhook `POST /api/paddle/webhook` aplica el plan cuando el pago queda confirmado

Que tienes que hacer en Paddle:
1. Crear 3 precios:
   - `Rising` por `1 USD`
   - `Standout` por `5 USD`
   - `Icon` por `10 USD`
2. Copiar los `pri_...` y ponerlos en `.env`
3. Crear un `Client-side token`
4. Configurar un webhook apuntando a:

```bash
https://tu-dominio.com/api/paddle/webhook
```

5. Suscribirte al evento:
   - `checkout.session.completed`
   En Paddle usa:
   - `transaction.completed`
   - opcionalmente `transaction.paid`
6. Copiar el webhook secret al `.env`

Nota:
- `anonymous` no puede comprar planes
- los upgrades directos por API quedaron bloqueados por defecto
- si quieres testing manual, existe `ALLOW_MANUAL_PLAN_OVERRIDE=true`, pero no deberias usarlo en produccion

## Produccion (VPS Ubuntu)

Archivos nuevos para deploy:
- `ecosystem.config.cjs` (PM2)
- `deploy/setup-ubuntu.sh` (bootstrap inicial)
- `deploy/update-and-restart.sh` (actualizaciones)
- `.env.example` (variables)

Flujo recomendado en tu VPS:
1. Clona el repo en `/opt/gtubeversor`
2. Corre:

```bash
chmod +x deploy/setup-ubuntu.sh
DOMAIN=tu-dominio.com PORT=3020 ./deploy/setup-ubuntu.sh /opt/gtubeversor
```

3. Si usas dominio, agrega SSL:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

4. Para actualizar:

```bash
chmod +x deploy/update-and-restart.sh
./deploy/update-and-restart.sh /opt/gtubeversor
```

## Historial de conversiones (ultimas conversiones)

El historial se persiste en `data/recent-conversions.json`.

Variables para gestionarlo:
- `RECENT_LIMIT` (default `60`): maximo guardado en disco.
- `RECENT_RETENTION_DAYS` (default `30`): elimina entradas viejas.
- `RECENT_RESPONSE_DEFAULT` (default `12`): items devueltos por `/api/recent`.

Rutas utiles:
- `GET /api/recent?limit=20`
- `GET /api/extractor-events?limit=20`
- `GET /api/health`
- `DELETE /api/recent`  
  Si defines `ADMIN_TOKEN`, debes enviar header `x-admin-token: TU_TOKEN`.

## Alertas de extractor y salud del servidor

Puedes activar notificaciones a Telegram cuando alguien use el extractor y recibir alertas si el servidor supera cierto uso de CPU.

Variables nuevas en `.env`:

```bash
TELEGRAM_NOTIFICATIONS_ENABLED=true
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_CHAT_ID=5113823996
CPU_ALERT_THRESHOLD_PERCENT=50
CPU_ALERT_SUSTAINED_MINUTES=3
CPU_SAMPLE_INTERVAL_MS=60000
CPU_ALERT_COOLDOWN_MS=1800000
```

Que hace:
- Cada conversion exitosa por el extractor registra un evento en `data/extractor-events.json`
- Si Telegram esta activado, manda una notificacion con plataforma, tipo, titulo, URL e IP
- El endpoint `GET /api/health` devuelve estado de la app, memoria, ultimo sample de CPU y ultimo uso del extractor
- Si la CPU supera el umbral configurado durante varios minutos, envia una alerta a Telegram

## YouTube bloqueado en VPS (Sign in to confirm you're not a bot)

Si aparece ese error, configura cookies para yt-dlp:

1. Exporta `cookies.txt` de YouTube desde tu navegador (formato Netscape).
2. Sube el archivo al servidor, por ejemplo:

```bash
scp cookies.txt deploy@TU_IP:/opt/gtubeversor/data/youtube-cookies.txt
```

3. En `/opt/gtubeversor/.env` agrega:

```bash
YTDLP_COOKIES_FILE=/opt/gtubeversor/data/youtube-cookies.txt
YTDLP_CLIENT=android
YTDLP_BINARY=/usr/bin/yt-dlp
# Opcional: proxy (Webshare u otro)
# YTDLP_PROXY=http://usuario:password@host:port
# Opcional: fallbacks si falla el principal
# YTDLP_PROXY_FALLBACKS=http://u:p@ip2:port,http://u:p@ip3:port
```

4. Reinicia:

```bash
cd /opt/gtubeversor
pm2 reload gtubeversor --update-env
```

## macOS

Si bajas el ZIP del repo en Mac, puedes usar `GtubeVersor.command`.

Requisitos:
- Tener `Node.js` instalado

Uso:
1. Descomprimir el ZIP
2. Si macOS bloquea el archivo, darle permisos una vez:

```bash
chmod +x GtubeVersor.command
```

3. Doble clic en `GtubeVersor.command`

El script instala dependencias si faltan, abre `http://localhost:3020` y detiene el server cuando cierras esa ventana de Terminal.

## Notas

- Usa `youtube-dl-exec` para extraer media desde distintos servicios.
- Usa `ffmpeg-static` y `fluent-ffmpeg` para convertir a MP3.
- Si YouTube cambia su sistema de firmas, puede requerir actualizar dependencias.
- Usala solo con contenido para el que tengas permiso de descarga o conversion.
