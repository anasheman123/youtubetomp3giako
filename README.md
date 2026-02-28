# YouTube to MP3

Herramienta local para convertir links de YouTube a MP3 con frontend moderno.

## Uso

```bash
npm install
npm start
```

Abre `http://localhost:3020`.

## Notas

- Usa `@distube/ytdl-core` para leer audio desde YouTube.
- Usa `ffmpeg-static` y `fluent-ffmpeg` para convertir a MP3.
- Si YouTube cambia su sistema de firmas, puede requerir actualizar dependencias.
- Usala solo con contenido para el que tengas permiso de descarga o conversion.
