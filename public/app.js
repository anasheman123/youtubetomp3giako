const form = document.querySelector("#converter-form");
const urlInput = document.querySelector("#youtube-url");
const qualitySelect = document.querySelector("#quality");
const statusNode = document.querySelector("#status");
const previewNode = document.querySelector("#preview");
const previewButton = document.querySelector("#preview-button");
const downloadButton = document.querySelector("#download-button");
const recentCarouselNode = document.querySelector("#recent-carousel");
const videoForm = document.querySelector("#video-form");
const videoImageInput = document.querySelector("#video-image");
const videoAudioInput = document.querySelector("#video-audio");
const imageFileNameNode = document.querySelector("#image-file-name");
const audioFileNameNode = document.querySelector("#audio-file-name");
const sourceUploadButton = document.querySelector("#source-upload");
const sourcePinterestButton = document.querySelector("#source-pinterest");
const pinterestPanel = document.querySelector("#pinterest-panel");
const pinterestUrlInput = document.querySelector("#pinterest-url");
const pinterestPreviewButton = document.querySelector("#pinterest-preview-button");
const videoRatioSelect = document.querySelector("#video-ratio");
const videoStatusNode = document.querySelector("#video-status");
const videoPreviewNode = document.querySelector("#video-preview");
const videoPreviewButton = document.querySelector("#video-preview-button");
const videoSubmitButton = document.querySelector("#video-submit-button");
let imageSourceMode = "upload";
let selectedPinterestImage = null;

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
}

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  if (tone) {
    statusNode.dataset.tone = tone;
    return;
  }
  delete statusNode.dataset.tone;
}

function setVideoStatus(message, tone = "") {
  videoStatusNode.textContent = message;
  if (tone) {
    videoStatusNode.dataset.tone = tone;
    return;
  }
  delete videoStatusNode.dataset.tone;
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

  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
      const hasPreview = Boolean(item.preview);
      const title = escapeHtml(item.title);
      const subtitle = escapeHtml(item.subtitle || "");
      const badge = item.type === "mp3" ? "MP3" : "MP4";

      return `
        <article class="recent-card" data-accent="${escapeHtml(item.accent || "audio")}">
          ${
            hasPreview
              ? `<img class="recent-thumb" src="${item.preview}" alt="${title}" />`
              : `<div class="recent-fallback">${badge}</div>`
          }
          <div class="recent-body">
            <span class="recent-badge">${badge}</span>
            <h3>${title}</h3>
            <p>${subtitle}</p>
            <small>${formatRecentTime(item.createdAt)}</small>
          </div>
        </article>
      `;
    })
    .join("");

  recentCarouselNode.innerHTML = `
    <div class="recent-track">
      ${cardsMarkup}
      ${cardsMarkup}
    </div>
  `;
}

async function refreshRecent() {
  try {
    const response = await fetch("/api/recent");
    const data = await response.json();
    renderRecent(Array.isArray(data.items) ? data.items : []);
  } catch (_error) {
    recentCarouselNode.classList.add("recent-empty");
    recentCarouselNode.innerHTML = `<div class="recent-placeholder">No se pudo cargar el historial.</div>`;
  }
}

function renderPreview(data) {
  const image = data.thumbnails?.[data.thumbnails.length - 1]?.url ?? "";
  const title = escapeHtml(data.title);
  const author = escapeHtml(data.author);

  previewNode.classList.remove("preview-empty");
  previewNode.innerHTML = `
    <div class="preview-content">
      <img src="${image}" alt="Miniatura de ${title}" />
      <div class="preview-body">
        <div>
          <h2>${title}</h2>
          <p>${author}</p>
        </div>
        <div class="meta">
          <span>${formatDuration(data.lengthSeconds)}</span>
          <span>${qualitySelect.value}</span>
          <span>MP3</span>
        </div>
        <p>Si la ficha es correcta, pulsa descargar para generar el MP3 en esta misma sesion.</p>
      </div>
    </div>
  `;
}

async function loadFormats() {
  const response = await fetch("/api/formats");
  const data = await response.json();

  qualitySelect.innerHTML = data.formats
    .map(
      (format) =>
        `<option value="${format.quality}">${format.label} - ${format.quality} - ${format.note}</option>`,
    )
    .join("");

  videoRatioSelect.innerHTML = data.videoFormats
    .map((format) => `<option value="${format.ratio}">${format.label} - ${format.size}</option>`)
    .join("");
}

function getSelectedFile(input) {
  return input.files && input.files[0] ? input.files[0] : null;
}

function setFileLabel(input, node, emptyLabel) {
  const file = getSelectedFile(input);
  node.textContent = file ? file.name : emptyLabel;
}

function renderVideoPreview() {
  const imageFile = getSelectedFile(videoImageInput);
  const audioFile = getSelectedFile(videoAudioInput);
  const imageUrl = selectedPinterestImage?.imageUrl || "";
  const previewImage = imageSourceMode === "pinterest" ? imageUrl : imageFile ? URL.createObjectURL(imageFile) : "";

  if ((!imageFile && !imageUrl) || !audioFile) {
    setVideoStatus("Sube ambos archivos antes de preparar la vista previa.", "error");
    return;
  }

  const ratioLabel = videoRatioSelect.options[videoRatioSelect.selectedIndex]?.text || "Landscape 16:9";
  const imageName = imageSourceMode === "pinterest" ? selectedPinterestImage?.title || "Pinterest" : imageFile.name;

  videoPreviewNode.classList.remove("preview-empty");
  videoPreviewNode.innerHTML = `
    <div class="preview-content">
      <img src="${previewImage}" alt="Portada para video" />
      <div class="preview-body">
        <div>
          <h2>${escapeHtml(audioFile.name)}</h2>
          <p>${escapeHtml(imageName)}</p>
        </div>
        <div class="meta">
          <span>${escapeHtml(ratioLabel)}</span>
          <span>${Math.round(audioFile.size / 1024 / 1024 * 10) / 10} MB audio</span>
          <span>MP4</span>
        </div>
        <p>La imagen quedara fija durante toda la duracion del audio y se exportara como video.</p>
      </div>
    </div>
  `;

  if (imageSourceMode === "upload") {
    const previewImageNode = videoPreviewNode.querySelector("img");
    previewImageNode.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(previewImage);
      },
      { once: true },
    );
  }

  setVideoStatus("Vista previa lista. Ya puedes crear el MP4.", "success");
}

function setSourceMode(mode) {
  imageSourceMode = mode;
  const isUpload = mode === "upload";

  sourceUploadButton.classList.toggle("is-active", isUpload);
  sourcePinterestButton.classList.toggle("is-active", !isUpload);
  pinterestPanel.classList.toggle("is-hidden", isUpload);
  videoImageInput.required = isUpload;

  if (!isUpload) {
    setVideoStatus("Pega un link de Pinterest y carga la portada.", "");
  }
}

async function loadPinterestPreview() {
  const url = pinterestUrlInput.value.trim();
  if (!url) {
    setVideoStatus("Pega un link de Pinterest.", "error");
    return;
  }

  pinterestPreviewButton.disabled = true;
  setVideoStatus("Leyendo pin de Pinterest...", "");

  try {
    const response = await fetch(`/api/pinterest-preview?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo leer el pin de Pinterest.");
    }

    selectedPinterestImage = data;
    setSourceMode("pinterest");
    setVideoStatus("Portada de Pinterest cargada.", "success");
    if (getSelectedFile(videoAudioInput)) {
      renderVideoPreview();
    }
  } catch (error) {
    setVideoStatus(error.message, "error");
  } finally {
    pinterestPreviewButton.disabled = false;
  }
}

async function fetchPreview() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Pega un link antes de previsualizar.", "error");
    return null;
  }

  setStatus("Leyendo datos del video...", "");
  previewButton.disabled = true;
  downloadButton.disabled = true;

  try {
    const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el video.");
    }

    renderPreview(data);
    setStatus("Video validado. Ya puedes descargar el MP3.", "success");
    return data;
  } catch (error) {
    setStatus(error.message, "error");
    return null;
  } finally {
    previewButton.disabled = false;
    downloadButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const preview = await fetchPreview();
  if (!preview) {
    return;
  }

  const params = new URLSearchParams({
    url: urlInput.value.trim(),
    quality: qualitySelect.value,
  });

  setStatus("Preparando descarga del MP3...", "success");
  setTimeout(refreshRecent, 1200);
  window.location.href = `/api/convert?${params.toString()}`;
});

previewButton.addEventListener("click", fetchPreview);

videoPreviewButton.addEventListener("click", renderVideoPreview);
sourceUploadButton.addEventListener("click", () => setSourceMode("upload"));
sourcePinterestButton.addEventListener("click", () => setSourceMode("pinterest"));
pinterestPreviewButton.addEventListener("click", loadPinterestPreview);

videoImageInput.addEventListener("change", () => {
  setFileLabel(videoImageInput, imageFileNameNode, "Ningun archivo");
  if (getSelectedFile(videoImageInput)) {
    selectedPinterestImage = null;
    setSourceMode("upload");
  }
});

videoAudioInput.addEventListener("change", () => {
  setFileLabel(videoAudioInput, audioFileNameNode, "Ningun archivo");
});

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const imageFile = getSelectedFile(videoImageInput);
  const audioFile = getSelectedFile(videoAudioInput);
  const hasPinterestImage = imageSourceMode === "pinterest" && Boolean(selectedPinterestImage?.imageUrl);

  if ((!imageFile && !hasPinterestImage) || !audioFile) {
    setVideoStatus("Debes seleccionar una imagen o una portada de Pinterest, y un audio.", "error");
    return;
  }

  renderVideoPreview();
  setVideoStatus("Generando video MP4. Esto puede tardar un poco...", "");
  videoPreviewButton.disabled = true;
  videoSubmitButton.disabled = true;

  const formData = new FormData();
  if (imageSourceMode === "upload" && imageFile) {
    formData.append("image", imageFile);
  }
  formData.append("audio", audioFile);
  formData.append("ratio", videoRatioSelect.value);
  if (imageSourceMode === "pinterest" && selectedPinterestImage?.imageUrl) {
    formData.append("imageUrl", selectedPinterestImage.imageUrl);
    formData.append("pinterestUrl", pinterestUrlInput.value.trim());
  }

  try {
    const response = await fetch("/api/create-video", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "No se pudo crear el video." }));
      throw new Error(data.error || "No se pudo crear el video.");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
    const fileName = decodeURIComponent(match?.[1] || match?.[2] || "video.mp4");

    anchor.href = downloadUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);

    setVideoStatus("Video creado y descargado.", "success");
    refreshRecent();
  } catch (error) {
    setVideoStatus(error.message, "error");
  } finally {
    videoPreviewButton.disabled = false;
    videoSubmitButton.disabled = false;
  }
});

loadFormats()
  .then(() => {
    setStatus("Esperando un link valido.");
    setVideoStatus("Sube una imagen y un audio para montar el video.");
    refreshRecent();
  })
  .catch((error) => {
    setStatus(`No se pudieron cargar las calidades: ${error.message}`, "error");
    setVideoStatus(`No se pudieron cargar los formatos: ${error.message}`, "error");
    refreshRecent();
  });
