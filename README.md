# GtubeVersor

Herramienta local para extraer MP3 o MP4 desde varios links y crear video simple desde imagen + audio.

## Uso

```bash
npm install
npm start
```

Abre `http://localhost:3020`.

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
- `DELETE /api/recent`  
  Si defines `ADMIN_TOKEN`, debes enviar header `x-admin-token: TU_TOKEN`.

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
