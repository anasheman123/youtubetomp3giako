const state = {
  formats: [],
  videoFormats: [],
  templates: [],
  imageSourceMode: "upload",
  selectedPinterestImage: null,
};

const navLinks = [...document.querySelectorAll(".nav-link")];
const panels = [...document.querySelectorAll(".tool-panel")];
const recentCarouselNode = document.querySelector("#recent-carousel");
const recentClearButton = document.querySelector("#recent-clear");
const recentStatusNode = document.querySelector("#recent-status");

const youtubeElements = {
  form: document.querySelector("#converter-form"),
  urlInput: document.querySelector("#youtube-url"),
  outputSelect: document.querySelector("#media-format"),
  qualitySelect: document.querySelector("#quality"),
  statusNode: document.querySelector("#status"),
  previewNode: document.querySelector("#preview"),
  previewButton: document.querySelector("#preview-button"),
  downloadButton: document.querySelector("#download-button"),
  infoEndpoint: "/api/media-info",
  audioEndpoint: "/api/media-audio",
  videoEndpoint: "/api/media-video",
  sourceLabel: "Link",
  emptyMessage: "Esperando un link compatible.",
  previewCta: "Si la ficha es correcta, ya puedes bajar el audio MP3 o el video MP4.",
};

const bulkNodes = {
  form: document.querySelector("#bulk-form"),
  urls: document.querySelector("#bulk-urls"),
  quality: document.querySelector("#bulk-quality"),
  status: document.querySelector("#bulk-status"),
  results: document.querySelector("#bulk-results"),
};

const videoNodes = {
  form: document.querySelector("#video-form"),
  imageInput: document.querySelector("#video-image"),
  audioInput: document.querySelector("#video-audio"),
  imageName: document.querySelector("#image-file-name"),
  audioName: document.querySelector("#audio-file-name"),
  sourceUpload: document.querySelector("#source-upload"),
  sourcePinterest: document.querySelector("#source-pinterest"),
  pinterestPanel: document.querySelector("#pinterest-panel"),
  pinterestUrl: document.querySelector("#pinterest-url"),
  pinterestLoad: document.querySelector("#pinterest-preview-button"),
  ratioSelect: document.querySelector("#video-ratio"),
  status: document.querySelector("#video-status"),
  preview: document.querySelector("#video-preview"),
  previewButton: document.querySelector("#video-preview-button"),
  submitButton: document.querySelector("#video-submit-button"),
};

const trimNodes = {
  form: document.querySelector("#trim-form"),
  audioInput: document.querySelector("#trim-audio"),
  audioName: document.querySelector("#trim-audio-name"),
  startInput: document.querySelector("#trim-start"),
  endInput: document.querySelector("#trim-end"),
  formatSelect: document.querySelector("#trim-format"),
  qualitySelect: document.querySelector("#trim-quality"),
  status: document.querySelector("#trim-status"),
  submitButton: document.querySelector("#trim-submit-button"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function setStatus(node, message, tone = "") {
  node.textContent = message;
  if (tone) {
    node.dataset.tone = tone;
  } else {
    delete node.dataset.tone;
  }
}

function setRecentStatus(message) {
  if (recentStatusNode) {
    recentStatusNode.textContent = message;
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "Duracion no disponible";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .filter((value, index) => value > 0 || index > 0)
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatRecentTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Ahora";
  }

  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function getSelectedFile(input) {
  return input.files?.[0] || null;
}

function setFileLabel(input, node, emptyLabel) {
  const file = getSelectedFile(input);
  node.textContent = file ? file.name : emptyLabel;
}

function downloadBlob(blob, response, fallbackName) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
  const fileName = decodeURIComponent(match?.[1] || match?.[2] || fallbackName);

  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

async function postFormForDownload(url, formData, fallbackName) {
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "No se pudo procesar la solicitud." }));
    throw new Error(data.error || "No se pudo procesar la solicitud.");
  }

  const blob = await response.blob();
  downloadBlob(blob, response, fallbackName);
}

function switchPanel(targetId) {
  navLinks.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === targetId);
  });
  panels.forEach((panel) => {
    const isTarget = panel.id === targetId;
    panel.classList.toggle("is-active", isTarget);
    panel.classList.toggle("is-entering", isTarget);
  });

  const activePanel = panels.find((panel) => panel.id === targetId);
  if (activePanel) {
    window.clearTimeout(activePanel._enterTimer);
    activePanel._enterTimer = window.setTimeout(() => {
      activePanel.classList.remove("is-entering");
    }, 320);
  }
}

navLinks.forEach((button) => {
  button.addEventListener("click", () => switchPanel(button.dataset.target));
});

function renderRecent(items) {
  if (!items.length) {
    recentCarouselNode.classList.add("recent-empty");
    recentCarouselNode.classList.remove("recent-animated");
    recentCarouselNode.innerHTML = `<div class="recent-placeholder">Todavia no hay conversiones.</div>`;
    return;
  }

  recentCarouselNode.classList.remove("recent-empty");
  recentCarouselNode.classList.add("recent-animated");

  const cardsMarkup = items
    .map((item) => {
      const badge = item.type === "mp4" ? "MP4" : "MP3";
      const visual = item.preview
        ? `<img class="recent-thumb" src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.title)}" />`
        : `<div class="recent-fallback">${badge}</div>`;

      return `
        <article class="recent-card" data-accent="${escapeHtml(item.accent || "audio")}">
          ${visual}
          <div class="recent-body">
            <span class="recent-badge">${badge}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.subtitle || "")}</p>
            <small>${formatRecentTime(item.createdAt)}</small>
          </div>
        </article>
      `;
    })
    .join("");

  recentCarouselNode.innerHTML = `<div class="recent-track">${cardsMarkup}${cardsMarkup}</div>`;
}

async function refreshRecent() {
  try {
    const response = await fetch("/api/recent");
    const data = await response.json();
    renderRecent(Array.isArray(data.items) ? data.items : []);
    setRecentStatus("");
  } catch (_error) {
    recentCarouselNode.classList.add("recent-empty");
    recentCarouselNode.innerHTML = `<div class="recent-placeholder">No se pudo cargar el historial.</div>`;
    setRecentStatus("Error");
  }
}

async function clearRecent() {
  if (!recentClearButton) {
    return;
  }

  if (!window.confirm("Quieres limpiar las ultimas conversiones?")) {
    return;
  }

  recentClearButton.disabled = true;
  setRecentStatus("Limpiando...");

  try {
    const response = await fetch("/api/recent", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "No se pudo limpiar.");
    }
    await refreshRecent();
    setRecentStatus("Listo");
  } catch (error) {
    setRecentStatus("Error");
  } finally {
    recentClearButton.disabled = false;
    window.setTimeout(() => setRecentStatus(""), 2400);
  }
}

function populateFormatSelect(select, formats) {
  select.innerHTML = formats
    .map((item) => `<option value="${item.quality}">${item.label} - ${item.quality} - ${item.note}</option>`)
    .join("");
}

function populateVideoFormatSelect(select, videoFormats) {
  select.innerHTML = videoFormats
    .map((item) => `<option value="${item.ratio}">${item.label} - ${item.size}</option>`)
    .join("");
}

function renderAudioPreview(target, data) {
  const image = data.thumbnails?.[data.thumbnails.length - 1]?.url ?? "";
  const isVideo = target.outputSelect?.value === "mp4";
  const visual = image
    ? `<img src="${escapeHtml(image)}" alt="Miniatura de ${escapeHtml(data.title)}" />`
    : `<div class="preview-cover-fallback">${escapeHtml(target.sourceLabel)}</div>`;

  target.previewNode.classList.remove("preview-empty");
  target.previewNode.innerHTML = `
    <div class="preview-content">
      ${visual}
      <div class="preview-body">
        <div>
          <h2>${escapeHtml(data.title)}</h2>
          <p>${escapeHtml(data.author)}</p>
        </div>
        <div class="meta">
          <span>${escapeHtml(data.platform || target.sourceLabel)}</span>
          <span>${formatDuration(data.lengthSeconds)}</span>
          <span>${escapeHtml(isVideo ? "Best" : target.qualitySelect.value)}</span>
          <span>${escapeHtml(isVideo ? "MP4" : "MP3")}</span>
        </div>
        <p>${escapeHtml(target.previewCta)}</p>
      </div>
    </div>
  `;
}

async function fetchAudioPreview(target) {
  const url = target.urlInput.value.trim();
  if (!url) {
    setStatus(
      target.statusNode,
      target.sourceLabel === "Link"
        ? "Pega un link compatible antes de previsualizar."
        : `Pega un link de ${target.sourceLabel} antes de previsualizar.`,
      "error",
    );
    return null;
  }

  setStatus(target.statusNode, target.sourceLabel === "Link" ? "Leyendo datos del link..." : `Leyendo datos de ${target.sourceLabel}...`);
  target.previewButton.disabled = true;
  target.downloadButton.disabled = true;

  try {
    const response = await fetch(`${target.infoEndpoint}?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || (target.sourceLabel === "Link" ? "No se pudo leer el link." : `No se pudo cargar ${target.sourceLabel}.`));
    }

    renderAudioPreview(target, data);
    setStatus(target.statusNode, `Link validado. Ya puedes descargar ${target.outputSelect?.value === "mp4" ? "el MP4" : "el MP3"}.`, "success");
    return data;
  } catch (error) {
    setStatus(target.statusNode, error.message, "error");
    return null;
  } finally {
    target.previewButton.disabled = false;
    target.downloadButton.disabled = false;
  }
}

function attachAudioTool(target) {
  const syncOutputState = () => {
    const isVideo = target.outputSelect?.value === "mp4";
    if (target.qualitySelect) {
      target.qualitySelect.disabled = isVideo;
    }
    if (target.downloadButton) {
      target.downloadButton.textContent = isVideo ? "Descargar MP4" : "Descargar MP3";
    }
  };

  target.outputSelect?.addEventListener("change", syncOutputState);
  syncOutputState();
  target.previewButton.addEventListener("click", () => fetchAudioPreview(target));
  target.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const preview = await fetchAudioPreview(target);
    if (!preview) {
      return;
    }

    const isVideo = target.outputSelect?.value === "mp4";
    const params = new URLSearchParams({ url: target.urlInput.value.trim() });
    if (!isVideo) {
      params.set("quality", target.qualitySelect.value);
    }

    setStatus(target.statusNode, isVideo ? "Preparando descarga del MP4..." : "Preparando descarga del MP3...", "success");
    setTimeout(refreshRecent, 1200);
    window.location.href = `${isVideo ? target.videoEndpoint : target.audioEndpoint}?${params.toString()}`;
  });
}

function detectSource(url) {
  const normalized = url.toLowerCase();
  if (normalized.includes("soundcloud.com")) return "SoundCloud";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YouTube";
  if (normalized.includes("instagram.com")) return "Instagram";
  if (normalized.includes("facebook.com") || normalized.includes("fb.watch")) return "Facebook";
  if (normalized.includes("twitter.com") || normalized.includes("x.com")) return "Twitter";
  if (normalized.includes("tiktok.com")) return "TikTok";
  if (normalized.includes("pinterest.com") || normalized.includes("pin.it")) return "Pinterest";
  return "Link";
}

function buildBulkResults(urls) {
  if (!urls.length) {
    bulkNodes.results.className = "batch-list empty-state";
    bulkNodes.results.textContent = "Todavia no hay descargas preparadas.";
    return;
  }

  bulkNodes.results.className = "batch-list";
  bulkNodes.results.innerHTML = urls
    .map((url, index) => {
      const source = detectSource(url);
      const endpoint = "/api/media-audio";
      const href = `${endpoint}?${new URLSearchParams({ url, quality: bulkNodes.quality.value }).toString()}`;
      return `
        <article class="batch-item">
          <div>
            <span class="project-tool">${escapeHtml(source)}</span>
            <p>${escapeHtml(url)}</p>
          </div>
          <a class="primary-link" href="${href}">Descargar ${index + 1}</a>
        </article>
      `;
    })
    .join("");
}

function setSourceMode(mode) {
  state.imageSourceMode = mode;
  const uploadMode = mode === "upload";
  videoNodes.sourceUpload.classList.toggle("is-active", uploadMode);
  videoNodes.sourcePinterest.classList.toggle("is-active", !uploadMode);
  videoNodes.pinterestPanel.classList.toggle("is-hidden", uploadMode);
  videoNodes.imageInput.required = uploadMode;
}

async function loadPinterestPreview() {
  const url = videoNodes.pinterestUrl.value.trim();
  if (!url) {
    setStatus(videoNodes.status, "Pega un link de Pinterest.", "error");
    return;
  }

  videoNodes.pinterestLoad.disabled = true;
  setStatus(videoNodes.status, "Leyendo pin de Pinterest...");

  try {
    const response = await fetch(`/api/pinterest-preview?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo leer el pin de Pinterest.");
    }

    state.selectedPinterestImage = data;
    setSourceMode("pinterest");
    setStatus(videoNodes.status, "Portada de Pinterest cargada.", "success");
  } catch (error) {
    setStatus(videoNodes.status, error.message, "error");
  } finally {
    videoNodes.pinterestLoad.disabled = false;
  }
}

function renderVideoPreview() {
  const imageFile = getSelectedFile(videoNodes.imageInput);
  const audioFile = getSelectedFile(videoNodes.audioInput);
  const imageUrl = state.selectedPinterestImage?.imageUrl || "";
  const usePinterest = state.imageSourceMode === "pinterest";
  const previewImage = usePinterest ? imageUrl : imageFile ? URL.createObjectURL(imageFile) : "";

  if ((!imageFile && !imageUrl) || !audioFile) {
    setStatus(videoNodes.status, "Debes elegir portada e audio antes de preparar la vista previa.", "error");
    return;
  }

  const ratioLabel = videoNodes.ratioSelect.options[videoNodes.ratioSelect.selectedIndex]?.text || "Landscape 16:9";
  const coverName = usePinterest ? state.selectedPinterestImage?.title || "Pinterest" : imageFile?.name || "Portada";

  videoNodes.preview.classList.remove("preview-empty");
  videoNodes.preview.innerHTML = `
    <div class="preview-content">
      <img src="${escapeHtml(previewImage)}" alt="Preview de video" />
      <div class="preview-body">
        <div>
          <h2>${escapeHtml(audioFile.name)}</h2>
          <p>${escapeHtml(coverName)}</p>
        </div>
        <div class="meta">
          <span>${escapeHtml(ratioLabel)}</span>
          <span>Still cover</span>
          <span>Video</span>
        </div>
        <p>La imagen quedara fija durante toda la duracion del audio y se exportara como MP4.</p>
      </div>
    </div>
  `;

  if (!usePinterest && previewImage) {
    const imageNode = videoNodes.preview.querySelector("img");
    imageNode.addEventListener("load", () => URL.revokeObjectURL(previewImage), { once: true });
  }

  setStatus(videoNodes.status, "Vista previa lista. Ya puedes crear el MP4.", "success");
}

attachAudioTool(youtubeElements);

bulkNodes.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const urls = bulkNodes.urls.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!urls.length) {
    setStatus(bulkNodes.status, "Pega al menos un link.", "error");
    buildBulkResults([]);
    return;
  }

  buildBulkResults(urls);
  setStatus(bulkNodes.status, `${urls.length} descargas preparadas.`, "success");
});

videoNodes.sourceUpload.addEventListener("click", () => setSourceMode("upload"));
videoNodes.sourcePinterest.addEventListener("click", () => setSourceMode("pinterest"));
videoNodes.pinterestLoad.addEventListener("click", loadPinterestPreview);
videoNodes.previewButton.addEventListener("click", renderVideoPreview);
videoNodes.imageInput.addEventListener("change", () => {
  setFileLabel(videoNodes.imageInput, videoNodes.imageName, "Ningun archivo");
  if (getSelectedFile(videoNodes.imageInput)) {
    state.selectedPinterestImage = null;
    setSourceMode("upload");
  }
});
videoNodes.audioInput.addEventListener("change", () => setFileLabel(videoNodes.audioInput, videoNodes.audioName, "Ningun archivo"));

videoNodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const imageFile = getSelectedFile(videoNodes.imageInput);
  const audioFile = getSelectedFile(videoNodes.audioInput);
  const usePinterest = state.imageSourceMode === "pinterest" && Boolean(state.selectedPinterestImage?.imageUrl);

  if ((!imageFile && !usePinterest) || !audioFile) {
    setStatus(videoNodes.status, "Debes seleccionar portada e audio.", "error");
    return;
  }

  renderVideoPreview();
  setStatus(videoNodes.status, "Generando video MP4...");
  videoNodes.previewButton.disabled = true;
  videoNodes.submitButton.disabled = true;

  const formData = new FormData();
  if (state.imageSourceMode === "upload" && imageFile) {
    formData.append("image", imageFile);
  }
  formData.append("audio", audioFile);
  formData.append("ratio", videoNodes.ratioSelect.value);

  if (usePinterest) {
    formData.append("imageUrl", state.selectedPinterestImage.imageUrl);
    formData.append("pinterestUrl", videoNodes.pinterestUrl.value.trim());
  }

  try {
    await postFormForDownload("/api/create-video", formData, "video.mp4");
    setStatus(videoNodes.status, "Video creado y descargado.", "success");
    refreshRecent();
  } catch (error) {
    setStatus(videoNodes.status, error.message, "error");
  } finally {
    videoNodes.previewButton.disabled = false;
    videoNodes.submitButton.disabled = false;
  }
});

trimNodes.audioInput.addEventListener("change", () => setFileLabel(trimNodes.audioInput, trimNodes.audioName, "Ningun archivo"));
trimNodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const audioFile = getSelectedFile(trimNodes.audioInput);
  if (!audioFile) {
    setStatus(trimNodes.status, "Sube un audio.", "error");
    return;
  }

  trimNodes.submitButton.disabled = true;
  setStatus(trimNodes.status, "Recortando audio...");
  const formData = new FormData();
  formData.append("audio", audioFile);
  formData.append("start", trimNodes.startInput.value.trim());
  formData.append("end", trimNodes.endInput.value.trim());
  formData.append("quality", trimNodes.qualitySelect.value);
  formData.append("format", trimNodes.formatSelect.value);

  try {
    await postFormForDownload("/api/trim-audio", formData, "audio-trim.mp3");
    setStatus(trimNodes.status, "Audio recortado y descargado.", "success");
    refreshRecent();
  } catch (error) {
    setStatus(trimNodes.status, error.message, "error");
  } finally {
    trimNodes.submitButton.disabled = false;
  }
});

async function loadFormats() {
  const response = await fetch("/api/formats");
  const data = await response.json();
  state.formats = Array.isArray(data.formats) ? data.formats : [];
  state.videoFormats = Array.isArray(data.videoFormats) ? data.videoFormats : [];
  state.templates = Array.isArray(data.templates) ? data.templates : [];

  [youtubeElements.qualitySelect, trimNodes.qualitySelect, bulkNodes.quality].forEach((select) =>
    populateFormatSelect(select, state.formats),
  );
  populateVideoFormatSelect(videoNodes.ratioSelect, state.videoFormats);
}

loadFormats()
  .then(async () => {
    setStatus(youtubeElements.statusNode, youtubeElements.emptyMessage);
    setStatus(videoNodes.status, "Sube una imagen y un audio para montar el video.");
    setStatus(trimNodes.status, "Sube un audio y marca el rango.");
    await refreshRecent();
  })
  .catch(async (error) => {
    setStatus(youtubeElements.statusNode, `No se pudieron cargar las calidades: ${error.message}`, "error");
    setStatus(videoNodes.status, `No se pudieron cargar los formatos: ${error.message}`, "error");
    await refreshRecent();
  });

if (recentClearButton) {
  recentClearButton.addEventListener("click", clearRecent);
}
