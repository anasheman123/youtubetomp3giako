const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { randomUUID } = require("crypto");
const { execFile } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const multer = require("multer");
const youtubedlFactory = require("youtube-dl-exec");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3020;
const recentConversions = [];
const savedProjects = [];
const DATA_DIR = path.join(__dirname, "data");
const RECENT_FILE = path.join(DATA_DIR, "recent-conversions.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const YTDLP_COOKIES_FILE = String(process.env.YTDLP_COOKIES_FILE || "").trim();
const YTDLP_CLIENT = String(process.env.YTDLP_CLIENT ?? "").trim();
const YTDLP_BINARY = String(
  process.env.YTDLP_BINARY || (existsSync("/usr/bin/yt-dlp") ? "/usr/bin/yt-dlp" : ""),
).trim();
const YTDLP_USER_AGENT = String(
  process.env.YTDLP_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
).trim();
const youtubedl = YTDLP_BINARY ? youtubedlFactory.create(YTDLP_BINARY) : youtubedlFactory;
const RECENT_LIMIT = Number.parseInt(process.env.RECENT_LIMIT || "60", 10);
const RECENT_RETENTION_DAYS = Number.parseInt(process.env.RECENT_RETENTION_DAYS || "30", 10);
const RECENT_RESPONSE_DEFAULT = Number.parseInt(process.env.RECENT_RESPONSE_DEFAULT || "12", 10);

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

const VISUAL_TEMPLATES = [
  {
    id: "coffee",
    label: "Coffee Brown",
    overlay: "0x2c190c@0.26",
    waveform: "#f0dfad",
    text: "#f8f0e4",
  },
  {
    id: "mocha",
    label: "Mocha Glow",
    overlay: "0x573920@0.20",
    waveform: "#ddc9ae",
    text: "#f8f0e4",
  },
  {
    id: "dust",
    label: "Dust Beige",
    overlay: "0xa7927a@0.14",
    waveform: "#684e32",
    text: "#f8f0e4",
  },
];

function resolveDrawTextFont() {
  const candidates = [
    process.env.DRAW_TEXT_FONT || "",
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ].filter(Boolean);

  return candidates.find((fontPath) => existsSync(fontPath)) || null;
}

const DRAW_TEXT_FONT = resolveDrawTextFont();

mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

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
      recentConversions.push(...parsed);
      normalizeRecentConversions();
      persistRecentConversions();
    }
  } catch (_error) {
    recentConversions.length = 0;
  }
}

function persistRecentConversions() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RECENT_FILE, JSON.stringify(recentConversions, null, 2), "utf8");
}

function loadProjects() {
  try {
    if (!existsSync(PROJECTS_FILE)) {
      return;
    }

    const raw = readFileSync(PROJECTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      savedProjects.push(...parsed.slice(0, 30));
    }
  } catch (_error) {
    savedProjects.length = 0;
  }
}

function persistProjects() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(savedProjects, null, 2), "utf8");
}

function pushRecentConversion(entry) {
  recentConversions.unshift({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });

  normalizeRecentConversions();
  persistRecentConversions();
}

function normalizeRecentConversions() {
  const now = Date.now();
  const retentionMs = Math.max(1, RECENT_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const hardLimit = Math.max(1, RECENT_LIMIT);

  const cleaned = recentConversions
    .filter((item) => item && typeof item === "object")
    .filter((item) => typeof item.id === "string" && typeof item.createdAt === "string")
    .filter((item) => {
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && now - timestamp <= retentionMs;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, hardLimit);

  recentConversions.length = 0;
  recentConversions.push(...cleaned);
}

function pushProject(entry) {
  const project = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...entry,
  };

  savedProjects.unshift(project);
  if (savedProjects.length > 30) {
    savedProjects.length = 30;
  }

  persistProjects();
  return project;
}

function updateProject(id, patch) {
  const project = savedProjects.find((item) => item.id === id);
  if (!project) {
    return null;
  }

  Object.assign(project, patch, { updatedAt: new Date().toISOString() });
  persistProjects();
  return project;
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
  try {
    return await youtubedl(url, buildYtdlpOptions({
      dumpSingleJson: true,
      skipDownload: true,
      format: "b",
    }));
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes("Requested format is not available")) {
      throw error;
    }

    return youtubedl(url, buildYtdlpOptions({
      dumpSingleJson: true,
      skipDownload: true,
    }));
  }
}

function buildYtdlpOptions(extraOptions = {}) {
  const options = {
    ignoreConfig: true,
    noCheckCertificates: true,
    noWarnings: true,
    noPlaylist: true,
    geoBypass: true,
    userAgent: YTDLP_USER_AGENT,
    ...extraOptions,
  };

  if (YTDLP_CLIENT) {
    options.extractorArgs = [`youtube:player_client=${YTDLP_CLIENT}`];
  }

  if (YTDLP_COOKIES_FILE) {
    options.cookies = YTDLP_COOKIES_FILE;
  }

  return options;
}

function getTemplateById(templateId) {
  return VISUAL_TEMPLATES.find((item) => item.id === templateId) || VISUAL_TEMPLATES[0];
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const normalized = String(value || "").trim();
  if (!normalized) {
    return 0;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return Math.max(0, Number(normalized));
  }

  const parts = normalized.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return NaN;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

async function ensureRemoved(targetPath) {
  if (targetPath && existsSync(targetPath)) {
    await fs.rm(targetPath, { recursive: true, force: true });
  }
}

function safeTextForDrawtext(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function getAudioSourceLabel(source) {
  return source === "soundcloud" ? "SoundCloud" : "YouTube";
}

function detectPlatform(url, details = {}) {
  const normalized = String(url || "").toLowerCase();
  if (normalized.includes("soundcloud.com")) return "SoundCloud";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YouTube";
  if (normalized.includes("instagram.com")) return "Instagram";
  if (normalized.includes("facebook.com") || normalized.includes("fb.watch")) return "Facebook";
  if (normalized.includes("twitter.com") || normalized.includes("x.com")) return "Twitter";
  if (normalized.includes("tiktok.com")) return "TikTok";
  if (normalized.includes("pinterest.com") || normalized.includes("pin.it")) return "Pinterest";
  return details.extractor_key || details.extractor || "Link";
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

async function getMediaInfoResponse(url) {
  const details = await getVideoInfo(url);
  return {
    id: details.id,
    title: details.title,
    author: details.uploader || details.channel || details.artist || "Autor desconocido",
    lengthSeconds: Number(details.duration || 0),
    thumbnails: details.thumbnails || [],
    platform: detectPlatform(url, details),
    formats: AUDIO_FORMATS,
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

    await youtubedl(url, buildYtdlpOptions({
      format: "bestaudio/best",
      ffmpegLocation: ffmpegPath,
      output: sourceTemplate,
    }));

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

async function handleUniversalAudioConvert(req, res) {
  const { url, quality = "192k" } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL invalida." });
  }

  const selectedFormat = AUDIO_FORMATS.find((item) => item.quality === quality);
  if (!selectedFormat) {
    return res.status(400).json({ error: "Calidad no soportada." });
  }

  const tempDir = path.join(os.tmpdir(), `gtubeversor-audio-${randomUUID()}`);
  const sourceTemplate = path.join(tempDir, "source.%(ext)s");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const details = await getVideoInfo(url);
    const platform = detectPlatform(url, details);
    const title = sanitizeFilename(details.title || "audio");

    await youtubedl(url, buildYtdlpOptions({
      format: "bestaudio/best",
      ffmpegLocation: ffmpegPath,
      output: sourceTemplate,
    }));

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
      subtitle: `${platform} - ${selectedFormat.label} - ${selectedFormat.quality}`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: platform.toLowerCase().includes("soundcloud") ? "soundcloud" : "audio",
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || "audio.mp3"}"; filename*=UTF-8''${encodeURIComponent(targetName)}`,
    );

    return res.download(targetPath, targetName, async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  } catch (error) {
    await ensureRemoved(tempDir);
    return res.status(500).json({
      error: "No se pudo convertir el link a MP3.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleVideoDownload(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL invalida." });
  }

  const tempDir = path.join(os.tmpdir(), `gtubeversor-video-${randomUUID()}`);
  const outputTemplate = path.join(tempDir, "video.%(ext)s");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const details = await getVideoInfo(url);
    const title = sanitizeFilename(details.title || "video");
    const platform = detectPlatform(url, details);

    await youtubedl(url, buildYtdlpOptions({
      format: "bestvideo+bestaudio/best",
      mergeOutputFormat: "mp4",
      ffmpegLocation: ffmpegPath,
      output: outputTemplate,
    }));

    const files = await fs.readdir(tempDir);
    const sourceName = files.find((file) => file.startsWith("video."));
    if (!sourceName) {
      throw new Error("No se encontro el video descargado.");
    }

    const sourcePath = path.join(tempDir, sourceName);
    const ext = path.extname(sourceName) || ".mp4";
    const targetName = `${title || "video"}${ext}`;
    const targetPath = path.join(tempDir, targetName);
    const asciiFallback = escapeHeaderFilename(targetName.replace(/[^\x20-\x7E]/g, ""));

    if (sourcePath !== targetPath) {
      await fs.rename(sourcePath, targetPath);
    }

    pushRecentConversion({
      type: "mp4",
      title,
      subtitle: `${platform} - Video`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: "video",
    });

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || "video.mp4"}"; filename*=UTF-8''${encodeURIComponent(targetName)}`,
    );

    return res.download(targetPath, targetName, async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });
  } catch (error) {
    await ensureRemoved(tempDir);
    return res.status(500).json({
      error: "No se pudo descargar el video.",
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
  return createStyledVideo({
    imagePath,
    audioPath,
    outputPath,
    ratio,
  });
}

async function createStyledVideo({
  imagePath,
  audioPath,
  outputPath,
  ratio,
  titleText = "",
  subtitleText = "",
  waveform = false,
  templateId = "coffee",
}) {
  const profile = getVideoProfile(ratio);
  const [width, height] = profile.size.split("x").map(Number);
  const template = getTemplateById(templateId);
  const filterParts = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},gblur=sigma=20[bg]`,
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos[fg]`,
    `[bg]format=rgba,colorchannelmixer=aa=1[bgfmt]`,
    `color=c=${template.overlay}:s=${width}x${height}:d=1[overlaybase]`,
    `[overlaybase]format=rgba[overlaytint]`,
    `[bgfmt][overlaytint]overlay=0:0[bgsoft]`,
    `[bgsoft][fg]overlay=(W-w)/2:(H-h)/2[canvas0]`,
  ];

  let currentVideo = "canvas0";

  if (waveform) {
    filterParts.push(
      `[1:a]aformat=channel_layouts=stereo,showwaves=s=${Math.round(width * 0.8)}x${Math.max(120, Math.round(height * 0.16))}:mode=line:colors=${template.waveform.replace("#", "0x")}[waves]`,
      `[${currentVideo}][waves]overlay=(W-w)/2:H-h-${Math.max(56, Math.round(height * 0.08))}[canvas1]`,
    );
    currentVideo = "canvas1";
  }

  const drawTextEntries = [];
  if (titleText.trim()) {
    drawTextEntries.push(
      [
        `text='${safeTextForDrawtext(titleText.trim())}'`,
        `fontcolor=${template.text}`,
        `fontsize=${Math.max(34, Math.round(width * 0.027))}`,
        `x=(w-text_w)/2`,
        `y=h-${Math.max(220, Math.round(height * 0.22))}`,
        "box=1",
        "boxcolor=0x00000055",
        "boxborderw=18",
      ].join(":"),
    );
  }

  if (subtitleText.trim()) {
    drawTextEntries.push(
      [
        `text='${safeTextForDrawtext(subtitleText.trim())}'`,
        `fontcolor=${template.text}`,
        `fontsize=${Math.max(20, Math.round(width * 0.017))}`,
        `x=(w-text_w)/2`,
        `y=h-${Math.max(148, Math.round(height * 0.14))}`,
        "box=1",
        "boxcolor=0x00000044",
        "boxborderw=14",
      ].join(":"),
    );
  }

  if (drawTextEntries.length && DRAW_TEXT_FONT) {
    drawTextEntries.forEach((entry, index) => {
      const outputName = `canvas_text_${index}`;
      filterParts.push(`[${currentVideo}]drawtext=fontfile='${DRAW_TEXT_FONT}':${entry}[${outputName}]`);
      currentVideo = outputName;
    });
  }

  filterParts.push(`[${currentVideo}]setsar=1[v]`);
  const filterGraph = filterParts.join(";");

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

async function trimAudio({ inputPath, outputPath, startSeconds, endSeconds, quality, format = "mp3" }) {
  await new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(Math.max(0.1, endSeconds - startSeconds))
      .audioBitrate(quality)
      .audioCodec(format === "wav" ? "pcm_s16le" : "libmp3lame")
      .format(format)
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

async function writeAudioMetadata({ inputPath, outputPath, format = "mp3", metadata = {}, coverPath = "" }) {
  const attachCover = Boolean(coverPath) && format === "mp3";
  const args = ["-y", "-i", inputPath];

  if (attachCover) {
    args.push("-i", coverPath);
  }

  args.push("-map", "0:a:0");
  if (attachCover) {
    args.push("-map", "1:v:0");
  }

  args.push("-c:a", format === "wav" ? "pcm_s16le" : "libmp3lame");

  if (attachCover) {
    args.push("-c:v", "mjpeg", "-disposition:v:0", "attached_pic");
  }

  Object.entries(metadata).forEach(([key, value]) => {
    if (String(value || "").trim()) {
      args.push("-metadata", `${key}=${String(value).trim()}`);
    }
  });

  if (format === "mp3") {
    args.push("-id3v2_version", "3");
  }

  args.push(outputPath);

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

async function createThumbnail({ imagePath, outputPath, titleText = "", subtitleText = "", ratio = "landscape", templateId = "coffee" }) {
  const profile = getVideoProfile(ratio);
  const [width, height] = profile.size.split("x").map(Number);
  const template = getTemplateById(templateId);
  const filterParts = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}[base]`,
    `color=c=${template.overlay}:s=${width}x${height}:d=1[shade]`,
    `[base][shade]overlay=0:0[canvas0]`,
  ];

  let currentVideo = "canvas0";
  if (DRAW_TEXT_FONT && titleText.trim()) {
    filterParts.push(
      `[${currentVideo}]drawtext=fontfile='${DRAW_TEXT_FONT}':text='${safeTextForDrawtext(titleText.trim())}':fontcolor=${template.text}:fontsize=${Math.max(38, Math.round(width * 0.03))}:x=64:y=h-${Math.max(260, Math.round(height * 0.28))}:box=1:boxcolor=0x00000055:boxborderw=20[canvas1]`,
    );
    currentVideo = "canvas1";
  }

  if (DRAW_TEXT_FONT && subtitleText.trim()) {
    filterParts.push(
      `[${currentVideo}]drawtext=fontfile='${DRAW_TEXT_FONT}':text='${safeTextForDrawtext(subtitleText.trim())}':fontcolor=${template.text}:fontsize=${Math.max(22, Math.round(width * 0.018))}:x=64:y=h-${Math.max(170, Math.round(height * 0.18))}:box=1:boxcolor=0x00000044:boxborderw=14[canvas2]`,
    );
    currentVideo = "canvas2";
  }

  const args = [
    "-y",
    "-i",
    imagePath,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    `[${currentVideo}]`,
    "-frames:v",
    "1",
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
  res.json({ formats: AUDIO_FORMATS, videoFormats: VIDEO_FORMATS, templates: VISUAL_TEMPLATES });
});

app.get("/api/recent", (_req, res) => {
  const requestedLimit = Number.parseInt(String(_req.query?.limit || RECENT_RESPONSE_DEFAULT), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : RECENT_RESPONSE_DEFAULT;
  res.json({ items: recentConversions.slice(0, limit), total: recentConversions.length, limit });
});

app.delete("/api/recent", (req, res) => {
  const adminToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (!adminToken) {
    return res.status(403).json({ error: "Ruta deshabilitada en este entorno." });
  }

  const provided = String(req.headers["x-admin-token"] || "");
  if (provided !== adminToken) {
    return res.status(401).json({ error: "Token invalido." });
  }

  recentConversions.length = 0;
  persistRecentConversions();
  return res.json({ ok: true, total: recentConversions.length });
});

app.get("/api/projects", (_req, res) => {
  res.json({ items: savedProjects });
});

app.post("/api/projects", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const tool = typeof req.body?.tool === "string" ? req.body.tool.trim() : "";
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};

  if (!name || !tool) {
    return res.status(400).json({ error: "Faltan nombre o tool del proyecto." });
  }

  const project = pushProject({
    name: sanitizeFilename(name),
    tool,
    payload,
  });

  return res.status(201).json(project);
});

app.patch("/api/projects/:id", (req, res) => {
  const project = updateProject(req.params.id, {
    name: typeof req.body?.name === "string" ? sanitizeFilename(req.body.name) : undefined,
    payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : undefined,
  });

  if (!project) {
    return res.status(404).json({ error: "Proyecto no encontrado." });
  }

  return res.json(project);
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

app.get("/api/media-info", async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL invalida." });
  }

  try {
    return res.json(await getMediaInfoResponse(url));
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo leer el link.",
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

app.get("/api/media-audio", async (req, res) => {
  return handleUniversalAudioConvert(req, res);
});

app.get("/api/media-video", async (req, res) => {
  return handleVideoDownload(req, res);
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
    const titleText = typeof req.body?.titleText === "string" ? req.body.titleText.trim() : "";
    const subtitleText = typeof req.body?.subtitleText === "string" ? req.body.subtitleText.trim() : "";
    const templateId = typeof req.body?.templateId === "string" ? req.body.templateId : "coffee";
    const waveform = String(req.body?.waveform || "false") === "true";
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
      await createStyledVideo({
        imagePath,
        audioPath,
        outputPath,
        ratio,
        titleText,
        subtitleText,
        templateId,
        waveform,
      });

      pushRecentConversion({
        type: "mp4",
        title: sanitizeFilename(path.parse(audioFile.originalname).name || "video"),
        subtitle: `${getVideoProfile(ratio).label}${waveform ? " - Waveform" : ""}`,
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

app.post("/api/trim-audio", upload.single("audio"), async (req, res) => {
  const audioFile = req.file;
  const startSeconds = parseTimestamp(req.body?.start);
  const endSeconds = parseTimestamp(req.body?.end);
  const quality = typeof req.body?.quality === "string" ? req.body.quality : "192k";
  const format = typeof req.body?.format === "string" ? req.body.format : "mp3";
  const tempDir = path.join(os.tmpdir(), `youtubetomp3-trim-${randomUUID()}`);

  if (!audioFile) {
    return res.status(400).json({ error: "Debes subir un audio." });
  }

  if (!audioFile.mimetype.startsWith("audio/")) {
    await ensureRemoved(audioFile.path);
    return res.status(400).json({ error: "El archivo de audio no es valido." });
  }

  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    await ensureRemoved(audioFile.path);
    return res.status(400).json({ error: "Rango de recorte invalido." });
  }

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const sourcePath = path.join(tempDir, `source${path.extname(audioFile.originalname) || ".mp3"}`);
    const baseName = sanitizeFilename(path.parse(audioFile.originalname).name || "audio");
    const outputName = `${baseName}-trim.${format === "wav" ? "wav" : "mp3"}`;
    const outputPath = path.join(tempDir, outputName);
    const asciiFallback = escapeHeaderFilename(outputName.replace(/[^\x20-\x7E]/g, ""));

    await fs.copyFile(audioFile.path, sourcePath);
    await trimAudio({ inputPath: sourcePath, outputPath, startSeconds, endSeconds, quality, format });

    pushRecentConversion({
      type: "mp3",
      title: `${baseName} trim`,
      subtitle: `Trim ${req.body?.start || "0"}-${req.body?.end || "0"}`,
      preview: "",
      accent: "audio",
    });

    res.setHeader("Content-Type", format === "wav" ? "audio/wav" : "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || outputName}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
    );

    return res.download(outputPath, outputName, async () => {
      await ensureRemoved(tempDir);
      await ensureRemoved(audioFile.path);
    });
  } catch (error) {
    await ensureRemoved(tempDir);
    await ensureRemoved(audioFile.path);
    return res.status(500).json({
      error: "No se pudo recortar el audio.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post(
  "/api/update-audio-metadata",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.cover?.[0];
    const format = typeof req.body?.format === "string" ? req.body.format : "mp3";
    const tempDir = path.join(os.tmpdir(), `youtubetomp3-meta-${randomUUID()}`);

    if (!audioFile) {
      return res.status(400).json({ error: "Debes subir un audio." });
    }

    if (!audioFile.mimetype.startsWith("audio/")) {
      await ensureRemoved(audioFile.path);
      await ensureRemoved(coverFile?.path);
      return res.status(400).json({ error: "El archivo de audio no es valido." });
    }

    try {
      await fs.mkdir(tempDir, { recursive: true });
      const audioPath = path.join(tempDir, `audio${path.extname(audioFile.originalname) || ".mp3"}`);
      const coverPath = coverFile ? path.join(tempDir, `cover${path.extname(coverFile.originalname) || ".jpg"}`) : "";
      const baseName = sanitizeFilename(path.parse(audioFile.originalname).name || "audio");
      const outputName = `${baseName}-tagged.${format === "wav" ? "wav" : "mp3"}`;
      const outputPath = path.join(tempDir, outputName);
      const asciiFallback = escapeHeaderFilename(outputName.replace(/[^\x20-\x7E]/g, ""));

      await fs.copyFile(audioFile.path, audioPath);
      if (coverFile) {
        await fs.copyFile(coverFile.path, coverPath);
      }

      await writeAudioMetadata({
        inputPath: audioPath,
        outputPath,
        format,
        coverPath,
        metadata: {
          title: req.body?.title,
          artist: req.body?.artist,
          album: req.body?.album,
          date: req.body?.year,
          genre: req.body?.genre,
        },
      });

      pushRecentConversion({
        type: "mp3",
        title: `${baseName} metadata`,
        subtitle: "Metadata editada",
        preview: "",
        accent: "audio",
      });

      res.setHeader("Content-Type", format === "wav" ? "audio/wav" : "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFallback || outputName}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
      );

      return res.download(outputPath, outputName, async () => {
        await ensureRemoved(tempDir);
        await ensureRemoved(audioFile.path);
        await ensureRemoved(coverFile?.path);
      });
    } catch (error) {
      await ensureRemoved(tempDir);
      await ensureRemoved(audioFile.path);
      await ensureRemoved(coverFile?.path);
      return res.status(500).json({
        error: "No se pudo actualizar la metadata.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

app.post("/api/create-thumbnail", upload.single("image"), async (req, res) => {
  const imageFile = req.file;
  const ratio = typeof req.body?.ratio === "string" ? req.body.ratio : "landscape";
  const titleText = typeof req.body?.titleText === "string" ? req.body.titleText.trim() : "";
  const subtitleText = typeof req.body?.subtitleText === "string" ? req.body.subtitleText.trim() : "";
  const templateId = typeof req.body?.templateId === "string" ? req.body.templateId : "coffee";
  const tempDir = path.join(os.tmpdir(), `youtubetomp3-thumb-${randomUUID()}`);

  if (!imageFile) {
    return res.status(400).json({ error: "Debes subir una imagen." });
  }

  if (!imageFile.mimetype.startsWith("image/")) {
    await ensureRemoved(imageFile.path);
    return res.status(400).json({ error: "El archivo de imagen no es valido." });
  }

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const imagePath = path.join(tempDir, `image${path.extname(imageFile.originalname) || ".jpg"}`);
    const outputName = `${sanitizeFilename(path.parse(imageFile.originalname).name || "thumbnail")}-thumb.jpg`;
    const outputPath = path.join(tempDir, outputName);
    const asciiFallback = escapeHeaderFilename(outputName.replace(/[^\x20-\x7E]/g, ""));

    await fs.copyFile(imageFile.path, imagePath);
    await createThumbnail({ imagePath, outputPath, titleText, subtitleText, ratio, templateId });

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || outputName}"; filename*=UTF-8''${encodeURIComponent(outputName)}`,
    );

    return res.download(outputPath, outputName, async () => {
      await ensureRemoved(tempDir);
      await ensureRemoved(imageFile.path);
    });
  } catch (error) {
    await ensureRemoved(tempDir);
    await ensureRemoved(imageFile.path);
    return res.status(500).json({
      error: "No se pudo crear la thumbnail.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

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
loadProjects();

const server = app.listen(PORT, () => {
  console.log(`YouTube to MP3 listo en http://localhost:${PORT}`);
});

module.exports = server;
