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

function getSubscriptionDisplayColor(subscription) {
  if (!subscription) {
    return "#f0dfad";
  }

  return subscription.id === "free" ? "#74d99f" : subscription.color || "#f0dfad";
}

function renderUsername(username, subscription) {
  const safeUsername = escapeHtml(username);
  if (subscription?.id && subscription.id !== "free") {
    return `<span class="username-crown" aria-hidden="true">♔</span><span>${safeUsername}</span>`;
  }

  return safeUsername;
}

function setSubscribeStatus(message, tone = "") {
  const status = document.querySelector("#subscribe-status");
  if (!status) {
    return;
  }

  status.textContent = message || "";
  status.className = `status subscribe-status${tone ? ` ${tone}` : ""}`;
}

let paddleInitializedToken = "";

function ensurePaddleCheckout(config) {
  if (!window.Paddle) {
    throw new Error("Paddle.js did not load.");
  }

  if (config.environment === "sandbox" && window.Paddle.Environment?.set) {
    window.Paddle.Environment.set("sandbox");
  }

  if (paddleInitializedToken !== config.clientToken) {
    window.Paddle.Initialize({ token: config.clientToken });
    paddleInitializedToken = config.clientToken;
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/";
}

const PLAN_DETAILS = {
  free: {
    headline: "The starting point for any account.",
    features: ["Base color", "Visible profile", "Full app access"],
    cta: "Current plan",
  },
  pro: {
    headline: "A step above Newbie with a more visible look.",
    features: ["Golden color", "Soft star", "Stronger visual tier"],
    cta: "Get Rising",
  },
  elite: {
    headline: "More presence so your account stands out better.",
    features: ["Sky blue color", "Premium badge", "Clearer visual presence"],
    cta: "Get Standout",
  },
  legend: {
    headline: "The highest tier for your profile identity.",
    features: ["Rose color", "Top-tier badge", "Stronger presence in profile and Recent"],
    cta: "Get Icon",
  },
};

const PLAN_ORDER = ["free", "pro", "elite", "legend"];

function getPlanRank(planId) {
  const rank = PLAN_ORDER.indexOf(planId);
  return rank === -1 ? 0 : rank;
}

function renderPlans(items, currentPlanId, session) {
  const currentRank = getPlanRank(currentPlanId);
  const plansGrid = document.querySelector("#plans-grid");
  plansGrid.innerHTML = items
    .filter((plan) => plan.id !== "free")
    .map((plan) => {
      const planRank = getPlanRank(plan.id);
      const isCurrent = plan.id === currentPlanId;
      const isLocked = planRank < currentRank;
      const needsLogin = !session || session.guest;
      const checkoutUnavailable = !plan.checkoutEnabled;
      const buttonLabel = isCurrent
        ? "Current plan"
        : isLocked
          ? "Locked"
          : needsLogin
            ? "Sign in required"
            : checkoutUnavailable
              ? "Unavailable"
              : escapeHtml(PLAN_DETAILS[plan.id]?.cta || `Choose ${plan.name}`);
      return `
        <article class="plan-card ${isCurrent ? "is-current" : ""} ${isLocked ? "is-locked" : ""}" style="--plan-color:${escapeHtml(plan.color)}; --plan-accent:${escapeHtml(plan.accent)}">
          <div class="plan-head">
            <div>
              <h2>${escapeHtml(plan.name)}</h2>
              <p class="plan-headline">${escapeHtml(PLAN_DETAILS[plan.id]?.headline || plan.subtitle)}</p>
            </div>
            <div class="plan-lifetime" aria-hidden="true">Lifetime</div>
          </div>
          <div class="plan-price-row">
            <span class="plan-price">${escapeHtml(plan.price)}</span>
            <span class="plan-unit">one-time payment</span>
          </div>
          <div class="plan-preview" style="color:${escapeHtml(getSubscriptionDisplayColor(plan))}">${renderUsername("username", plan)}</div>
          <ul class="plan-features">
            ${(PLAN_DETAILS[plan.id]?.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
          </ul>
          <button class="primary-button plan-select" data-plan-id="${escapeHtml(plan.id)}" ${isCurrent || isLocked || needsLogin || checkoutUnavailable ? "disabled" : ""}>${buttonLabel}</button>
        </article>
      `;
    })
    .join("");
}

async function boot() {
  const [session, profile, plans] = await Promise.all([
    fetchJson("/api/auth/session"),
    fetchJson("/api/subscription/me"),
    fetchJson("/api/subscription/plans"),
  ]);

  document.querySelector("#subscribe-current").innerHTML = `
    <span class="subscribe-current-label">Your subscription</span>
    <span class="plan-pill" style="--plan-accent:${escapeHtml(profile.subscription?.accent || "rgba(217, 195, 154, 0.18)")}; --plan-color:${escapeHtml(profile.subscription?.color || "#d9c39a")}">
      ${escapeHtml(profile.subscription?.name || "Newbie")}
    </span>
  `;

  renderPlans(plans.items || [], profile.planId || "free", session);

  const checkoutState = new URLSearchParams(window.location.search).get("checkout");
  if (checkoutState === "success") {
    setSubscribeStatus("Payment received. Your plan should update in a few seconds.");
  } else if (checkoutState === "cancel") {
    setSubscribeStatus("Checkout was canceled.");
  } else if (session.guest) {
    setSubscribeStatus("Sign in with a real account to purchase a plan.");
  } else {
    setSubscribeStatus("");
  }

  document.querySelectorAll(".plan-select").forEach((button) => {
    button.addEventListener("click", async () => {
      const planId = button.dataset.planId;
      const originalLabel = button.textContent;
      try {
        button.disabled = true;
        button.textContent = "Redirecting...";
        const checkout = await fetchJson("/api/subscription/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        });
        if (!checkout?.transactionId || !checkout?.clientToken) {
          throw new Error("Could not start Paddle checkout.");
        }
        ensurePaddleCheckout(checkout);
        window.Paddle.Checkout.open({
          transactionId: checkout.transactionId,
          customer: checkout.customer?.email ? { email: checkout.customer.email } : undefined,
        });
      } catch (error) {
        button.disabled = false;
        button.textContent = originalLabel;
        setSubscribeStatus(error.message);
      }
    });
  });
}

document.querySelector("#subscribe-logout").addEventListener("click", logout);
boot().catch((error) => {
  document.querySelector("#subscribe-current").textContent = error.message;
});
