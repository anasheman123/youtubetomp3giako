function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = "/";
    throw new Error("Session required.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not load the information.");
  }

  return data;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-AR");
}

function getRequestedUser() {
  const params = new URLSearchParams(window.location.search);
  return params.get("user")?.trim() || "";
}

function buildUserLabel(username) {
  return `${username}`;
}

function renderUsername(username, subscription) {
  const safeUsername = escapeHtml(username || "-");
  if (subscription?.id && subscription.id !== "free") {
    return `<span class="username-crown" aria-hidden="true">♔</span><span>${safeUsername}</span>`;
  }

  return safeUsername;
}

function getSubscriptionDisplayColor(subscription) {
  if (!subscription) {
    return "";
  }

  return subscription.id === "free" ? "#74d99f" : subscription.color || "";
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
      const label = item.subscription?.name || "Profile";
      return `
        <a class="user-search-item" href="/profile.html?user=${encodeURIComponent(item.username)}">
          <span class="user-search-avatar">${avatar}</span>
          <span class="user-search-body">
            <strong>${renderUsername(item.username, item.subscription)}</strong>
            <small>${escapeHtml(label)}</small>
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

function wireUserSearch() {
  const input = document.querySelector("#profile-user-search");
  const container = document.querySelector("#profile-search-results");
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

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (input.contains(target) || container.contains(target)) {
      return;
    }

    container.classList.add("is-hidden");
  });
}

function setProfilePlan(planId, planName) {
  const pill = document.querySelector("#profile-plan");
  const card = document.querySelector(".avatar-card");
  const normalizedPlan = String(planId || "free").toLowerCase();
  pill.className = `plan-pill plan-${normalizedPlan}`;
  pill.textContent = planName || "Newbie";
  if (card) {
    card.classList.remove("avatar-card-free", "avatar-card-pro", "avatar-card-elite", "avatar-card-legend");
    card.classList.add(`avatar-card-${normalizedPlan}`);
  }
}

async function saveAvatarDataUrl(avatarDataUrl) {
  return fetchJson("/api/profile/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarDataUrl }),
  });
}

function renderAvatar(avatarDataUrl) {
  const avatarDisplay = document.querySelector("#avatar-display");
  if (avatarDataUrl) {
    avatarDisplay.innerHTML = `<img src="${escapeHtml(avatarDataUrl)}" alt="Avatar de perfil" />`;
    return;
  }

  avatarDisplay.innerHTML = `
    <svg viewBox="0 0 40 40" fill="none" stroke="#d9c39a" stroke-width="1.4">
      <circle cx="20" cy="15" r="7"></circle>
      <path d="M6 36c0-7.732 6.268-12 14-12s14 4.268 14 12"></path>
    </svg>
  `;
}

const avatarEditorState = {
  dataUrl: "",
  image: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

const avatarEditorElements = {
  modal: document.querySelector("#avatar-editor"),
  frame: document.querySelector("#avatar-editor-frame"),
  image: document.querySelector("#avatar-editor-image"),
  zoom: document.querySelector("#avatar-zoom"),
  offsetX: document.querySelector("#avatar-offset-x"),
  offsetY: document.querySelector("#avatar-offset-y"),
  status: document.querySelector("#avatar-editor-status"),
  save: document.querySelector("#avatar-editor-save"),
  close: document.querySelector("#avatar-editor-close"),
};

function setAvatarEditorStatus(message, tone = "") {
  avatarEditorElements.status.textContent = message;
  if (tone) {
    avatarEditorElements.status.dataset.tone = tone;
  } else {
    delete avatarEditorElements.status.dataset.tone;
  }
}

function openAvatarEditor() {
  avatarEditorElements.modal.classList.remove("is-hidden");
  avatarEditorElements.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-open");
}

function closeAvatarEditor() {
  avatarEditorElements.modal.classList.add("is-hidden");
  avatarEditorElements.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-open");
}

function updateAvatarPreview() {
  const { image, zoom, offsetX, offsetY } = avatarEditorState;
  if (!image) {
    return;
  }

  const frameSize = avatarEditorElements.frame.clientWidth || 320;
  const baseScale = Math.max(frameSize / image.width, frameSize / image.height);
  const drawWidth = image.width * baseScale * zoom;
  const drawHeight = image.height * baseScale * zoom;
  const maxOffsetX = Math.max(0, (drawWidth - frameSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - frameSize) / 2);
  const left = (frameSize - drawWidth) / 2 + (offsetX / 100) * maxOffsetX;
  const top = (frameSize - drawHeight) / 2 + (offsetY / 100) * maxOffsetY;

  avatarEditorElements.image.style.width = `${drawWidth}px`;
  avatarEditorElements.image.style.height = `${drawHeight}px`;
  avatarEditorElements.image.style.left = `${left}px`;
  avatarEditorElements.image.style.top = `${top}px`;
}

function loadFileAsDataUrl(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

async function prepareAvatarEditor(file) {
  const dataUrl = await loadFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error("Could not load the image preview."));
    nextImage.src = dataUrl;
  });

  avatarEditorState.dataUrl = dataUrl;
  avatarEditorState.image = image;
  avatarEditorState.zoom = 1;
  avatarEditorState.offsetX = 0;
  avatarEditorState.offsetY = 0;

  avatarEditorElements.image.src = dataUrl;
  avatarEditorElements.image.classList.remove("is-hidden");
  avatarEditorElements.zoom.value = "100";
  avatarEditorElements.offsetX.value = "0";
  avatarEditorElements.offsetY.value = "0";
  setAvatarEditorStatus("Adjust the image and save when it looks right.");
  openAvatarEditor();
  updateAvatarPreview();
}

function buildAvatarDataUrl() {
  const { image, zoom, offsetX, offsetY } = avatarEditorState;
  const canvasSize = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");
  const baseScale = Math.max(canvasSize / image.width, canvasSize / image.height);
  const drawWidth = image.width * baseScale * zoom;
  const drawHeight = image.height * baseScale * zoom;
  const maxOffsetX = Math.max(0, (drawWidth - canvasSize) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - canvasSize) / 2);
  const left = (canvasSize - drawWidth) / 2 + (offsetX / 100) * maxOffsetX;
  const top = (canvasSize - drawHeight) / 2 + (offsetY / 100) * maxOffsetY;

  ctx.drawImage(image, left, top, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function renderHistoryVisual(item) {
  const preview = item.thumbnailUrl || item.preview || "";
  if (preview) {
    return `
      <div class="recent-visual">
        <img
          class="recent-thumb"
          src="${escapeHtml(preview)}"
          alt="${escapeHtml(item.title || "Preview")}"
          onerror="this.parentElement.classList.add('is-fallback'); this.remove();"
        />
        <div class="recent-fallback recent-fallback-icon" aria-hidden="true">
          <span class="recent-fallback-glyph">${(item.format || item.type) === "mp4" ? "MP4" : "MP3"}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="recent-visual is-fallback">
      <div class="recent-fallback recent-fallback-icon">
        <span class="recent-fallback-glyph">${item.format === "mp4" ? "MP4" : "MP3"}</span>
      </div>
    </div>
  `;
}

function renderLastConversion(item) {
  const container = document.querySelector("#profile-last-conversion");
  if (!item) {
    container.innerHTML = "No conversions yet.";
    return;
  }

  const title = item.title || "Conversion sin titulo";
  const subtitle = item.subtitle || item.sourceLabel || item.format?.toUpperCase() || "Conversion";
  container.innerHTML = `
    <article class="profile-last-card">
      ${renderHistoryVisual(item)}
      <div class="profile-last-body">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
        <small>${escapeHtml(formatDate(item.createdAt || item.completedAt || item.updatedAt))}</small>
      </div>
    </article>
  `;
}

function renderProfileHistory(items) {
  const container = document.querySelector("#profile-history-list");
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<div class="empty-copy">No conversions yet.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const username = item.username || item.user || "anonymous";
      const subscription = item.subscription || {};
      return `
        <article class="history-conversion-card">
          ${renderHistoryVisual(item)}
          <div class="history-conversion-body">
            <div class="recent-meta-row">
              <span class="recent-badge">${escapeHtml((item.format || "mp3").toUpperCase())}</span>
              <span class="recent-user">
                ${renderUsername(username, subscription)}
              </span>
            </div>
            <h3>${escapeHtml(item.title || "Conversion sin titulo")}</h3>
            <p>${escapeHtml(item.subtitle || item.sourceLabel || "Archivo convertido")}</p>
            <small>${escapeHtml(formatDate(item.createdAt || item.completedAt || item.updatedAt))}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

async function boot() {
  const requestedUser = getRequestedUser();
  const session = await fetchJson("/api/auth/session");
  const isForeignProfile = requestedUser && requestedUser !== session.user;
  let profileData;
  let history;

  if (isForeignProfile) {
    history = await fetchJson(`/api/history?user=${encodeURIComponent(requestedUser)}`);
    profileData = history;
  } else {
    [profileData, history] = await Promise.all([fetchJson("/api/me"), fetchJson("/api/my-history")]);
  }

  const userProfile = (isForeignProfile ? history.profile : profileData.profile) || {};
  const subscription = userProfile.subscription;
  const username = (isForeignProfile ? history.user : session.user || profileData.user) || "-";
  const conversions = Array.isArray(history.conversions) ? history.conversions : [];
  const titleNode = document.querySelector("#profile-title");
  const subscribeLink = document.querySelector("#profile-subscribe-link");

  document.querySelector("#profile-user").innerHTML = renderUsername(username, subscription);
  document.querySelector("#profile-user").style.color = getSubscriptionDisplayColor(subscription) || "";
  setProfilePlan(userProfile.planId || "free", subscription?.name || "Free");
  document.querySelector("#profile-conversions").textContent = String(isForeignProfile ? conversions.length : profileData.stats?.conversions || 0);
  renderAvatar(userProfile.avatarDataUrl || "");
  renderLastConversion(conversions[0] || null);
  renderProfileHistory(conversions);

  if (titleNode && isForeignProfile) {
    titleNode.textContent = `${username}'s profile`;
  } else if (titleNode) {
    titleNode.textContent = "Your account";
  }

  if (subscribeLink) {
    subscribeLink.classList.toggle("is-hidden", isForeignProfile || isAnonymousUsername(session.user));
  }

  if (isForeignProfile) {
    document.querySelector("#avatar-input").disabled = true;
    document.querySelector(".avatar-wrap")?.classList.add("is-readonly");
  }
}

avatarEditorElements.zoom?.addEventListener("input", (event) => {
  avatarEditorState.zoom = Number(event.target.value) / 100;
  updateAvatarPreview();
});
avatarEditorElements.offsetX?.addEventListener("input", (event) => {
  avatarEditorState.offsetX = Number(event.target.value);
  updateAvatarPreview();
});
avatarEditorElements.offsetY?.addEventListener("input", (event) => {
  avatarEditorState.offsetY = Number(event.target.value);
  updateAvatarPreview();
});
avatarEditorElements.close?.addEventListener("click", closeAvatarEditor);
avatarEditorElements.save?.addEventListener("click", async () => {
  if (!avatarEditorState.image) {
    return;
  }

  try {
    avatarEditorElements.save.disabled = true;
    setAvatarEditorStatus("Guardando foto...");
    const updatedProfile = await saveAvatarDataUrl(buildAvatarDataUrl());
    renderAvatar(updatedProfile.avatarDataUrl || "");
    closeAvatarEditor();
  } catch (error) {
    setAvatarEditorStatus(error.message, "error");
  } finally {
    avatarEditorElements.save.disabled = false;
  }
});
document.querySelector("#avatar-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    document.querySelector("#profile-last-conversion").textContent = "You can only upload images.";
    return;
  }

  try {
    await prepareAvatarEditor(file);
  } catch (error) {
    document.querySelector("#profile-last-conversion").textContent = error.message;
  } finally {
    event.target.value = "";
  }
});

boot().catch((error) => {
  document.querySelector("#profile-last-conversion").textContent = error.message;
});

wireUserSearch();
