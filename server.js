const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { randomUUID, randomBytes, timingSafeEqual, scryptSync } = require("crypto");
const { execFile } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const multer = require("multer");
const { Paddle, Environment, EventName } = require("@paddle/paddle-node-sdk");
const youtubedlFactory = require("youtube-dl-exec");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3020;
const recentConversions = [];
const extractorEvents = [];
const geoIpCache = {};
const savedProjects = [];
const DATA_DIR = path.join(__dirname, "data");
const RECENT_FILE = path.join(DATA_DIR, "recent-conversions.json");
const EXTRACTOR_EVENTS_FILE = path.join(DATA_DIR, "extractor-events.json");
const GEOIP_CACHE_FILE = path.join(DATA_DIR, "geoip-cache.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const AUTH_ACCOUNTS_FILE = path.join(DATA_DIR, "auth-accounts.json");
const AUTH_SESSIONS_FILE = path.join(DATA_DIR, "auth-sessions.json");
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
const YTDLP_PROXY = String(process.env.YTDLP_PROXY || "").trim();
const YTDLP_PROXY_FALLBACKS = String(process.env.YTDLP_PROXY_FALLBACKS || "")
  .split(/[\r\n,]+/)
  .map((item) => item.trim())
  .filter(Boolean);
const youtubedl = YTDLP_BINARY ? youtubedlFactory.create(YTDLP_BINARY) : youtubedlFactory;
const RECENT_LIMIT = Number.parseInt(process.env.RECENT_LIMIT || "60", 10);
const RECENT_RETENTION_DAYS = Number.parseInt(process.env.RECENT_RETENTION_DAYS || "30", 10);
const RECENT_RESPONSE_DEFAULT = Number.parseInt(process.env.RECENT_RESPONSE_DEFAULT || "12", 10);
const EXTRACTOR_EVENT_LIMIT = Number.parseInt(process.env.EXTRACTOR_EVENT_LIMIT || "200", 10);
const EXTRACTOR_EVENT_RETENTION_DAYS = Number.parseInt(process.env.EXTRACTOR_EVENT_RETENTION_DAYS || "30", 10);
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const TELEGRAM_NOTIFICATIONS_ENABLED = String(process.env.TELEGRAM_NOTIFICATIONS_ENABLED || "false").trim() === "true";
const CPU_ALERT_THRESHOLD_PERCENT = Number.parseFloat(process.env.CPU_ALERT_THRESHOLD_PERCENT || "50");
const CPU_ALERT_SUSTAINED_MINUTES = Number.parseInt(process.env.CPU_ALERT_SUSTAINED_MINUTES || "3", 10);
const CPU_SAMPLE_INTERVAL_MS = Number.parseInt(process.env.CPU_SAMPLE_INTERVAL_MS || "60000", 10);
const CPU_ALERT_COOLDOWN_MS = Number.parseInt(process.env.CPU_ALERT_COOLDOWN_MS || "1800000", 10);
const APP_LOGIN_USER = String(process.env.APP_LOGIN_USER || "").trim();
const APP_LOGIN_PASSWORD = String(process.env.APP_LOGIN_PASSWORD || "").trim();
const APP_SESSION_COOKIE_NAME = String(process.env.APP_SESSION_COOKIE_NAME || "gtube_session").trim();
const APP_SESSION_TTL_HOURS = Number.parseInt(process.env.APP_SESSION_TTL_HOURS || "168", 10);
const APP_SESSION_TTL_MS =
  (Number.isFinite(APP_SESSION_TTL_HOURS) && APP_SESSION_TTL_HOURS > 0 ? APP_SESSION_TTL_HOURS : 168) * 60 * 60 * 1000;
const AUTH_RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10);
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || "8", 10);
const AUTH_REGISTER_RATE_LIMIT_MAX_ATTEMPTS = Number.parseInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX_ATTEMPTS || "5", 10);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_CALLBACK_URL = String(process.env.GOOGLE_CALLBACK_URL || "").trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
const SUPPORT_LINKS = {
  pro: String(process.env.KOFI_LINK_RISING || "").trim(),
  elite: String(process.env.KOFI_LINK_STANDOUT || "").trim(),
  legend: String(process.env.KOFI_LINK_ICON || "").trim(),
};
const PADDLE_API_KEY = String(process.env.PADDLE_API_KEY || "").trim();
const PADDLE_CLIENT_TOKEN = String(process.env.PADDLE_CLIENT_TOKEN || "").trim();
const PADDLE_WEBHOOK_SECRET = String(process.env.PADDLE_WEBHOOK_SECRET || "").trim();
const PADDLE_ENV = String(process.env.PADDLE_ENV || "sandbox").trim().toLowerCase();
const PADDLE_PRICE_RISING = String(process.env.PADDLE_PRICE_RISING || "").trim();
const PADDLE_PRICE_STANDOUT = String(process.env.PADDLE_PRICE_STANDOUT || "").trim();
const PADDLE_PRICE_ICON = String(process.env.PADDLE_PRICE_ICON || "").trim();
const ALLOW_MANUAL_PLAN_OVERRIDE = String(process.env.ALLOW_MANUAL_PLAN_OVERRIDE || "false").trim() === "true";
const authSessions = new Map();
const authAccounts = {};
const authOauthStates = new Map();
const authRateLimits = new Map();
const userProfiles = {};
const GUEST_USERNAME = "anonymous";
const paddle = PADDLE_API_KEY
  ? new Paddle(PADDLE_API_KEY, {
      environment: PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
    })
  : null;
const PADDLE_PLAN_PRICE_IDS = {
  pro: PADDLE_PRICE_RISING,
  elite: PADDLE_PRICE_STANDOUT,
  legend: PADDLE_PRICE_ICON,
};
const PRODUCTION_PLAN_OVERRIDES =
  process.env.NODE_ENV === "production"
    ? {
        giako: "legend",
      }
    : {};

const SUBSCRIPTION_PLANS = {
  free: {
    id: "free",
    name: "Newbie",
    price: "Free",
    subtitle: "Base access and starter style for your account.",
    color: "#d9c39a",
    accent: "rgba(217, 195, 154, 0.18)",
    badge: "",
  },
  pro: {
    id: "pro",
    name: "Rising",
    price: "$1",
    subtitle: "Un poco mas de presencia que Newbie.",
    color: "#ffd166",
    accent: "rgba(255, 209, 102, 0.18)",
    badge: "★",
  },
  elite: {
    id: "elite",
    name: "Standout",
    price: "$10",
    subtitle: "Mas presencia visual y mejor insignia.",
    color: "#69c8ff",
    accent: "rgba(105, 200, 255, 0.2)",
    badge: "✦",
  },
  legend: {
    id: "legend",
    name: "Icon",
    price: "$10",
    subtitle: "La presencia mas alta entre todos los planes.",
    color: "#ff8ab3",
    accent: "rgba(255, 138, 179, 0.2)",
    badge: "✶",
  },
};

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

const monitoringState = {
  cpu: {
    currentPercent: null,
    lastSampleAt: null,
    aboveThresholdStreak: 0,
    lastAlertAt: 0,
  },
};

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
app.post("/api/paddle/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!paddle || !PADDLE_WEBHOOK_SECRET) {
    return res.status(503).send("Paddle webhook is not configured.");
  }

  const signature = String(req.headers["paddle-signature"] || "");
  const rawRequestBody = Buffer.isBuffer(req.body) ? req.body.toString() : String(req.body || "");
  if (!signature || !rawRequestBody) {
    return res.status(400).send("Missing Paddle webhook signature.");
  }

  try {
    const event = await paddle.webhooks.unmarshal(rawRequestBody, PADDLE_WEBHOOK_SECRET, signature);
    if (event.eventType === EventName.TransactionCompleted || event.eventType === EventName.TransactionPaid) {
      const username = sanitizeUsernameParam(event.data.customData?.username);
      const planId = typeof event.data.customData?.planId === "string" ? event.data.customData.planId.trim() : "";

      if (username && PADDLE_PLAN_PRICE_IDS[planId]) {
        const currentProfile = getUserProfile(username);
        if (getPlanRank(planId) > getPlanRank(currentProfile.planId)) {
          setUserPlan(username, planId);
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
});
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = decodeURIComponent(chunk.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(chunk.slice(separatorIndex + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function buildSessionCookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, maxAgeSeconds)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", buildSessionCookie("", 0));
}

function pruneAuthSessions() {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of authSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      authSessions.delete(token);
      changed = true;
    }
  }
  if (changed) {
    persistAuthSessions();
  }
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasGoogleAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function createPasswordHash(password, salt) {
  return scryptSync(String(password || ""), salt, 64).toString("hex");
}

function verifyPassword(password, salt, passwordHash) {
  const derived = Buffer.from(createPasswordHash(password, salt), "hex");
  const stored = Buffer.from(String(passwordHash || ""), "hex");
  return derived.length === stored.length && timingSafeEqual(derived, stored);
}

function toAccountPublic(account) {
  if (!account) {
    return null;
  }

  return {
    username: account.username,
    email: account.email || "",
    provider: account.provider || "local",
    needsUsernameSetup: Boolean(account.needsUsernameSetup),
    createdAt: account.createdAt || "",
    updatedAt: account.updatedAt || "",
  };
}

function loadAuthAccounts() {
  try {
    if (!existsSync(AUTH_ACCOUNTS_FILE)) {
      return;
    }

    const raw = readFileSync(AUTH_ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.assign(authAccounts, parsed);
    }
  } catch (_error) {
    for (const key of Object.keys(authAccounts)) {
      delete authAccounts[key];
    }
  }
}

function persistAuthAccounts() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(AUTH_ACCOUNTS_FILE, JSON.stringify(authAccounts, null, 2), "utf8");
}

function loadAuthSessions() {
  try {
    if (!existsSync(AUTH_SESSIONS_FILE)) {
      return;
    }

    const raw = readFileSync(AUTH_SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    const now = Date.now();
    for (const [token, session] of Object.entries(parsed)) {
      if (!token || !session || typeof session !== "object") {
        continue;
      }

      const expiresAt = Number(session.expiresAt || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        continue;
      }

      authSessions.set(token, {
        username: sanitizeUsernameParam(session.username) || GUEST_USERNAME,
        provider: String(session.provider || "guest"),
        email: normalizeEmail(session.email),
        guest: session.guest !== false,
        expiresAt,
      });
    }
  } catch (_error) {
    authSessions.clear();
  }
}

function persistAuthSessions() {
  mkdirSync(DATA_DIR, { recursive: true });
  const serializable = {};
  for (const [token, session] of authSessions.entries()) {
    if (!session || session.expiresAt <= Date.now()) {
      continue;
    }

    serializable[token] = {
      username: session.username,
      provider: session.provider,
      email: session.email || "",
      guest: session.guest !== false,
      expiresAt: session.expiresAt,
    };
  }
  writeFileSync(AUTH_SESSIONS_FILE, JSON.stringify(serializable, null, 2), "utf8");
}

function getAuthRateLimitKey(req, scope = "auth") {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const remoteAddress = String(req.ip || req.socket?.remoteAddress || forwarded || "unknown").trim();
  return `${scope}:${forwarded || remoteAddress || "unknown"}`;
}

function registerAuthAttempt(req, scope, maxAttempts) {
  const safeMaxAttempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : AUTH_RATE_LIMIT_MAX_ATTEMPTS;
  const key = getAuthRateLimitKey(req, scope);
  const now = Date.now();
  const windowMs = Number.isFinite(AUTH_RATE_LIMIT_WINDOW_MS) && AUTH_RATE_LIMIT_WINDOW_MS > 0 ? AUTH_RATE_LIMIT_WINDOW_MS : 15 * 60 * 1000;
  const existing = authRateLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    authRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { blocked: false, remaining: safeMaxAttempts - 1 };
  }

  existing.count += 1;
  authRateLimits.set(key, existing);
  return {
    blocked: existing.count > safeMaxAttempts,
    retryAfterMs: Math.max(existing.resetAt - now, 0),
    remaining: Math.max(safeMaxAttempts - existing.count, 0),
  };
}

function clearAuthRateLimit(req, scope) {
  authRateLimits.delete(getAuthRateLimitKey(req, scope));
}

function getAccountByUsername(username) {
  const safeUsername = sanitizeUsernameParam(username);
  return safeUsername ? authAccounts[safeUsername] || null : null;
}

function hasUsernameConflict(username, excludeUsername = "") {
  const safeUsername = sanitizeUsernameParam(username);
  const safeExclude = sanitizeUsernameParam(excludeUsername);
  if (!safeUsername) {
    return false;
  }

  const target = safeUsername.toLowerCase();
  return Object.keys(authAccounts).some((existingUsername) => {
    const normalizedExisting = sanitizeUsernameParam(existingUsername);
    if (!normalizedExisting) {
      return false;
    }

    if (safeExclude && normalizedExisting.toLowerCase() === safeExclude.toLowerCase()) {
      return false;
    }

    return normalizedExisting.toLowerCase() === target;
  });
}

function getAccountByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  return Object.values(authAccounts).find((account) => normalizeEmail(account.email) === normalizedEmail) || null;
}

function createUniqueUsername(baseValue) {
  const safeBase = sanitizeUsernameParam(baseValue) || "creator";
  if (!hasUsernameConflict(safeBase)) {
    return safeBase;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = sanitizeUsernameParam(`${safeBase}${index}`);
    if (candidate && !hasUsernameConflict(candidate)) {
      return candidate;
    }
  }

  return `${safeBase}-${randomBytes(3).toString("hex")}`;
}

function createLocalAccount({ username, email, password }) {
  const safeUsername = sanitizeUsernameParam(username);
  const normalizedEmail = normalizeEmail(email);
  if (!safeUsername || safeUsername.length < 3) {
    throw new Error("Username must contain at least 3 valid characters.");
  }

  if (safeEqualStrings(safeUsername, GUEST_USERNAME)) {
    throw new Error("That username is reserved.");
  }

  if (hasUsernameConflict(safeUsername)) {
    throw new Error("That username already exists.");
  }

  if (normalizedEmail && getAccountByEmail(normalizedEmail)) {
    throw new Error("That email is already in use.");
  }

  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const salt = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  authAccounts[safeUsername] = {
    username: safeUsername,
    email: normalizedEmail,
    provider: "local",
    passwordSalt: salt,
    passwordHash: createPasswordHash(password, salt),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: "",
  };
  persistAuthAccounts();
  ensureUserProfile(safeUsername);
  return toAccountPublic(authAccounts[safeUsername]);
}

function ensureGoogleAccount({ email, googleId, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  let account = getAccountByEmail(normalizedEmail);
  const now = new Date().toISOString();

  if (!account) {
    const baseUsername = sanitizeUsernameParam(displayName) || sanitizeUsernameParam(normalizedEmail.split("@")[0]) || "creator";
    const username = createUniqueUsername(baseUsername);
    authAccounts[username] = {
      username,
      email: normalizedEmail,
      provider: "google",
      googleId: String(googleId || ""),
      needsUsernameSetup: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    persistAuthAccounts();
    ensureUserProfile(username);
    return authAccounts[username];
  }

  if (!account.provider) {
    account.provider = "google";
  }
  account.googleId = String(googleId || account.googleId || "");
  account.googleConnected = true;
  if (typeof account.needsUsernameSetup !== "boolean") {
    account.needsUsernameSetup = false;
  }
  account.updatedAt = now;
  account.lastLoginAt = now;
  persistAuthAccounts();
  ensureUserProfile(account.username);
  return account;
}

function authenticateLocalAccount(usernameOrEmail, password) {
  const normalized = String(usernameOrEmail || "").trim();
  const account = getAccountByUsername(normalized) || getAccountByEmail(normalized);
  if (!account || account.provider !== "local") {
    return null;
  }

  if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
    return null;
  }

  account.lastLoginAt = new Date().toISOString();
  account.updatedAt = account.lastLoginAt;
  persistAuthAccounts();
  return account;
}

function getAuthSession(req) {
  pruneAuthSessions();
  const token = parseCookies(req)[APP_SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const session = authSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }

  return session;
}

function createAuthSession(sessionInput) {
  pruneAuthSessions();
  const token = randomBytes(32).toString("hex");
  const username =
    typeof sessionInput === "string"
      ? sessionInput
      : sanitizeUsernameParam(sessionInput?.username) || GUEST_USERNAME;
  authSessions.set(token, {
    username,
    provider: typeof sessionInput === "string" ? "legacy" : sessionInput?.provider || "guest",
    email: typeof sessionInput === "string" ? "" : normalizeEmail(sessionInput?.email),
    guest: typeof sessionInput === "string" ? false : sessionInput?.guest !== false,
    expiresAt: Date.now() + APP_SESSION_TTL_MS,
  });
  persistAuthSessions();
  return token;
}

function destroyAuthSession(req) {
  const token = parseCookies(req)[APP_SESSION_COOKIE_NAME];
  if (token) {
    authSessions.delete(token);
    persistAuthSessions();
  }
}

function getRequestUsername(req) {
  return req?.authSession?.username || getAuthSession(req)?.username || GUEST_USERNAME;
}

function getEffectiveSession(req) {
  return getAuthSession(req) || {
    username: GUEST_USERNAME,
    provider: "guest",
    email: "",
    guest: true,
  };
}

function renameItemsOwner(items, previousUsername, nextUsername) {
  for (const item of items) {
    if (item?.username === previousUsername) {
      item.username = nextUsername;
    }
  }
}

function renameAccountUsername(currentUsername, requestedUsername, options = {}) {
  const previousUsername = sanitizeUsernameParam(currentUsername);
  const nextUsername = sanitizeUsernameParam(requestedUsername);
  if (!previousUsername || previousUsername === GUEST_USERNAME) {
    throw new Error("Solo una cuenta real puede cambiar su username.");
  }

  if (!nextUsername || nextUsername.length < 3) {
    throw new Error("Username must contain at least 3 valid characters.");
  }

  if (safeEqualStrings(nextUsername, GUEST_USERNAME)) {
    throw new Error("That username is reserved.");
  }

  if (previousUsername === nextUsername) {
    return getUserProfile(previousUsername);
  }

  if (hasUsernameConflict(nextUsername, previousUsername)) {
    throw new Error("That username is already in use.");
  }

  const account = authAccounts[previousUsername];
  if (!account) {
    throw new Error("Account not found.");
  }

  const allowRename = options.allowRename === true || (account.provider === "google" && account.needsUsernameSetup);
  if (!allowRename) {
    throw new Error("Username changes are not available for this account.");
  }

  delete authAccounts[previousUsername];
  account.username = nextUsername;
  account.updatedAt = new Date().toISOString();
  authAccounts[nextUsername] = account;
  persistAuthAccounts();

  if (userProfiles[previousUsername]) {
    const profile = userProfiles[previousUsername];
    delete userProfiles[previousUsername];
    profile.username = nextUsername;
    profile.updatedAt = new Date().toISOString();
    userProfiles[nextUsername] = profile;
    persistUserProfiles();
  } else {
    ensureUserProfile(nextUsername);
  }

  renameItemsOwner(recentConversions, previousUsername, nextUsername);
  persistRecentConversions();
  renameItemsOwner(extractorEvents, previousUsername, nextUsername);
  persistExtractorEvents();
  renameItemsOwner(savedProjects, previousUsername, nextUsername);
  persistProjects();

  for (const session of authSessions.values()) {
    if (session?.username === previousUsername) {
      session.username = nextUsername;
      session.guest = false;
    }
  }
  persistAuthSessions();

  return getUserProfile(nextUsername);
}

function completeGoogleUsernameSetup(currentUsername, requestedUsername) {
  const account = getAccountByUsername(currentUsername);
  if (!account || account.provider !== "google") {
    throw new Error("Solo aplica a cuentas de Google.");
  }

  const updatedProfile = renameAccountUsername(currentUsername, requestedUsername, { allowRename: true });
  const renamedAccount = getAccountByUsername(updatedProfile.username);
  renamedAccount.needsUsernameSetup = false;
  renamedAccount.updatedAt = new Date().toISOString();
  persistAuthAccounts();
  return {
    account: toAccountPublic(renamedAccount),
    profile: updatedProfile,
  };
}

function matchesUsername(item, username) {
  if (!username) {
    return true;
  }

  const itemUsername = sanitizeUsernameParam(item?.username);
  if (username === GUEST_USERNAME) {
    return !itemUsername || itemUsername === GUEST_USERNAME || itemUsername === "open-access";
  }

  return itemUsername === sanitizeUsernameParam(username);
}

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

function maskSecret(value) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || "";
}

function normalizeIp(value) {
  const ip = String(value || "").trim();
  if (!ip) {
    return "";
  }

  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function isPrivateIp(ip) {
  return (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
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

function loadExtractorEvents() {
  try {
    if (!existsSync(EXTRACTOR_EVENTS_FILE)) {
      return;
    }

    const raw = readFileSync(EXTRACTOR_EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      extractorEvents.push(...parsed);
      normalizeExtractorEvents();
      persistExtractorEvents();
    }
  } catch (_error) {
    extractorEvents.length = 0;
  }
}

function loadGeoIpCache() {
  try {
    if (!existsSync(GEOIP_CACHE_FILE)) {
      return;
    }

    const raw = readFileSync(GEOIP_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.assign(geoIpCache, parsed);
    }
  } catch (_error) {
    for (const key of Object.keys(geoIpCache)) {
      delete geoIpCache[key];
    }
  }
}

function persistRecentConversions() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RECENT_FILE, JSON.stringify(recentConversions, null, 2), "utf8");
}

function persistExtractorEvents() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(EXTRACTOR_EVENTS_FILE, JSON.stringify(extractorEvents, null, 2), "utf8");
}

function persistGeoIpCache() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(GEOIP_CACHE_FILE, JSON.stringify(geoIpCache, null, 2), "utf8");
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

function loadUserProfiles() {
  try {
    if (!existsSync(USERS_FILE)) {
      return;
    }

    const raw = readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.assign(userProfiles, parsed);
    }
  } catch (_error) {
    for (const key of Object.keys(userProfiles)) {
      delete userProfiles[key];
    }
  }
}

function persistUserProfiles() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(userProfiles, null, 2), "utf8");
}

function getSubscriptionPlan(planId) {
  return SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.free;
}

const PLAN_ORDER = ["free", "pro", "elite", "legend"];

function getPlanRank(planId) {
  const rank = PLAN_ORDER.indexOf(planId);
  return rank === -1 ? 0 : rank;
}

function isPaddleConfigured() {
  return Boolean(paddle && PADDLE_CLIENT_TOKEN && PADDLE_WEBHOOK_SECRET);
}

function isPaddlePlanReady(planId) {
  return Boolean(isPaddleConfigured() && PADDLE_PLAN_PRICE_IDS[planId]);
}

function getRequestBaseUrl(req) {
  if (APP_BASE_URL) {
    return APP_BASE_URL;
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function canUpgradeToPlan(currentPlanId, nextPlanId) {
  const currentRank = getPlanRank(currentPlanId);
  const nextRank = getPlanRank(nextPlanId);
  return nextRank > currentRank;
}

function ensureUserProfile(username) {
  const safeUsername = sanitizeUsernameParam(username) || "anonymous";
  if (!userProfiles[safeUsername]) {
    userProfiles[safeUsername] = {
      username: safeUsername,
      planId: "free",
      avatarDataUrl: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return userProfiles[safeUsername];
}

function getUserProfile(username) {
  const profile = ensureUserProfile(username);
  const overridePlanId = PRODUCTION_PLAN_OVERRIDES[String(profile.username || "").trim().toLowerCase()];
  const planId = SUBSCRIPTION_PLANS[overridePlanId] ? overridePlanId : profile.planId;
  return {
    ...profile,
    planId,
    subscription: getSubscriptionPlan(planId),
  };
}

function setUserPlan(username, planId) {
  const profile = ensureUserProfile(username);
  profile.planId = SUBSCRIPTION_PLANS[planId] ? planId : "free";
  profile.updatedAt = new Date().toISOString();
  persistUserProfiles();
  return getUserProfile(profile.username);
}

function setUserAvatar(username, avatarDataUrl) {
  const profile = ensureUserProfile(username);
  profile.avatarDataUrl = typeof avatarDataUrl === "string" ? avatarDataUrl : "";
  profile.updatedAt = new Date().toISOString();
  persistUserProfiles();
  return getUserProfile(profile.username);
}

function decorateWithUserProfile(item) {
  const username = item?.username || "anonymous";
  const profile = getUserProfile(username);
  return {
    ...item,
    username: profile.username,
    subscription: profile.subscription,
  };
}

function getPublicSearchableUsers() {
  const usernames = new Set([
    ...Object.keys(authAccounts),
    ...Object.keys(userProfiles),
  ]);

  return [...usernames]
    .map((username) => sanitizeUsernameParam(username))
    .filter(Boolean)
    .filter((username) => username !== GUEST_USERNAME && username !== "open-access")
    .filter((username) => !getAccountByUsername(username)?.needsUsernameSetup)
    .map((username) => {
      const profile = getUserProfile(username);
      const conversions = recentConversions.filter((item) => matchesUsername(item, username)).length;
      return {
        username,
        avatarDataUrl: profile.avatarDataUrl || "",
        subscription: profile.subscription,
        planId: profile.planId,
        conversions,
      };
    });
}

function searchUsers(query, limit = 8) {
  const normalizedQuery = sanitizeUsernameParam(String(query || "").toLowerCase());
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  return getPublicSearchableUsers()
    .filter((item) => item.username.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const leftUsername = left.username.toLowerCase();
      const rightUsername = right.username.toLowerCase();
      const leftExact = leftUsername === normalizedQuery ? 0 : leftUsername.startsWith(normalizedQuery) ? 1 : 2;
      const rightExact = rightUsername === normalizedQuery ? 0 : rightUsername.startsWith(normalizedQuery) ? 1 : 2;
      if (leftExact !== rightExact) {
        return leftExact - rightExact;
      }

      if (right.conversions !== left.conversions) {
        return right.conversions - left.conversions;
      }

      return left.username.localeCompare(right.username);
    })
    .slice(0, limit);
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

function pushExtractorEvent(entry) {
  extractorEvents.unshift({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  });

  normalizeExtractorEvents();
  persistExtractorEvents();
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

function normalizeExtractorEvents() {
  const now = Date.now();
  const retentionMs = Math.max(1, EXTRACTOR_EVENT_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const hardLimit = Math.max(1, EXTRACTOR_EVENT_LIMIT);

  const cleaned = extractorEvents
    .filter((item) => item && typeof item === "object")
    .filter((item) => typeof item.id === "string" && typeof item.createdAt === "string")
    .filter((item) => {
      const timestamp = Date.parse(item.createdAt);
      return Number.isFinite(timestamp) && now - timestamp <= retentionMs;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, hardLimit);

  extractorEvents.length = 0;
  extractorEvents.push(...cleaned);
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
    throw new Error(`Could not download the remote image (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, bytes);
}

async function fetchRemoteBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download the remote image (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { bytes, contentType };
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_NOTIFICATIONS_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return false;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Telegram notify failed (${response.status}): ${details}`);
  }

  return true;
}

async function resolveCountryFromIp(ip) {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || isPrivateIp(normalizedIp)) {
    return "";
  }

  if (geoIpCache[normalizedIp]) {
    return geoIpCache[normalizedIp];
  }

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`);
    if (!response.ok) {
      return "";
    }

    const payload = await response.json();
    const country = payload?.success === false ? "" : String(payload?.country || "").trim();
    if (country) {
      geoIpCache[normalizedIp] = country;
      persistGeoIpCache();
    }
    return country;
  } catch (_error) {
    return "";
  }
}

function buildExtractorNotification(event) {
  const parts = [
    "Uso del extractor detectado",
    `Tipo: ${event.outputType.toUpperCase()}`,
    `Plataforma: ${event.platform}`,
  ];

  if (event.qualityLabel) {
    parts.push(`Calidad: ${event.qualityLabel}`);
  }

  if (event.title) {
    parts.push(`Titulo: ${event.title}`);
  }

  if (event.url) {
    parts.push(`URL: ${event.url}`);
  }

  if (event.country) {
    parts.push(`Pais: ${event.country}`);
  }

  return parts.join("\n");
}

async function trackExtractorUsage(req, details) {
  const ip = getClientIp(req);
  const event = {
    username: getRequestUsername(req),
    route: details.route,
    platform: details.platform,
    outputType: details.outputType,
    qualityLabel: details.qualityLabel || "",
    title: details.title || "",
    url: details.url || "",
    ip,
    country: await resolveCountryFromIp(ip),
    userAgent: String(req.headers["user-agent"] || ""),
  };

  pushExtractorEvent(event);
  void sendTelegramMessage(buildExtractorNotification(event)).catch((error) => {
    console.error("No se pudo enviar la notificacion de extractor:", error.message);
  });
}

function getCpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }

  return { idle, total };
}

async function sampleCpuUsage() {
  const start = getCpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const end = getCpuSnapshot();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;

  if (totalDiff <= 0) {
    return null;
  }

  return Number(((1 - idleDiff / totalDiff) * 100).toFixed(1));
}

async function evaluateCpuAlert() {
  const cpuPercent = await sampleCpuUsage();
  monitoringState.cpu.currentPercent = cpuPercent;
  monitoringState.cpu.lastSampleAt = new Date().toISOString();

  if (!Number.isFinite(cpuPercent)) {
    return;
  }

  if (cpuPercent >= CPU_ALERT_THRESHOLD_PERCENT) {
    monitoringState.cpu.aboveThresholdStreak += 1;
  } else {
    monitoringState.cpu.aboveThresholdStreak = 0;
    return;
  }

  const sustainedSamples = Math.max(1, CPU_ALERT_SUSTAINED_MINUTES);
  const cooldownPassed = Date.now() - monitoringState.cpu.lastAlertAt >= Math.max(60000, CPU_ALERT_COOLDOWN_MS);

  if (monitoringState.cpu.aboveThresholdStreak < sustainedSamples || !cooldownPassed) {
    return;
  }

  monitoringState.cpu.lastAlertAt = Date.now();

  const text = [
    "Alerta de servidor",
    `CPU por encima de ${CPU_ALERT_THRESHOLD_PERCENT}%`,
    `CPU actual: ${cpuPercent}%`,
    `Sostenido durante aprox. ${CPU_ALERT_SUSTAINED_MINUTES} minuto(s)`,
    `Load average: ${os.loadavg().map((value) => value.toFixed(2)).join(" / ")}`,
    `Memoria libre: ${Math.round(os.freemem() / 1024 / 1024)} MB`,
  ].join("\n");

  await sendTelegramMessage(text);
}

function startServerMonitoring() {
  void evaluateCpuAlert().catch((error) => {
    console.error("No se pudo evaluar la alerta de CPU:", error.message);
  });

  return setInterval(() => {
    void evaluateCpuAlert().catch((error) => {
      console.error("No se pudo evaluar la alerta de CPU:", error.message);
    });
  }, Math.max(30000, CPU_SAMPLE_INTERVAL_MS));
}

function buildHealthPayload() {
  return {
    ok: true,
    app: {
      name: "gtubeversor",
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development",
    },
    system: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      loadAverage: os.loadavg(),
      cpuPercent: monitoringState.cpu.currentPercent,
      cpuLastSampleAt: monitoringState.cpu.lastSampleAt,
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    },
    process: {
      pid: process.pid,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    extractor: {
      recentConversions: recentConversions.length,
      recentEvents: extractorEvents.length,
      lastEvent: extractorEvents[0] || null,
    },
    integrations: {
      ffmpegPath,
      ytdlpBinary: YTDLP_BINARY || "bundled",
      notifications: {
        enabled: TELEGRAM_NOTIFICATIONS_ENABLED,
        telegramChatId: TELEGRAM_CHAT_ID || "",
        telegramBotToken: TELEGRAM_BOT_TOKEN ? maskSecret(TELEGRAM_BOT_TOKEN) : "",
      },
    },
  };
}

function buildUserHistory(username) {
  const profile = getUserProfile(username);
  return {
    user: profile.username,
    profile,
    conversions: recentConversions.filter((item) => matchesUsername(item, username)).slice(0, 100).map(decorateWithUserProfile),
    extractorEvents: extractorEvents.filter((item) => matchesUsername(item, username)).slice(0, 100).map(decorateWithUserProfile),
    projects: savedProjects.filter((item) => matchesUsername(item, username)).slice(0, 100).map(decorateWithUserProfile),
  };
}

function sanitizeUsernameParam(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]/g, "")
    .slice(0, 64);
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
    throw new Error("Could not extract the pin image.");
  }

  const title =
    extractMetaContent(html, "og:title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "Pinterest";

  return { imageUrl, title };
}

async function getVideoInfo(url) {
  return runYtdlpWithFallback(
    url,
    {
      dumpSingleJson: true,
      skipDownload: true,
      format: "b",
    },
    { includeNoFormatFallback: true },
  );
}

function buildYtdlpOptions(extraOptions = {}, runtime = {}) {
  const withCookies = runtime.withCookies !== false;
  const withClient = runtime.withClient !== false;
  const withProxy = runtime.withProxy !== false;
  const proxyOverride = String(runtime.proxyOverride || "").trim();
  const clientOverride = String(runtime.clientOverride ?? "").trim();
  const chosenClient = clientOverride || YTDLP_CLIENT;
  const options = {
    ignoreConfig: true,
    noCheckCertificates: true,
    noWarnings: true,
    noPlaylist: true,
    geoBypass: true,
    userAgent: YTDLP_USER_AGENT,
    ...extraOptions,
  };

  if (withClient && chosenClient) {
    options.extractorArgs = [`youtube:player_client=${chosenClient}`];
  }

  if (withCookies && YTDLP_COOKIES_FILE) {
    options.cookies = YTDLP_COOKIES_FILE;
  }

  if (withProxy && (proxyOverride || YTDLP_PROXY)) {
    options.proxy = proxyOverride || YTDLP_PROXY;
  }

  return options;
}

function isRetryableYtdlpError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("sign in to confirm you're not a bot") ||
    text.includes("page needs to be reloaded") ||
    text.includes("requested format is not available") ||
    text.includes("only images are available") ||
    text.includes("signature extraction failed") ||
    text.includes("some formats may be missing") ||
    text.includes("video unavailable")
  );
}

function buildAttemptPlan(extraOptions = {}, behavior = {}) {
  const includeNoFormatFallback = behavior.includeNoFormatFallback === true;
  const includeCookielessFallback = behavior.includeCookielessFallback !== false;
  const includeNoProxyFallback = behavior.includeNoProxyFallback !== false;
  const attempts = [
    { withClient: true, withCookies: true },
    { withClient: false, withCookies: true },
  ];

  if (includeCookielessFallback) {
    attempts.push({ withClient: true, withCookies: false });
    attempts.push({ withClient: false, withCookies: false });
  }

  attempts.push({ withClient: true, withCookies: true, clientOverride: "web" });
  attempts.push({ withClient: true, withCookies: true, clientOverride: "ios" });
  attempts.push({ withClient: true, withCookies: true, clientOverride: "android" });

  if (includeNoFormatFallback && Object.prototype.hasOwnProperty.call(extraOptions, "format")) {
    attempts.push({ withClient: false, withCookies: true, dropFormat: true });
    if (includeCookielessFallback) {
      attempts.push({ withClient: false, withCookies: false, dropFormat: true });
    }
  }

  if (includeNoProxyFallback) {
    attempts.push({ withClient: true, withCookies: true, withProxy: false });
    attempts.push({ withClient: false, withCookies: true, withProxy: false });
    if (includeCookielessFallback) {
      attempts.push({ withClient: true, withCookies: false, withProxy: false });
      attempts.push({ withClient: false, withCookies: false, withProxy: false });
    }
    if (includeNoFormatFallback && Object.prototype.hasOwnProperty.call(extraOptions, "format")) {
      attempts.push({ withClient: false, withCookies: true, withProxy: false, dropFormat: true });
      if (includeCookielessFallback) {
        attempts.push({ withClient: false, withCookies: false, withProxy: false, dropFormat: true });
      }
    }
  }

  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = `${attempt.withClient}-${attempt.withCookies}-${attempt.withProxy !== false}-${attempt.clientOverride || ""}-${attempt.dropFormat ? "drop" : "keep"}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function runYtdlpWithFallback(url, extraOptions = {}, behavior = {}) {
  const proxyCandidates = [YTDLP_PROXY, ...YTDLP_PROXY_FALLBACKS].filter(Boolean);
  const proxyAttempts = buildAttemptPlan(extraOptions, { ...behavior, includeNoProxyFallback: false });
  const directAttempts = buildAttemptPlan(extraOptions, { ...behavior, includeNoProxyFallback: true }).filter(
    (attempt) => attempt.withProxy === false,
  );
  let lastError = null;

  if (proxyCandidates.length) {
    for (const proxy of proxyCandidates) {
      for (const attempt of proxyAttempts) {
        const mergedOptions = { ...extraOptions };
        if (attempt.dropFormat) {
          delete mergedOptions.format;
        }

        try {
          return await youtubedl(url, buildYtdlpOptions(mergedOptions, { ...attempt, withProxy: true, proxyOverride: proxy }));
        } catch (error) {
          lastError = error;
          if (!isRetryableYtdlpError(error?.message || error)) {
            throw error;
          }
        }
      }
    }
  }

  for (const attempt of directAttempts) {
    const mergedOptions = { ...extraOptions };
    if (attempt.dropFormat) {
      delete mergedOptions.format;
    }

    try {
      return await youtubedl(url, buildYtdlpOptions(mergedOptions, attempt));
    } catch (error) {
      lastError = error;
      if (!isRetryableYtdlpError(error?.message || error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Could not extract the link.");
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
    ? "Could not read the track. Make sure the link is public and valid."
    : "Could not read the video. Make sure the link is public and valid.";
}

function getAudioConvertError(source) {
  return source === "soundcloud" ? "Could not convert the track." : "Could not convert the video.";
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
    return res.status(400).json({ error: `Invalid ${getAudioSourceLabel(source)} URL.` });
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

    await runYtdlpWithFallback(
      url,
      {
        format: "bestaudio/best",
        ffmpegLocation: ffmpegPath,
        output: sourceTemplate,
      },
      { includeNoFormatFallback: true },
    );

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
      username: getRequestUsername(req),
      type: "mp3",
      title,
      subtitle: `${getAudioSourceLabel(source)} - ${selectedFormat.label} - ${selectedFormat.quality}`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: source === "soundcloud" ? "soundcloud" : "audio",
    });
    trackExtractorUsage(req, {
      route: req.path,
      platform: getAudioSourceLabel(source),
      outputType: "mp3",
      qualityLabel: `${selectedFormat.label} ${selectedFormat.quality}`,
      title,
      url,
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback || "audio.mp3"}"; filename*=UTF-8''${encodeURIComponent(targetName)}`,
    );

    return res.download(targetPath, targetName, async (error) => {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (error && !res.headersSent) {
        res.status(500).json({ error: "Could not deliver the final MP3." });
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
    return res.status(400).json({ error: "Invalid URL." });
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

    await runYtdlpWithFallback(
      url,
      {
        format: "bestaudio/best",
        ffmpegLocation: ffmpegPath,
        output: sourceTemplate,
      },
      { includeNoFormatFallback: true },
    );

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
      username: getRequestUsername(req),
      type: "mp3",
      title,
      subtitle: `${platform} - ${selectedFormat.label} - ${selectedFormat.quality}`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: platform.toLowerCase().includes("soundcloud") ? "soundcloud" : "audio",
    });
    trackExtractorUsage(req, {
      route: req.path,
      platform,
      outputType: "mp3",
      qualityLabel: `${selectedFormat.label} ${selectedFormat.quality}`,
      title,
      url,
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
      error: "Could not convert the link to MP3.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleVideoDownload(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid URL." });
  }

  const tempDir = path.join(os.tmpdir(), `gtubeversor-video-${randomUUID()}`);
  const outputTemplate = path.join(tempDir, "video.%(ext)s");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const details = await getVideoInfo(url);
    const title = sanitizeFilename(details.title || "video");
    const platform = detectPlatform(url, details);

    await runYtdlpWithFallback(
      url,
      {
        format: "bestvideo+bestaudio/best",
        mergeOutputFormat: "mp4",
        ffmpegLocation: ffmpegPath,
        output: outputTemplate,
      },
      { includeNoFormatFallback: true },
    );

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
      username: getRequestUsername(req),
      type: "mp4",
      title,
      subtitle: `${platform} - Video`,
      preview: details.thumbnails?.[details.thumbnails.length - 1]?.url || "",
      accent: "video",
    });
    trackExtractorUsage(req, {
      route: req.path,
      platform,
      outputType: "mp4",
      qualityLabel: "video",
      title,
      url,
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
      error: "Could not download the video.",
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

app.get("/api/auth/session", (req, res) => {
  const session = getEffectiveSession(req);
  const profile = getUserProfile(session.username);
  const account = session.guest ? null : toAccountPublic(getAccountByUsername(session.username));
  return res.json({
    authenticated: !session.guest,
    guest: Boolean(session.guest),
    required: false,
    user: session.username,
    provider: session.provider || "guest",
    email: session.email || "",
    googleEnabled: hasGoogleAuthConfigured(),
    account,
    needsUsernameSetup: Boolean(account?.needsUsernameSetup),
    profile,
  });
});

app.post("/api/auth/login", (req, res) => {
  const loginLimit = registerAuthAttempt(req, "login", AUTH_RATE_LIMIT_MAX_ATTEMPTS);
  if (loginLimit.blocked) {
    res.setHeader("Retry-After", String(Math.ceil((loginLimit.retryAfterMs || 0) / 1000)));
    return res.status(429).json({ error: "Too many login attempts. Try again in a few minutes." });
  }

  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  let account = authenticateLocalAccount(username, password);

  if (!account && APP_LOGIN_USER && APP_LOGIN_PASSWORD && safeEqualStrings(username, APP_LOGIN_USER) && safeEqualStrings(password, APP_LOGIN_PASSWORD)) {
    account = {
      username: APP_LOGIN_USER,
      email: "",
      provider: "legacy",
      guest: false,
    };
    ensureUserProfile(APP_LOGIN_USER);
  }

  if (!account) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  clearAuthRateLimit(req, "login");
  const token = createAuthSession({
    username: account.username,
    email: account.email || "",
    provider: account.provider || "local",
    guest: false,
  });
  res.setHeader("Set-Cookie", buildSessionCookie(token, Math.floor(APP_SESSION_TTL_MS / 1000)));
  return res.json({ ok: true, authenticated: true, required: false, user: account.username, provider: account.provider || "local" });
});

app.post("/api/auth/register", (req, res) => {
  const registerLimit = registerAuthAttempt(req, "register", AUTH_REGISTER_RATE_LIMIT_MAX_ATTEMPTS);
  if (registerLimit.blocked) {
    res.setHeader("Retry-After", String(Math.ceil((registerLimit.retryAfterMs || 0) / 1000)));
    return res.status(429).json({ error: "Too many registration attempts. Try again in a few minutes." });
  }

  try {
    const account = createLocalAccount({
      username: req.body?.username,
      email: req.body?.email,
      password: req.body?.password,
    });
    const token = createAuthSession({
      username: account.username,
      email: account.email || "",
      provider: "local",
      guest: false,
    });
    clearAuthRateLimit(req, "register");
    res.setHeader("Set-Cookie", buildSessionCookie(token, Math.floor(APP_SESSION_TTL_MS / 1000)));
    return res.status(201).json({ ok: true, authenticated: true, required: false, user: account.username, provider: "local" });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Could not create the account." });
  }
});

app.get("/api/auth/google/start", (req, res) => {
  if (!hasGoogleAuthConfigured()) {
    return res.status(503).json({ error: "Google login is not configured on the server." });
  }

  const state = randomBytes(24).toString("hex");
  authOauthStates.set(state, {
    next: typeof req.query?.next === "string" && req.query.next.startsWith("/") ? req.query.next : "/",
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  const oauthState = authOauthStates.get(state);
  authOauthStates.delete(state);

  if (!oauthState || oauthState.expiresAt <= Date.now() || !code || !hasGoogleAuthConfigured()) {
    return res.redirect("/?auth_error=google");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Could not validate Google.");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleProfile = await profileResponse.json();
    if (!profileResponse.ok || !googleProfile.email) {
      throw new Error("Could not read the Google profile.");
    }

    const account = ensureGoogleAccount({
      email: googleProfile.email,
      googleId: googleProfile.sub,
      displayName: googleProfile.name || googleProfile.given_name || googleProfile.email.split("@")[0],
    });
    const token = createAuthSession({
      username: account.username,
      email: account.email || "",
      provider: "google",
      guest: false,
    });
    res.setHeader("Set-Cookie", buildSessionCookie(token, Math.floor(APP_SESSION_TTL_MS / 1000)));
    return res.redirect(oauthState.next || "/");
  } catch (_error) {
    return res.redirect("/?auth_error=google");
  }
});

app.post("/api/auth/logout", (req, res) => {
  destroyAuthSession(req);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.post("/api/account/username", (req, res) => {
  const session = getEffectiveSession(req);
  if (session.guest) {
    return res.status(403).json({ error: "You must sign in to change the username." });
  }
  return res.status(403).json({ error: "Username changes are disabled after account setup." });
});

app.post("/api/account/google-username", (req, res) => {
  const usernameSetupLimit = registerAuthAttempt(req, "google-username", AUTH_REGISTER_RATE_LIMIT_MAX_ATTEMPTS);
  if (usernameSetupLimit.blocked) {
    res.setHeader("Retry-After", String(Math.ceil((usernameSetupLimit.retryAfterMs || 0) / 1000)));
    return res.status(429).json({ error: "Too many username attempts. Try again in a few minutes." });
  }

  const session = getAuthSession(req) || getEffectiveSession(req);
  if (session.guest) {
    return res.status(403).json({ error: "You must sign in with Google." });
  }

  try {
    const result = completeGoogleUsernameSetup(session.username, req.body?.username);
    session.username = result.account.username;
    session.guest = false;
    persistAuthSessions();
    clearAuthRateLimit(req, "google-username");
    return res.json({
      ok: true,
      user: result.account.username,
      account: result.account,
      profile: result.profile,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Could not save the username." });
  }
});

app.use("/api", (req, res, next) => {
  req.authSession = getEffectiveSession(req);
  return next();
});

app.get("/api/formats", (_req, res) => {
  res.json({ formats: AUDIO_FORMATS, videoFormats: VIDEO_FORMATS, templates: VISUAL_TEMPLATES });
});

app.get("/api/recent", (_req, res) => {
  const requestedLimit = Number.parseInt(String(_req.query?.limit || RECENT_RESPONSE_DEFAULT), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : RECENT_RESPONSE_DEFAULT;
  const items = recentConversions.slice(0, limit).map(decorateWithUserProfile);
  res.json({ items, total: items.length, limit });
});

app.get("/api/extractor-events", (req, res) => {
  const requestedLimit = Number.parseInt(String(req.query?.limit || "20"), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 20;
  const username = getRequestUsername(req);
  const items = extractorEvents.filter((item) => matchesUsername(item, username)).slice(0, limit);
  res.json({ items, total: items.length, limit });
});

app.get("/api/health", (_req, res) => {
  res.json(buildHealthPayload());
});

app.delete("/api/recent", (req, res) => {
  const adminToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (!adminToken) {
    return res.status(403).json({ error: "Ruta deshabilitada en este entorno." });
  }

  const provided = String(req.headers["x-admin-token"] || "");
  if (provided !== adminToken) {
    return res.status(401).json({ error: "Invalid token." });
  }

  recentConversions.length = 0;
  persistRecentConversions();
  return res.json({ ok: true, total: recentConversions.length });
});

app.get("/api/projects", (_req, res) => {
  const username = getRequestUsername(_req);
  res.json({ items: savedProjects.filter((item) => matchesUsername(item, username)).map(decorateWithUserProfile) });
});

app.post("/api/projects", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const tool = typeof req.body?.tool === "string" ? req.body.tool.trim() : "";
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};

  if (!name || !tool) {
    return res.status(400).json({ error: "Project name or tool is missing." });
  }

  const project = pushProject({
    name: sanitizeFilename(name),
    tool,
    username: getRequestUsername(req),
    payload,
  });

  return res.status(201).json(project);
});

app.get("/api/me", (req, res) => {
  const username = getRequestUsername(req);
  const history = buildUserHistory(username);
  res.json({
    user: username,
    profile: history.profile,
    stats: {
      conversions: history.conversions.length,
      extractorEvents: history.extractorEvents.length,
      projects: history.projects.length,
      lastConversionAt: history.conversions[0]?.createdAt || "",
      lastEventAt: history.extractorEvents[0]?.createdAt || "",
    },
  });
});

app.get("/api/subscription/plans", (_req, res) => {
  res.json({
    items: Object.values(SUBSCRIPTION_PLANS).map((plan) => ({
      ...plan,
      checkoutEnabled: plan.id === "free" ? false : isPaddlePlanReady(plan.id),
    })),
  });
});

app.get("/api/support-links", (_req, res) => {
  res.json({
    links: SUPPORT_LINKS,
  });
});

app.get("/api/subscription/me", (req, res) => {
  const username = getRequestUsername(req);
  res.json(getUserProfile(username));
});

app.post("/api/profile/avatar", (req, res) => {
  const username = getRequestUsername(req);
  const avatarDataUrl = typeof req.body?.avatarDataUrl === "string" ? req.body.avatarDataUrl.trim() : "";

  if (avatarDataUrl) {
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(avatarDataUrl)) {
      return res.status(400).json({ error: "Invalid image format." });
    }

    if (avatarDataUrl.length > 1_500_000) {
      return res.status(413).json({ error: "The image is too large." });
    }
  }

  return res.json(setUserAvatar(username, avatarDataUrl));
});

app.post("/api/subscription/me", (req, res) => {
  if (!ALLOW_MANUAL_PLAN_OVERRIDE) {
    return res.status(403).json({ error: "Manual plan updates are disabled. Use Paddle checkout." });
  }

  const username = getRequestUsername(req);
  const planId = typeof req.body?.planId === "string" ? req.body.planId.trim() : "free";
  if (!SUBSCRIPTION_PLANS[planId]) {
    return res.status(400).json({ error: "Invalid plan." });
  }

  const currentProfile = getUserProfile(username);
  const currentRank = getPlanRank(currentProfile.planId);
  const nextRank = getPlanRank(planId);

  if (nextRank < currentRank) {
    return res.status(400).json({ error: "Downgrades are not available here." });
  }

  if (nextRank === currentRank) {
    return res.json(currentProfile);
  }

  return res.json(setUserPlan(username, planId));
});

app.post("/api/subscription/checkout-session", async (req, res, next) => {
  try {
    if (!paddle) {
      return res.status(503).json({ error: "Paddle is not configured." });
    }

    const session = getEffectiveSession(req);
    if (session.guest || !session.username || safeEqualStrings(session.username, GUEST_USERNAME)) {
      return res.status(400).json({ error: "Sign in with a real account before purchasing a plan." });
    }

    const planId = typeof req.body?.planId === "string" ? req.body.planId.trim() : "";
    if (!PADDLE_PLAN_PRICE_IDS[planId]) {
      return res.status(400).json({ error: "Invalid paid plan." });
    }

    if (!isPaddlePlanReady(planId)) {
      return res.status(503).json({ error: "This plan is not configured in Paddle yet." });
    }

    const currentProfile = getUserProfile(session.username);
    if (!canUpgradeToPlan(currentProfile.planId, planId)) {
      return res.status(400).json({ error: "That plan is not available for your current subscription." });
    }

    const account = getAccountByUsername(session.username);
    const transaction = await paddle.transactions.create({
      items: [
        {
          priceId: PADDLE_PLAN_PRICE_IDS[planId],
          quantity: 1,
        },
      ],
      collectionMode: "automatic",
      customData: {
        username: session.username,
        planId,
      },
      customerId: null,
      checkout: {
        url: `${getRequestBaseUrl(req)}/subscribe.html?checkout=success`,
      },
    });

    return res.json({
      transactionId: transaction.id,
      checkoutUrl: transaction.checkout?.url || "",
      clientToken: PADDLE_CLIENT_TOKEN,
      environment: PADDLE_ENV === "production" ? "production" : "sandbox",
      customer: {
        email: account?.email || "",
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/my-history", (req, res) => {
  const username = getRequestUsername(req);
  res.json(buildUserHistory(username));
});

app.get("/api/history", (req, res) => {
  const requestedUser = sanitizeUsernameParam(req.query?.user);
  const username = requestedUser || getRequestUsername(req);
  res.json(buildUserHistory(username));
});

app.get("/api/users/search", (req, res) => {
  const requestedLimit = Number.parseInt(String(req.query?.limit || "8"), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 8;
  const query = typeof req.query?.q === "string" ? req.query.q : "";
  return res.json({ items: searchUsers(query, limit) });
});

app.patch("/api/projects/:id", (req, res) => {
  const project = updateProject(req.params.id, {
    name: typeof req.body?.name === "string" ? sanitizeFilename(req.body.name) : undefined,
    payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : undefined,
  });

  if (!project) {
    return res.status(404).json({ error: "Project not found." });
  }

  return res.json(project);
});

app.get("/api/pinterest-preview", async (req, res) => {
  const pinterestUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!pinterestUrl) {
    return res.status(400).json({ error: "Pinterest link is missing." });
  }

  try {
    const data = await resolvePinterestImage(pinterestUrl);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Could not read the Pinterest pin.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/image-proxy", async (req, res) => {
  const remoteUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";

  if (!remoteUrl) {
    return res.status(400).json({ error: "Image URL is missing." });
  }

  try {
    const { bytes, contentType } = await fetchRemoteBytes(remoteUrl);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(bytes);
  } catch (error) {
    return res.status(500).json({
      error: "Could not load the image.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/info", async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Invalid YouTube URL." });
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
    return res.status(400).json({ error: "Invalid SoundCloud URL." });
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
    return res.status(400).json({ error: "Invalid URL." });
  }

  try {
    return res.json(await getMediaInfoResponse(url));
  } catch (error) {
    return res.status(500).json({
      error: "Could not read the link.",
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
      return res.status(400).json({ error: "You must upload an image or paste a Pinterest link, and upload an audio file." });
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
        username: getRequestUsername(req),
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
          res.status(500).json({ error: "Could not deliver the final MP4." });
        }
      });
    } catch (error) {
      if (existsSync(tempDir)) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }

      return res.status(500).json({
        error: "Could not create the video.",
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
    return res.status(400).json({ error: "You must upload an audio file." });
  }

  if (!audioFile.mimetype.startsWith("audio/")) {
    await ensureRemoved(audioFile.path);
    return res.status(400).json({ error: "El archivo de audio no es valido." });
  }

  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    await ensureRemoved(audioFile.path);
    return res.status(400).json({ error: "Invalid trim range." });
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
      username: getRequestUsername(req),
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
      error: "Could not trim the audio.",
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
    return res.status(400).json({ error: "You must upload an audio file." });
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
        username: getRequestUsername(req),
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
        error: "Could not update the metadata.",
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
    return res.status(400).json({ error: "You must upload an image." });
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
      error: "Could not create the thumbnail.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "The file is too large. Current limit: 250 MB per file.",
      });
    }

    return res.status(400).json({
      error: "File upload error.",
      details: error.message,
    });
  }

  return next(error);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

loadRecentConversions();
loadExtractorEvents();
loadGeoIpCache();
loadProjects();
loadUserProfiles();
loadAuthAccounts();
loadAuthSessions();
const monitoringInterval = startServerMonitoring();

const server = app.listen(PORT, () => {
  console.log(`YouTube to MP3 listo en http://localhost:${PORT}`);
});

server.on("close", () => {
  clearInterval(monitoringInterval);
});

module.exports = server;
