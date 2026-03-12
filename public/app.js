const state = {
  formats: [],
  videoFormats: [],
  templates: [],
  imageSourceMode: "upload",
  selectedPinterestImage: null,
  auth: {
    ready: false,
    user: "anonymous",
    authenticated: false,
    guest: true,
    provider: "guest",
  },
};

const appShell = document.querySelector("#app-shell");
const authElements = {
  gate: document.querySelector("#auth-gate"),
  form: document.querySelector("#login-form"),
  registerForm: document.querySelector("#register-form"),
  googleUsernameForm: document.querySelector("#google-username-form"),
  username: document.querySelector("#login-username"),
  password: document.querySelector("#login-password"),
  registerUsername: document.querySelector("#register-username"),
  registerEmail: document.querySelector("#register-email"),
  registerPassword: document.querySelector("#register-password"),
  googleUsername: document.querySelector("#google-username-input"),
  status: document.querySelector("#login-status"),
  closeButton: document.querySelector("#auth-close-button"),
  loginTab: document.querySelector("#auth-login-tab"),
  registerTab: document.querySelector("#auth-register-tab"),
  googleButton: document.querySelector("#google-auth-button"),
  logoutButton: document.querySelector("#logout-button"),
  sessionUser: document.querySelector("#session-user"),
  accountButton: document.querySelector("#account-button"),
  accountDropdown: document.querySelector("#account-dropdown"),
  accountLoginLink: document.querySelector("#account-login-link"),
  accountGoogleLink: document.querySelector("#account-google-link"),
  guestActions: document.querySelector("#account-guest-actions"),
  userActions: document.querySelector("#account-user-actions"),
  accountSearchInput: document.querySelector("#account-user-search"),
  accountSearchResults: document.querySelector("#account-search-results"),
};

const navLinks = [...document.querySelectorAll(".nav-link")];
const panels = [...document.querySelectorAll(".tool-panel")];
const recentCarouselNode = document.querySelector("#recent-carousel");

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
  emptyMessage: "Waiting for a supported link.",
  previewCta: "If the preview looks right, you can now download the MP3 audio or MP4 video.",
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

function setCompletedStatus(node, message = "Download complete") {
  node.innerHTML = `
    <span class="status-check" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  `;
  node.dataset.tone = "success";
}

function buildPlanLabel(subscription) {
  if (!subscription) {
    return "";
  }

  const badge = subscription.badge ? `${subscription.badge} ` : "";
  return `${badge}${subscription.name}`;
}

function getSubscriptionDisplayColor(subscription) {
  if (!subscription) {
    return "#f0dfad";
  }

  return subscription.id === "free" ? "#74d99f" : subscription.color || "#f0dfad";
}

function renderUsername(username, subscription) {
  const safeUsername = escapeHtml(username || "anonymous");
  if (subscription?.id && subscription.id !== "free") {
    return `<span class="username-crown" aria-hidden="true">♔</span><span>${safeUsername}</span>`;
  }

  return safeUsername;
}

function isAnonymousUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  return !normalized || normalized === "anonymous" || normalized === "open-access";
}

function renderUserSearchResults(container, items = []) {
  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<div class="user-search-empty">No users found.</div>';
    container.classList.remove("is-hidden");
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const avatar = item.avatarDataUrl
        ? `<img class="user-search-avatar-image" src="${escapeHtml(item.avatarDataUrl)}" alt="${escapeHtml(item.username)}" />`
        : `<span class="user-search-avatar-fallback">${escapeHtml(item.username.slice(0, 1).toUpperCase())}</span>`;
      const label = buildPlanLabel(item.subscription);
      return `
        <a class="user-search-item" href="/profile.html?user=${encodeURIComponent(item.username)}">
          <span class="user-search-avatar">${avatar}</span>
          <span class="user-search-body">
            <strong>${renderUsername(item.username, item.subscription)}</strong>
            <small>${escapeHtml(label || "Profile")}</small>
          </span>
        </a>
      `;
    })
    .join("");
  container.classList.remove("is-hidden");
}

async function fetchUserSearch(query) {
  const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
  const data = await response.json().catch(() => ({ items: [] }));
  if (!response.ok) {
    throw new Error(data.error || "Could not search users.");
  }
  return Array.isArray(data.items) ? data.items : [];
}

function wireUserSearch(input, container) {
  if (!input || !container) {
    return;
  }

  let timer = null;
  let requestId = 0;

  input.addEventListener("input", () => {
    const query = input.value.trim();
    window.clearTimeout(timer);

    if (query.length < 2) {
      container.innerHTML = "";
      container.classList.add("is-hidden");
      return;
    }

    timer = window.setTimeout(async () => {
      const currentRequest = ++requestId;
      try {
        const items = await fetchUserSearch(query);
        if (currentRequest !== requestId) {
          return;
        }
        renderUserSearchResults(container, items);
      } catch (_error) {
        if (currentRequest !== requestId) {
          return;
        }
        container.innerHTML = '<div class="user-search-empty">Search unavailable.</div>';
        container.classList.remove("is-hidden");
      }
    }, 260);
  });
}

function openAuthGate(mode = "login") {
  authElements.gate.classList.remove("is-hidden");
  document.body.classList.add("auth-open");
  setAuthMode(mode);
}

function closeAuthGate() {
  authElements.gate.classList.add("is-hidden");
  document.body.classList.remove("auth-open");
}

function setAuthMode(mode = "login") {
  const isRegister = mode === "register";
  const isGoogleSetup = mode === "google-username";
  authElements.loginTab?.classList.toggle("is-active", !isRegister && !isGoogleSetup);
  authElements.registerTab?.classList.toggle("is-active", isRegister);
  authElements.loginTab?.classList.toggle("is-hidden", isGoogleSetup);
  authElements.registerTab?.classList.toggle("is-hidden", isGoogleSetup);
  authElements.form?.classList.toggle("is-hidden", isRegister || isGoogleSetup);
  authElements.registerForm?.classList.toggle("is-hidden", !isRegister);
  authElements.googleUsernameForm?.classList.toggle("is-hidden", !isGoogleSetup);
  authElements.googleButton?.classList.toggle("is-hidden", isGoogleSetup || authElements.googleButton.classList.contains("is-disabled-google"));
}

function setAuthState(session = {}) {
  state.auth.ready = true;
  state.auth.user = session.user || "anonymous";
  state.auth.authenticated = Boolean(session.authenticated);
  state.auth.guest = session.guest !== false;
  state.auth.provider = session.provider || "guest";
  appShell.classList.remove("is-hidden-shell");
  authElements.sessionUser.textContent = state.auth.authenticated ? state.auth.user : "Log In";
  authElements.guestActions?.classList.toggle("is-hidden", state.auth.authenticated);
  authElements.userActions?.classList.toggle("is-hidden", !state.auth.authenticated);
  if (authElements.accountGoogleLink) {
    authElements.accountGoogleLink.classList.toggle("is-hidden", !session.googleEnabled);
  }
  if (authElements.googleButton) {
    authElements.googleButton.classList.toggle("is-disabled-google", !session.googleEnabled);
    authElements.googleButton.classList.toggle("is-hidden", !session.googleEnabled);
  }
  authElements.accountDropdown?.classList.add("is-hidden");
  authElements.accountButton?.classList.remove("is-open");
  authElements.accountButton?.setAttribute("aria-expanded", "false");
  if (authElements.accountSearchInput) {
    authElements.accountSearchInput.value = "";
  }
  authElements.accountSearchResults?.classList.add("is-hidden");
  if (authElements.accountSearchResults) {
    authElements.accountSearchResults.innerHTML = "";
  }
}

function setLoginStatus(message, tone = "") {
  setStatus(authElements.status, message, tone);
}

function updateGoogleLinks() {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const href = `/api/auth/google/start?next=${encodeURIComponent(next || "/")}`;
  authElements.googleButton?.setAttribute("href", href);
  authElements.accountGoogleLink?.setAttribute("href", href);
}

function handleUnauthorized() {
  setAuthState({ authenticated: false, guest: true, user: "anonymous", provider: "guest" });
  authElements.password.value = "";
  setLoginStatus("You are back in anonymous mode.", "error");
}

async function apiFetch(input, init) {
  const response = await fetch(input, init);
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Sign in again.");
  }

  return response;
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
  const response = await apiFetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Could not process the request." }));
    throw new Error(data.error || "Could not process the request.");
  }

  const blob = await response.blob();
  downloadBlob(blob, response, fallbackName);
}

async function getForDownload(url, fallbackName) {
  const response = await apiFetch(url, { method: "GET", credentials: "same-origin" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Could not process the request." }));
    const details = typeof data.details === "string" ? data.details.trim() : "";
    throw new Error(details ? `${data.error || "Could not process the request."} (${details})` : data.error || "Could not process the request.");
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
    recentCarouselNode.innerHTML = `<div class="recent-placeholder">No conversions yet.</div>`;
    return;
  }

  recentCarouselNode.classList.remove("recent-empty");
  recentCarouselNode.classList.add("recent-animated");

  const cardsMarkup = items
    .map((item) => {
      const badge = item.type === "mp4" ? "MP4" : "MP3";
      const visual = item.preview
        ? `
          <div class="recent-visual">
            <img
              class="recent-thumb"
              src="${escapeHtml(item.preview)}"
              alt="${escapeHtml(item.title)}"
              onerror="this.parentElement.classList.add('is-fallback'); this.remove();"
            />
            <div class="recent-fallback recent-fallback-icon" aria-hidden="true">
              <span class="recent-fallback-glyph">◫</span>
            </div>
          </div>
        `
        : `
          <div class="recent-visual is-fallback">
            <div class="recent-fallback recent-fallback-icon" aria-hidden="true">
              <span class="recent-fallback-glyph">◫</span>
            </div>
          </div>
        `;

      return `
        <article class="recent-card" data-accent="${escapeHtml(item.accent || "audio")}">
          ${visual}
          <div class="recent-body">
            <div class="recent-meta-row">
              <span class="recent-badge">${badge}</span>
              ${
                isAnonymousUsername(item.username)
                  ? `<span class="recent-user" style="color:${escapeHtml(getSubscriptionDisplayColor(item.subscription))}">${renderUsername(item.username || "anonymous", item.subscription)}</span>`
                  : `<a
                class="user-link recent-user"
                href="/profile.html?user=${encodeURIComponent(item.username || "anonymous")}#profile-history"
                style="color:${escapeHtml(getSubscriptionDisplayColor(item.subscription))}"
                title="${escapeHtml(buildPlanLabel(item.subscription))}"
              >${renderUsername(item.username || "anonymous", item.subscription)}</a>`
              }
            </div>
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
    const response = await apiFetch("/api/recent");
    const data = await response.json();
    renderRecent(Array.isArray(data.items) ? data.items : []);
  } catch (_error) {
    recentCarouselNode.classList.add("recent-empty");
    recentCarouselNode.innerHTML = `<div class="recent-placeholder">Could not load history.</div>`;
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

function renderPreviewLoader(node, message = "Loading...") {
  if (!node) {
    return;
  }

  node.classList.add("preview-empty");
  node.innerHTML = `
    <div class="preview-placeholder preview-loader-shell">
      <span class="loader" aria-hidden="true"></span>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function fetchAudioPreview(target) {
  const url = target.urlInput.value.trim();
  if (!url) {
    setStatus(
      target.statusNode,
      target.sourceLabel === "Link"
        ? "Paste a supported link before previewing."
        : `Paste a ${target.sourceLabel} link before previewing.`,
      "error",
    );
    return null;
  }

  setStatus(target.statusNode, target.sourceLabel === "Link" ? "Reading link data..." : `Reading ${target.sourceLabel} data...`);
  renderPreviewLoader(target.previewNode, target.sourceLabel === "Link" ? "Loading preview..." : `Loading ${target.sourceLabel} preview...`);
  target.previewButton.disabled = true;
  target.downloadButton.disabled = true;

  try {
    const response = await apiFetch(`${target.infoEndpoint}?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) {
      const baseError = data.error || (target.sourceLabel === "Link" ? "Could not read the link." : `Could not load ${target.sourceLabel}.`);
      const details = typeof data.details === "string" ? data.details.trim() : "";
      throw new Error(details ? `${baseError} (${details})` : baseError);
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
      target.downloadButton.textContent = isVideo ? "Download MP4" : "Download MP3";
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

    setStatus(target.statusNode, isVideo ? "Preparing MP4 download..." : "Preparing MP3 download...", "success");
    renderPreviewLoader(target.previewNode, isVideo ? "Preparing MP4 download..." : "Preparing MP3 download...");
    await getForDownload(`${isVideo ? target.videoEndpoint : target.audioEndpoint}?${params.toString()}`, isVideo ? "video.mp4" : "audio.mp3");
    setCompletedStatus(target.statusNode, "Download complete");
    setTimeout(() => {
      setStatus(target.statusNode, target.previewCta, "success");
    }, 1800);
    setTimeout(refreshRecent, 1200);
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
    bulkNodes.results.textContent = "No downloads prepared yet.";
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
          <a class="primary-link" href="${href}">Download ${index + 1}</a>
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
    setStatus(videoNodes.status, "Paste a Pinterest link.", "error");
    return;
  }

  videoNodes.pinterestLoad.disabled = true;
  setStatus(videoNodes.status, "Reading Pinterest pin...");

  try {
    const response = await apiFetch(`/api/pinterest-preview?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not read the Pinterest pin.");
    }

    state.selectedPinterestImage = data;
    setSourceMode("pinterest");
    setStatus(videoNodes.status, "Pinterest cover loaded.", "success");
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
    setStatus(videoNodes.status, "You must choose a cover and audio before preparing the preview.", "error");
    return;
  }

  const ratioLabel = videoNodes.ratioSelect.options[videoNodes.ratioSelect.selectedIndex]?.text || "Landscape 16:9";
  const coverName = usePinterest ? state.selectedPinterestImage?.title || "Pinterest" : imageFile?.name || "Cover";

  videoNodes.preview.classList.remove("preview-empty");
  videoNodes.preview.innerHTML = `
    <div class="preview-content">
      <img src="${escapeHtml(previewImage)}" alt="Video preview" />
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
        <p>The image will stay static for the full audio duration and will be exported as MP4.</p>
      </div>
    </div>
  `;

  if (!usePinterest && previewImage) {
    const imageNode = videoNodes.preview.querySelector("img");
    imageNode.addEventListener("load", () => URL.revokeObjectURL(previewImage), { once: true });
  }

  setStatus(videoNodes.status, "Preview ready. You can now create the MP4.", "success");
}

attachAudioTool(youtubeElements);

bulkNodes.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const urls = bulkNodes.urls.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!urls.length) {
    setStatus(bulkNodes.status, "Paste at least one link.", "error");
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
  setFileLabel(videoNodes.imageInput, videoNodes.imageName, "No file selected");
  if (getSelectedFile(videoNodes.imageInput)) {
    state.selectedPinterestImage = null;
    setSourceMode("upload");
  }
});
videoNodes.audioInput.addEventListener("change", () => setFileLabel(videoNodes.audioInput, videoNodes.audioName, "No file selected"));

videoNodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const imageFile = getSelectedFile(videoNodes.imageInput);
  const audioFile = getSelectedFile(videoNodes.audioInput);
  const usePinterest = state.imageSourceMode === "pinterest" && Boolean(state.selectedPinterestImage?.imageUrl);

  if ((!imageFile && !usePinterest) || !audioFile) {
    setStatus(videoNodes.status, "You must select a cover and audio.", "error");
    return;
  }

  renderVideoPreview();
  setStatus(videoNodes.status, "Generating MP4 video...");
  renderPreviewLoader(videoNodes.preview, "Generating MP4 video...");
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
    setStatus(videoNodes.status, "Video created and downloaded.", "success");
    refreshRecent();
  } catch (error) {
    setStatus(videoNodes.status, error.message, "error");
  } finally {
    videoNodes.previewButton.disabled = false;
    videoNodes.submitButton.disabled = false;
  }
});

trimNodes.audioInput.addEventListener("change", () => setFileLabel(trimNodes.audioInput, trimNodes.audioName, "No file selected"));
trimNodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const audioFile = getSelectedFile(trimNodes.audioInput);
  if (!audioFile) {
    setStatus(trimNodes.status, "Upload an audio file.", "error");
    return;
  }

  trimNodes.submitButton.disabled = true;
  setStatus(trimNodes.status, "Trimming audio...");
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
  const response = await apiFetch("/api/formats");
  const data = await response.json();
  state.formats = Array.isArray(data.formats) ? data.formats : [];
  state.videoFormats = Array.isArray(data.videoFormats) ? data.videoFormats : [];
  state.templates = Array.isArray(data.templates) ? data.templates : [];

  [youtubeElements.qualitySelect, trimNodes.qualitySelect, bulkNodes.quality].forEach((select) =>
    populateFormatSelect(select, state.formats),
  );
  populateVideoFormatSelect(videoNodes.ratioSelect, state.videoFormats);
}

async function bootAuthenticatedApp() {
  await loadFormats();
  setStatus(youtubeElements.statusNode, youtubeElements.emptyMessage);
  setStatus(videoNodes.status, "Upload an image and audio to build the video.");
  setStatus(trimNodes.status, "Upload audio and mark the range.");
  await refreshRecent();
}

async function restoreSession() {
  try {
    const response = await fetch("/api/auth/session", { credentials: "same-origin" });
    const data = await response.json();
    setAuthState(data);
    updateGoogleLinks();
    const hasGoogleError = window.location.search.includes("auth_error=google");
    if (hasGoogleError) {
      openAuthGate("login");
      setLoginStatus("Could not sign in with Google.", "error");
    } else if (data.needsUsernameSetup) {
      openAuthGate("google-username");
      if (authElements.googleUsername) {
        authElements.googleUsername.value = data.user || "";
      }
      setLoginStatus("Choose your username once to complete your Google account.");
    } else {
      closeAuthGate();
    }
    await bootAuthenticatedApp();
  } catch (_error) {
    setAuthState({ authenticated: false, guest: true, user: "anonymous", provider: "guest" });
    setLoginStatus("Could not validate the session.", "error");
    await bootAuthenticatedApp();
  }
}

authElements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginStatus("Validating access...");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        username: authElements.username.value.trim(),
        password: authElements.password.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not sign in.");
    }

    authElements.password.value = "";
    setAuthState({ ...data, authenticated: true, guest: false });
    setLoginStatus("Signed in.", "success");
    closeAuthGate();
    await bootAuthenticatedApp();
  } catch (error) {
    setLoginStatus(error.message, "error");
  }
});

authElements.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginStatus("Creating account...");

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        username: authElements.registerUsername.value.trim(),
        email: authElements.registerEmail.value.trim(),
        password: authElements.registerPassword.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not create the account.");
    }

    authElements.registerPassword.value = "";
    setAuthState({ ...data, authenticated: true, guest: false });
    setLoginStatus("Account created.", "success");
    closeAuthGate();
    await bootAuthenticatedApp();
  } catch (error) {
    setLoginStatus(error.message, "error");
  }
});

authElements.googleUsernameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = authElements.googleUsername?.value?.trim() || "";
  if (!username) {
    setLoginStatus("Enter a valid username.", "error");
    return;
  }

  setLoginStatus("Saving username...");
  try {
    const response = await fetch("/api/account/google-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not save the username.");
    }

    setAuthState({ authenticated: true, guest: false, user: data.user, provider: "google", googleEnabled: true });
    setLoginStatus("Account ready.", "success");
    closeAuthGate();
    await bootAuthenticatedApp();
  } catch (error) {
    setLoginStatus(error.message, "error");
  }
});

authElements.logoutButton.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } finally {
    setAuthState({ authenticated: false, guest: true, user: "anonymous", provider: "guest" });
    authElements.password.value = "";
    setLoginStatus("You are still using the app as anonymous.", "success");
  }
});

authElements.closeButton?.addEventListener("click", closeAuthGate);
authElements.loginTab?.addEventListener("click", () => setAuthMode("login"));
authElements.registerTab?.addEventListener("click", () => setAuthMode("register"));
authElements.accountLoginLink?.addEventListener("click", () => {
  openAuthGate("login");
  authElements.accountDropdown?.classList.add("is-hidden");
  authElements.accountButton?.classList.remove("is-open");
  authElements.accountButton?.setAttribute("aria-expanded", "false");
});

authElements.accountButton?.addEventListener("click", () => {
  const isOpen = authElements.accountDropdown?.classList.toggle("is-hidden") === false;
  authElements.accountButton?.classList.toggle("is-open", isOpen);
  authElements.accountButton?.setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (event) => {
  if (!authElements.accountDropdown || !authElements.accountButton) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (authElements.accountButton.contains(target) || authElements.accountDropdown.contains(target)) {
    return;
  }

  authElements.accountDropdown.classList.add("is-hidden");
  authElements.accountButton.classList.remove("is-open");
  authElements.accountButton.setAttribute("aria-expanded", "false");
  authElements.accountSearchResults?.classList.add("is-hidden");
});

wireUserSearch(authElements.accountSearchInput, authElements.accountSearchResults);
updateGoogleLinks();
restoreSession();
