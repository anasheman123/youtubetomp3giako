const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const { randomUUID } = require("crypto");
const { execFile } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const multer = require("multer");
const youtubedl = require("youtube-dl-exec");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3020;
const recentConversions = [];
const DATA_DIR = path.join(__dirname, "data");
const RECENT_FILE = path.join(DATA_DIR, "recent-conversions.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const AUDIO_FORMATS = [
  { quality: "320k", label: "Studio", note: "Mayor peso, mejor fidelidad" },
  { quality: "192k", label: "Balance", note: "Buen equilibrio para uso diario" },
  { quality: "128k", label: "Ligero", note: "Menor peso para compartir rapido" },
];

const VIDEO_FORMATS = [
  { ratio: "landscape", label: "Landscape 16:9", size: "1920x1080" },
  { ratio: "square", label: "Square 1:1", size: "1440x1440" },
  { ratio: "portrait", label: "Portrait 9:16", size: "1080x1920" },
];

mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const safeName = sanitizeFilename(path.parse(file.originalname).name || "file");
      const ext = path.extname(file.originalname) || "";
      cb(null, `${Date.now()}-${randomUUID()}-${safeName}${ext}`);
    },
  }),
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
});

function sanitizeFilename(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function escapeHeaderFilename(value) {
  return value.replace(/"/g, "");
}

function loadRecentConversions() {
  try {
    if (!existsSync(RECENT_FILE)) {
      return;
    }

    const raw = readFileSync(RECENT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      recentConversions.push(...parsed.slice(0, 12));
    }
  } catch (_error) {
    recentConversions.length = 0;
  }
}

function persistRecentConversions() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RECENT_FILE, JSON.stringify(recentConversions, null, 2), "utf8");
}

function pushRecentConversion(entry) {
  recentConversions.unshift({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });

  if (recentConversions.length > 12) {
    recentConversions.length = 12;
  }

  persistRecentConversions();
}

async function downloadRemoteFile(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen remota (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, bytes);
}

async function fetchRemoteBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen remota (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { bytes, contentType };
}

function extractMetaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

async function resolvePinterestImage(pinterestUrl) {
  const response = await fetch(pinterestUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Pinterest respondio ${response.status}.`);
  }

  const html = await response.text();
  const imageUrl = extractMetaContent(html, "og:image") || extractMetaContent(html, "twitter:image");

  if (!imageUrl) {
    throw new Error("No se pudo extraer la imagen del pin.");
  }

  const title =
    extractMetaContent(html, "og:title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "Pinterest";

  return { imageUrl, title };
}

async function getVideoInfo(url) {
  return youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    noPlaylist: true,
    preferFreeFormats: true,
    skipDownload: true,
  });
}

function getAudioSourceLabel(source) {
  return source === "soundcloud" ? "SoundCloud" : "YouTube";
}

function getAudioSourceError(source) {
  return source === "soundcloud"
    ? "No se pudo leer la pista. Revisa que el link sea publico y valido."
    : "No se pudo leer el video. Revisa que el link sea publico y valido.";
}

function getAudioConvertError(source) {
  return source === "soundcloud" ? "No se pudo convertir la pista." : "No se pudo convertir el video.";
}

async function getAudioInfoResponse(url, source) {
  const details = await getVideoInfo(url);

  return {
    id: details.id,
    title: details.title,
    author: details.uploader || details.channel || details.artist || "Autor desconocido",
    lengthSeconds: Number(details.duration || 0),
    thumbnails: details.thumbnails || [],
    formats: AUDIO_FORMATS,
    source,
  };
}

async function handleAudioConvert(req, res, source) {
  const { url, quality = "192k" } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: `URL de ${getAudioSourceLabel(source)} invalida.` });
  }

  const selectedFormat = AUDIO_FORMATS.find((item) => item.quality === quality);
  if (!selectedFormat) {
    return res.status(400).json({ error: "Calidad no soportada." });
  }

  const tempDir = path.join(os.tmpdir(), `youtubetomp3-${source}-${randomUUID()}`);
  const sourceTemplate = path.join(tempDir, "source.%(ext)s");

  try {
    await fs.mkdir(tempDir, { recursive: true });

    const details = await getVideoInfo(url);
    const title = sanitizeFilename(details.title || "audio");

    await youtubedl(url, {
      format: "bestaudio/best",
      ffmpegLocation: ffmpegPath,
      noCheckCertificates: true,
      noWarnings: true,
      noPlaylist: true,
      output: sourceTemplate,
    });

    const files = await fs.readdir(tempDir);
    const sourceName = files.find((file) => file.startsWith("source."));

    if (!sourceName) {
      throw new Error("No se encontro el audio descargado.");
    }

    const sourcePath = path.join(tempDir, sourceName);
    const targetName = `${title || "audio"}.mp3`;
    const targetPath = path.join(tempDir, targetName);
    const asciiFallback = escapeHeaderFilename(targetName.replace(/[^\x20-\x7E]/g, ""));

    await convertToMp3(sourcePath, targetPath, selectedFormat.quality);

    pushRecentConversion({
      type: "mp3",
      title,
      subtitle: `${getAudioSourceLabel(source)} - ${selectedFormat.label} - ${selectedFormat.quality}`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: source === "soundcloud" ? "soundcloud" : "audio",
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || "audio.mp3"}"; filename*=UTF-8''${encodeURIComponent(targetName)}`,
    );

    return res.download(targetPath, targetName, async (error) => {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (error && !res.headersSent) {
        res.status(500).json({ error: "No se pudo entregar el MP3 final." });
      }
    });
  } catch (error) {
    if (existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    return res.status(500).json({
      error: getAudioConvertError(source),
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function convertToMp3(inputPath, outputPath, quality) {
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioBitrate(quality)
      .format("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

function getVideoProfile(ratio) {
  return VIDEO_FORMATS.find((item) => item.ratio === ratio) || VIDEO_FORMATS[0];
}

async function createVideoFromImageAndAudio(imagePath, audioPath, outputPath, ratio) {
  const profile = getVideoProfile(ratio);
  const [width, height] = profile.size.split("x").map(Number);
  const filterGraph = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},gblur=sigma=20[bg]`,
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`,
  ].join(";");

  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioPath,
    "-filter_complex",
    filterGraph,
    "-map",
    "[v]",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "16",
    "-tune",
    "stillimage",
    "-profile:v",
    "high",
    "-level",
    "4.2",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-shortest",
    outputPath,
  ];

  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve();
    });
  });
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/formats", (_req, res) => {
  res.json({ formats: AUDIO_FORMATS, videoFormats: VIDEO_FORMATS });
});

app.get("/api/recent", (_req, res) => {
  res.json({ items: recentConversions });
});

app.get("/api/pinterest-preview", async (req, res) => {
  const pinterestUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!pinterestUrl) {
    return res.status(400).json({ error: "Falta el link de Pinterest." });
  }

  try {
    const data = await resolvePinterestImage(pinterestUrl);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo leer el pin de Pinterest.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/image-proxy", async (req, res) => {
  const remoteUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!remoteUrl) {
    return res.status(400).json({ error: "Falta la URL de imagen." });
  }

  try {
    const { bytes, contentType } = await fetchRemoteBytes(remoteUrl);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(bytes);
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo cargar la imagen.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/info", async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL de YouTube invalida." });
  }

  try {
    return res.json(await getAudioInfoResponse(url, "youtube"));
  } catch (error) {
    return res.status(500).json({
      error: getAudioSourceError("youtube"),
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/soundcloud-info", async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL de SoundCloud invalida." });
  }

  try {
    return res.json(await getAudioInfoResponse(url, "soundcloud"));
  } catch (error) {
    return res.status(500).json({
      error: getAudioSourceError("soundcloud"),
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/convert", async (req, res) => {
  return handleAudioConvert(req, res, "youtube");
});

app.get("/api/soundcloud-convert", async (req, res) => {
  return handleAudioConvert(req, res, "soundcloud");
});

app.post(
  "/api/create-video",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];
    const pinterestUrl = typeof req.body?.pinterestUrl === "string" ? req.body.pinterestUrl.trim() : "";
    const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
    const ratio = typeof req.body?.ratio === "string" ? req.body.ratio : "landscape";
    const tempDir = path.join(os.tmpdir(), `youtubetomp3-video-${randomUUID()}`);

    if ((!imageFile && !imageUrl && !pinterestUrl) || !audioFile) {
      return res.status(400).json({ error: "Debes subir una imagen o pegar un link de Pinterest, y subir un audio." });
    }

    if (imageFile && !imageFile.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "El archivo de imagen no es valido." });
    }

    if (!audioFile.mimetype.startsWith("audio/")) {
      return res.status(400).json({ error: "El archivo de audio no es valido." });
    }

    try {
      await fs.mkdir(tempDir, { recursive: true });

      const imageExt = imageFile ? path.extname(imageFile.originalname) || ".jpg" : ".jpg";
      const audioExt = path.extname(audioFile.originalname) || ".mp3";
      const imagePath = path.join(tempDir, `image${imageExt}`);
      const audioPath = path.join(tempDir, `audio${audioExt}`);
      const outputName = `${sanitizeFilename(path.parse(audioFile.originalname).name || "video")}.mp4`;
      const outputPath = path.join(tempDir, outputName);
      const asciiFallback = escapeHeaderFilename(outputName.replace(/[^\x20-\x7E]/g, ""));
      let resolvedImageUrl = imageUrl;

      if (imageFile) {
        await fs.copyFile(imageFile.path, imagePath);
      } else if (pinterestUrl) {
        const pinterestImage = await resolvePinterestImage(pinterestUrl);
        resolvedImageUrl = pinterestImage.imageUrl;
        await downloadRemoteFile(pinterestImage.imageUrl, imagePath);
      } else {
        await downloadRemoteFile(imageUrl, imagePath);
      }
      await fs.copyFile(audioFile.path, audioPath);
      await createVideoFromImageAndAudio(imagePath, audioPath, outputPath, ratio);

      pushRecentConversion({
        type: "mp4",
        title: sanitizeFilename(path.parse(audioFile.originalname).name || "video"),
        subtitle: `${getVideoProfile(ratio).label}`,
        preview: resolvedImageUrl || "",
        accent: "video",
      });

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFallback || "video.mp4"}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
      );

      res.download(outputPath, outputName, async (error) => {
        await fs.rm(tempDir, { recursive: true, force: true });
        if (error && !res.headersSent) {
          res.status(500).json({ error: "No se pudo entregar el MP4 final." });
        }
      });
    } catch (error) {
      if (existsSync(tempDir)) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }

      return res.status(500).json({
        error: "No se pudo crear el video.",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (imageFile?.path && existsSync(imageFile.path)) {
        await fs.rm(imageFile.path, { force: true });
      }

      if (audioFile?.path && existsSync(audioFile.path)) {
        await fs.rm(audioFile.path, { force: true });
      }
    }
  },
);

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "El archivo es demasiado grande. Limite actual: 250 MB por archivo.",
      });
    }

    return res.status(400).json({
      error: "Error al subir archivos.",
      details: error.message,
    });
  }

  return next(error);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

loadRecentConversions();

const server = app.listen(PORT, () => {
  console.log(`YouTube to MP3 listo en http://localhost:${PORT}`);
});

module.exports = server;
