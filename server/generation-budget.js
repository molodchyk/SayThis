export const DEFAULT_PUBLIC_AUDIO_GENERATION_LIMIT = 50;
export const DEFAULT_PUBLIC_AUDIO_GENERATION_WINDOW_MS = 24 * 60 * 60 * 1000;

const PUBLIC_AUDIO_GENERATION_BUCKET = "publicAudioGeneration";

export function consumePublicAudioGenerationBudget(store = {}, options = {}) {
  const limit = normalizeBudgetLimit(options.limit, DEFAULT_PUBLIC_AUDIO_GENERATION_LIMIT);
  const windowMs = normalizePositiveInteger(options.windowMs, DEFAULT_PUBLIC_AUDIO_GENERATION_WINDOW_MS);
  const nowMs = nowTimestamp(options.now);
  const bucket = currentGenerationBucket(
    store?.generationUsage?.[PUBLIC_AUDIO_GENERATION_BUCKET],
    nowMs,
    windowMs
  );

  if (limit < 1 || bucket.count >= limit) {
    return {
      ok: false,
      store: withGenerationBucket(store, bucket, nowMs),
      error: "generation-budget-exhausted",
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterMs: Math.max(0, Date.parse(bucket.resetAt) - nowMs)
    };
  }

  const nextBucket = {
    ...bucket,
    count: bucket.count + 1,
    updatedAt: iso(nowMs)
  };

  return {
    ok: true,
    store: withGenerationBucket(store, nextBucket, nowMs),
    remaining: Math.max(0, limit - nextBucket.count),
    resetAt: nextBucket.resetAt,
    retryAfterMs: 0
  };
}

export function normalizeGenerationUsageMap(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const bucket = normalizeGenerationBucket(value[PUBLIC_AUDIO_GENERATION_BUCKET]);
  return bucket ? { [PUBLIC_AUDIO_GENERATION_BUCKET]: bucket } : {};
}

function withGenerationBucket(store = {}, bucket, nowMs) {
  return {
    ...store,
    updatedAt: iso(nowMs),
    generationUsage: {
      ...normalizeGenerationUsageMap(store?.generationUsage),
      [PUBLIC_AUDIO_GENERATION_BUCKET]: bucket
    }
  };
}

function currentGenerationBucket(value, nowMs, windowMs) {
  const bucket = normalizeGenerationBucket(value);
  const resetMs = bucket ? Date.parse(bucket.resetAt) : 0;
  if (!bucket || !Number.isFinite(resetMs) || nowMs >= resetMs) {
    return {
      windowStart: iso(nowMs),
      resetAt: iso(nowMs + windowMs),
      count: 0,
      updatedAt: iso(nowMs)
    };
  }

  return bucket;
}

function normalizeGenerationBucket(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const resetAt = normalizeIso(value.resetAt);
  if (!resetAt) {
    return null;
  }

  return {
    windowStart: normalizeIso(value.windowStart) || resetAt,
    resetAt,
    count: clampInteger(value.count, 0, 1_000_000),
    updatedAt: normalizeIso(value.updatedAt) || resetAt
  };
}

function nowTimestamp(value) {
  const raw = typeof value === "function" ? value() : value;
  const timestamp = raw === undefined ? Date.now() : Number(raw);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function normalizeBudgetLimit(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    return fallback;
  }

  return Math.floor(number);
}

function clampInteger(value, min, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeIso(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function iso(timestamp) {
  return new Date(timestamp).toISOString();
}
