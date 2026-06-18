import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_ALLOWED_ORIGINS = ["*"];

export function createMemoryRateLimiter(options = {}) {
  const limit = normalizePositiveInteger(options.limit, 20);
  const windowMs = normalizePositiveInteger(options.windowMs, 60 * 1000);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const buckets = new Map();

  return {
    check(key) {
      if (!key || limit < 1) {
        return { ok: true, retryAfterMs: 0 };
      }

      const timestamp = now();
      const existing = buckets.get(key);
      if (!existing || timestamp >= existing.resetAt) {
        buckets.set(key, {
          count: 1,
          resetAt: timestamp + windowMs
        });
        return { ok: true, retryAfterMs: 0 };
      }

      existing.count += 1;
      if (existing.count <= limit) {
        return { ok: true, retryAfterMs: 0 };
      }

      return {
        ok: false,
        retryAfterMs: Math.max(0, existing.resetAt - timestamp)
      };
    }
  };
}

export function normalizeAllowedOrigins(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const origins = raw
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  return origins.length ? [...new Set(origins)] : DEFAULT_ALLOWED_ORIGINS;
}

export function corsAllowOrigin(requestOrigin, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  const origins = normalizeAllowedOrigins(allowedOrigins);
  if (origins.includes("*")) {
    return "*";
  }

  const origin = normalizeOrigin(requestOrigin);
  return origin && origins.includes(origin) ? origin : "";
}

export function requestOriginAllowed(requestOrigin, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  const origin = normalizeOrigin(requestOrigin);
  return !origin || Boolean(corsAllowOrigin(origin, allowedOrigins));
}

export function adminTokenMatches(authorizationHeader, adminToken) {
  const expectedToken = String(adminToken || "");
  const providedToken = bearerTokenFromAuthorization(authorizationHeader);
  if (!expectedToken || !providedToken) {
    return false;
  }

  return timingSafeEqual(sha256(providedToken), sha256(expectedToken));
}

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw === "*") {
    return "*";
  }

  try {
    const url = new URL(raw);
    if (["chrome-extension:", "moz-extension:"].includes(url.protocol) && url.host) {
      return `${url.protocol}//${url.host}`;
    }

    return url.origin === "null" ? "" : url.origin;
  } catch {
    return "";
  }
}

function bearerTokenFromAuthorization(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/);
  return match ? match[1] : "";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest();
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}
