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

function getSupportDisplayColor(subscription) {
  if (!subscription) {
    return "#f0dfad";
  }

  return subscription.id === "free" ? "#74d99f" : subscription.color || "#f0dfad";
}

function renderUsername(username, subscription) {
  const safeUsername = escapeHtml(username);
  if (subscription?.id && subscription.id !== "free") {
    return `<span class="username-crown" aria-hidden="true">&#9812;</span><span>${safeUsername}</span>`;
  }

  return safeUsername;
}

function setSupportStatus(message, tone = "") {
  const status = document.querySelector("#subscribe-status");
  if (!status) {
    return;
  }

  status.textContent = message || "";
  status.className = `status subscribe-status${tone ? ` ${tone}` : ""}`;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/";
}

const PLAN_DETAILS = {
  free: {
    headline: "The starting point for any account.",
    features: ["Base color", "Visible profile", "Full app access"],
    cta: "Current tier",
  },
  pro: {
    headline: "A light support tier with a more visible profile style.",
    features: ["Golden color", "Support badge", "Manual tier upgrade"],
    cta: "Support as Rising",
  },
  elite: {
    headline: "A bigger support tier for a more noticeable account style.",
    features: ["Sky blue color", "Premium badge", "Manual tier upgrade"],
    cta: "Support as Standout",
  },
  legend: {
    headline: "The top support tier for your visual profile identity.",
    features: ["Rose color", "Top-tier badge", "Manual tier upgrade"],
    cta: "Support as Icon",
  },
};

function renderPlans(items, currentPlanId, session, supportLinks) {
  const plansGrid = document.querySelector("#plans-grid");
  plansGrid.innerHTML = items
    .filter((plan) => plan.id !== "free")
    .map((plan) => {
      const isCurrent = plan.id === currentPlanId;
      const needsLogin = !session || session.guest;
      const externalLink = supportLinks?.[plan.id] || "";
      const buttonLabel = isCurrent
        ? "Current tier"
        : needsLogin
          ? "Sign in to support"
          : externalLink
            ? escapeHtml(PLAN_DETAILS[plan.id]?.cta || `Support as ${plan.name}`)
            : "Link not set";

      return `
        <article class="plan-card ${isCurrent ? "is-current" : ""}" style="--plan-color:${escapeHtml(plan.color)}; --plan-accent:${escapeHtml(plan.accent)}">
          <div class="plan-head">
            <div>
              <h2>${escapeHtml(plan.name)}</h2>
              <p class="plan-headline">${escapeHtml(PLAN_DETAILS[plan.id]?.headline || plan.subtitle)}</p>
            </div>
            <div class="plan-lifetime" aria-hidden="true">Lifetime</div>
          </div>
          <div class="plan-price-row">
            <span class="plan-price">${escapeHtml(plan.price)}</span>
            <span class="plan-unit">suggested support</span>
          </div>
          <div class="plan-preview" style="color:${escapeHtml(getSupportDisplayColor(plan))}">${renderUsername("username", plan)}</div>
          <ul class="plan-features">
            ${(PLAN_DETAILS[plan.id]?.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
          </ul>
          <button class="primary-button plan-select" data-plan-id="${escapeHtml(plan.id)}" data-support-link="${escapeHtml(externalLink)}" ${isCurrent || needsLogin ? "disabled" : ""}>${buttonLabel}</button>
        </article>
      `;
    })
    .join("");
}

async function boot() {
  const [session, profile, plans, supportConfig] = await Promise.all([
    fetchJson("/api/auth/session"),
    fetchJson("/api/subscription/me"),
    fetchJson("/api/subscription/plans"),
    fetchJson("/api/support-links"),
  ]);

  document.querySelector("#subscribe-current").innerHTML = `
    <span class="subscribe-current-label">Your support tier</span>
    <span class="plan-pill" style="--plan-accent:${escapeHtml(profile.subscription?.accent || "rgba(217, 195, 154, 0.18)")}; --plan-color:${escapeHtml(profile.subscription?.color || "#d9c39a")}">
      ${escapeHtml(profile.subscription?.name || "Newbie")}
    </span>
  `;

  renderPlans(plans.items || [], profile.planId || "free", session, supportConfig.links || {});

  if (session.guest) {
    setSupportStatus("Sign in with a real account if you want a manual support tier.");
  } else {
    setSupportStatus("Support is handled manually for now. Once a payment is confirmed outside the app, the matching tier can be assigned manually.");
  }

  document.querySelectorAll(".plan-select").forEach((button) => {
    button.addEventListener("click", () => {
      const planId = button.dataset.planId;
      const supportLink = button.dataset.supportLink || "";
      const selectedPlan = plans.items?.find((plan) => plan.id === planId);
      const tierName = selectedPlan?.name || planId;
      if (!supportLink) {
        setSupportStatus(`The Ko-fi link for ${tierName} is not configured yet. Add it in the server .env first.`, "error");
        return;
      }

      setSupportStatus(`Opening the external support page for ${tierName}. Once the payment arrives, that account can be upgraded manually.`, "success");
      window.open(supportLink, "_blank", "noopener,noreferrer");
    });
  });
}

document.querySelector("#subscribe-logout").addEventListener("click", logout);
boot().catch((error) => {
  document.querySelector("#subscribe-current").textContent = error.message;
});
