import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  acceptSubmission,
  approveSubmission,
  approvedEntriesPayload,
  createEmptyStore,
  normalizeStore,
  pendingPayload,
  rejectSubmission,
  removePendingSubmission
} from "./community-store.js";
import {
  DEFAULT_PUBLIC_AUDIO_GENERATION_LIMIT,
  DEFAULT_PUBLIC_AUDIO_GENERATION_WINDOW_MS
} from "./generation-budget.js";
import {
  DEFAULT_MAX_AUDIO_BYTES,
  generatedAudioArtifactFromBody,
  normalizePublicBaseEndpoint,
  publicAudioArtifact
} from "./community-audio-artifacts.js";
import {
  audioArtifactPayload,
  upsertGeneratedAudioArtifact
} from "./community-audio-store.js";
import {
  createConfiguredTtsProvider,
  generatedAudioArtifactFromTts
} from "./tts-provider.js";
import {
  adminTokenMatches,
  corsAllowOrigin,
  createMemoryRateLimiter,
  normalizeAllowedOrigins,
  requestOriginAllowed
} from "./request-policy.js";
import { handleSharedAudioRequest } from "./shared-audio-request.js";
import { renderAdminPage } from "./admin-page.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_PENDING_SUBMISSIONS = 1000;
const DEFAULT_MAX_REJECTED_SUBMISSIONS = 1000;
const DEFAULT_ALLOWED_ORIGINS = ["*"];

export {
  adminTokenMatches,
  corsAllowOrigin,
  createMemoryRateLimiter,
  normalizeAllowedOrigins,
  requestOriginAllowed
} from "./request-policy.js";

export async function handleCommunityRequest(request, store, options = {}) {
  const url = new URL(request.url, "http://localhost");
  const method = String(request.method || "GET").toUpperCase();
  const state = normalizeStore(store);
  const origin = checkRequestOrigin(request, options.allowedOrigins);
  if (!origin.ok) {
    return jsonResponse(403, state, { error: "origin-not-allowed" });
  }

  if (method === "OPTIONS") {
    return jsonResponse(200, state, { ok: true });
  }

  if (method === "GET" && url.pathname === "/health") {
    return jsonResponse(200, state, { ok: true });
  }

  if (method === "GET" && url.pathname === "/admin") {
    return htmlResponse(200, state, renderAdminPage());
  }

  if (method === "GET" && url.pathname.startsWith("/audio/")) {
    const artifact = audioArtifactPayload(state, decodeURIComponent(url.pathname.slice("/audio/".length)));
    if (!artifact) {
      return jsonResponse(404, state, { error: "audio-not-found" });
    }

    return binaryResponse(200, state, Buffer.from(artifact.dataBase64, "base64"), artifact.mimeType, {
      cacheControl: "public, max-age=31536000, immutable"
    });
  }

  if (method === "GET" && url.searchParams.get("action") === "approved") {
    return jsonResponse(200, state, approvedEntriesPayload(state));
  }

  if (method === "POST" && url.pathname === "/community" && !isSharedAudioRequestPath(url)) {
    const maxBodyBytes = normalizePositiveInteger(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES);
    if (bodyByteLength(request.body) > maxBodyBytes) {
      return jsonResponse(413, state, { error: "body-too-large" });
    }

    const rate = checkSubmissionRate(request, options);
    if (!rate.ok) {
      return jsonResponse(429, state, {
        error: "rate-limited",
        retryAfterMs: rate.retryAfterMs
      });
    }

    const result = acceptSubmission(state, parseJsonBody(request.body), new Date().toISOString(), {
      maxPendingSubmissions: normalizePositiveInteger(
        options.maxPendingSubmissions,
        DEFAULT_MAX_PENDING_SUBMISSIONS
      )
    });
    const status = result.accepted ? 202 : result.reason === "pending-limit-reached" ? 429 : 400;
    return jsonResponse(status, result.store, {
      accepted: result.accepted,
      duplicate: Boolean(result.duplicate),
      reason: result.reason || ""
    });
  }

  if (method === "POST" && isSharedAudioRequestPath(url)) {
    const result = await handleSharedAudioRequest(request, state, {
      ...options,
      authorizeGeneration: options.authorizeSharedAudioGeneration,
      checkRateLimit: (value) => checkSubmissionRate(value, options)
    });
    return jsonResponse(result.status, result.store, result.body);
  }

  if (method === "GET" && url.pathname === "/admin/pending") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    return jsonResponse(200, state, pendingPayload(state));
  }

  if (method === "POST" && url.pathname === "/admin/approve") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    const body = parseJsonBody(request.body);
    const result = approveSubmission(state, body.id, body);
    return jsonResponse(result.approved ? 200 : result.reason === "not-found" ? 404 : 400, result.store, {
      approved: result.approved,
      reason: result.reason || "",
      entry: result.entry || null
    });
  }

  if (method === "POST" && url.pathname === "/admin/audio-artifacts") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    const maxAudioBytes = normalizePositiveInteger(options.maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES);
    const body = parseJsonBody(request.body);
    const artifact = generatedAudioArtifactFromBody(body, {
      maxAudioBytes,
      publicBaseUrl: options.publicBaseUrl
    });
    if (!artifact.ok) {
      return jsonResponse(artifact.status, state, { error: artifact.error });
    }

    const result = upsertGeneratedAudioArtifact(state, artifact.value, new Date().toISOString(), {
      reviewed: true
    });
    return jsonResponse(result.accepted ? 200 : 400, result.store, {
      accepted: result.accepted,
      reason: result.reason || "",
      artifact: publicAudioArtifact(result.artifact),
      entry: result.entry || null
    });
  }

  if (method === "POST" && url.pathname === "/admin/generate-audio-artifact") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    const maxAudioBytes = normalizePositiveInteger(options.maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES);
    const body = parseJsonBody(request.body);
    const artifact = await generatedAudioArtifactFromTts(body, {
      maxAudioBytes,
      publicBaseUrl: options.publicBaseUrl,
      ttsProvider: options.ttsProvider
    });
    if (!artifact.ok) {
      return jsonResponse(artifact.status, state, { error: artifact.error });
    }

    const now = new Date().toISOString();
    const result = upsertGeneratedAudioArtifact(state, artifact.value, now, {
      reviewed: true
    });
    const pending = result.accepted && body.id
      ? removePendingSubmission(result.store, body.id, now)
      : { store: result.store, removed: false };
    return jsonResponse(result.accepted ? 200 : 400, pending.store, {
      accepted: result.accepted,
      reason: result.reason || "",
      artifact: publicAudioArtifact(result.artifact),
      entry: result.entry || null,
      voice: artifact.voice || null,
      removedPending: pending.removed
    });
  }

  if (method === "POST" && url.pathname === "/admin/reject") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    const body = parseJsonBody(request.body);
    const result = rejectSubmission(state, body.id, body.reason, new Date().toISOString(), {
      maxRejectedSubmissions: normalizePositiveInteger(
        options.maxRejectedSubmissions,
        DEFAULT_MAX_REJECTED_SUBMISSIONS
      )
    });
    return jsonResponse(result.rejected ? 200 : 404, result.store, {
      rejected: result.rejected,
      reason: result.reason || "",
      rejection: result.rejection || null
    });
  }

  return jsonResponse(404, state, { error: "not-found" });
}

export async function createCommunityServer(options = {}) {
  const storePath = options.storePath || "community-store.json";
  const adminToken = options.adminToken || process.env.SAYTHIS_ADMIN_TOKEN || "";
  const maxBodyBytes = normalizePositiveInteger(
    options.maxBodyBytes ?? process.env.SAYTHIS_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_BYTES
  );
  const maxPendingSubmissions = normalizePositiveInteger(
    options.maxPendingSubmissions ?? process.env.SAYTHIS_MAX_PENDING_SUBMISSIONS,
    DEFAULT_MAX_PENDING_SUBMISSIONS
  );
  const maxRejectedSubmissions = normalizePositiveInteger(
    options.maxRejectedSubmissions ?? process.env.SAYTHIS_MAX_REJECTED_SUBMISSIONS,
    DEFAULT_MAX_REJECTED_SUBMISSIONS
  );
  const maxAudioBytes = normalizePositiveInteger(
    options.maxAudioBytes ?? process.env.SAYTHIS_MAX_AUDIO_BYTES,
    DEFAULT_MAX_AUDIO_BYTES
  );
  const publicBaseUrl = normalizePublicBaseEndpoint(options.publicBaseUrl ?? process.env.SAYTHIS_PUBLIC_BASE_URL);
  const ttsProvider = options.ttsProvider || createConfiguredTtsProvider({
    accessToken: options.googleTtsAccessToken ?? process.env.SAYTHIS_GOOGLE_TTS_ACCESS_TOKEN,
    serviceAccountJson: options.googleServiceAccountJson ?? process.env.SAYTHIS_GOOGLE_SERVICE_ACCOUNT_JSON,
    applicationCredentialsPath: options.googleApplicationCredentials ??
      process.env.SAYTHIS_GOOGLE_APPLICATION_CREDENTIALS ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    endpoint: options.googleTtsEndpoint ?? process.env.SAYTHIS_GOOGLE_TTS_ENDPOINT,
    defaultVoiceName: options.googleTtsVoice ?? process.env.SAYTHIS_GOOGLE_TTS_VOICE,
    audioEncoding: options.googleTtsAudioEncoding ?? process.env.SAYTHIS_GOOGLE_TTS_AUDIO_ENCODING,
    fetch: options.fetch
  });
  const rateLimiter = options.rateLimiter || createMemoryRateLimiter({
    limit: normalizePositiveInteger(
      options.rateLimit ?? process.env.SAYTHIS_RATE_LIMIT,
      DEFAULT_RATE_LIMIT
    ),
    windowMs: normalizePositiveInteger(
      options.rateWindowMs ?? process.env.SAYTHIS_RATE_WINDOW_MS,
      DEFAULT_RATE_WINDOW_MS
    )
  });
  const allowedOrigins = normalizeAllowedOrigins(
    options.allowedOrigins ?? process.env.SAYTHIS_ALLOWED_ORIGINS
  );
  const publicAudioGenerationEnabled = normalizeBoolean(
    options.publicAudioGenerationEnabled ?? process.env.SAYTHIS_PUBLIC_AUDIO_GENERATION_ENABLED
  );
  const publicAudioGenerationLimit = normalizePositiveInteger(
    options.publicAudioGenerationLimit ?? process.env.SAYTHIS_PUBLIC_AUDIO_GENERATION_LIMIT,
    DEFAULT_PUBLIC_AUDIO_GENERATION_LIMIT
  );
  const publicAudioGenerationWindowMs = normalizePositiveInteger(
    options.publicAudioGenerationWindowMs ?? process.env.SAYTHIS_PUBLIC_AUDIO_GENERATION_WINDOW_MS,
    DEFAULT_PUBLIC_AUDIO_GENERATION_WINDOW_MS
  );
  const trustProxyHeaders = options.trustProxyHeaders ?? process.env.SAYTHIS_TRUST_PROXY_HEADERS === "1";
  let store = await readStore(storePath);
  const runStoreOperation = createStoreOperationQueue();

  const server = createServer(async (request, response) => {
    const requestPath = new URL(request.url || "/", "http://localhost").pathname;
    const requestMaxBodyBytes = requestPath === "/admin/audio-artifacts"
      ? Math.max(maxBodyBytes, Math.ceil(maxAudioBytes * 1.5) + 4096)
      : maxBodyBytes;
    let body = "";
    try {
      body = await readRequestBody(request, requestMaxBodyBytes);
    } catch (error) {
      if (error?.code === "body-too-large") {
        sendJsonResponse(response, 413, { error: "body-too-large" });
        return;
      }

      sendJsonResponse(response, 400, { error: "invalid-request" });
      return;
    }

    try {
      const result = await runStoreOperation(async () => {
        const next = await handleCommunityRequest({
          method: request.method,
          url: request.url,
          headers: request.headers,
          remoteAddress: request.socket?.remoteAddress,
          body
        }, store, {
          adminToken,
          maxBodyBytes,
          maxPendingSubmissions,
          maxRejectedSubmissions,
          maxAudioBytes,
          publicBaseUrl,
          ttsProvider,
          publicAudioGenerationEnabled,
          publicAudioGenerationLimit,
          publicAudioGenerationWindowMs,
          allowedOrigins,
          rateLimiter,
          trustProxyHeaders
        });

        await writeStore(storePath, next.store);
        store = next.store;
        return next;
      });

      sendCommunityResponse(response, result, {
        allowedOrigins,
        requestOrigin: request.headers.origin
      });
    } catch {
      sendJsonResponse(response, 500, { error: "server-error" });
    }
  });

  return server;
}

export async function main() {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const storePath = process.env.SAYTHIS_STORE || "community-store.json";
  const server = await createCommunityServer({ storePath });
  server.listen(port, () => {
    console.log(`SayThis community service listening on http://127.0.0.1:${port}`);
  });
}

function jsonResponse(status, store, body) {
  return {
    status,
    store,
    body,
    contentType: "application/json; charset=utf-8"
  };
}

function htmlResponse(status, store, body) {
  return {
    status,
    store,
    body,
    contentType: "text/html; charset=utf-8"
  };
}

function binaryResponse(status, store, body, contentType, options = {}) {
  return {
    status,
    store,
    body,
    contentType,
    cacheControl: options.cacheControl || "no-store"
  };
}

function authorize(request, options) {
  const token = options.adminToken || "";
  if (!token) {
    return { ok: false, status: 503, error: "admin-token-not-configured" };
  }

  const header = request.headers?.authorization || request.headers?.Authorization || "";
  if (!adminTokenMatches(header, token)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  return { ok: true };
}

function checkRequestOrigin(request, allowedOrigins) {
  const origin = request.headers?.origin || request.headers?.Origin || "";
  return {
    ok: requestOriginAllowed(origin, allowedOrigins)
  };
}

function checkSubmissionRate(request, options) {
  if (!options.rateLimiter || typeof options.rateLimiter.check !== "function") {
    return { ok: true, retryAfterMs: 0 };
  }

  return options.rateLimiter.check(clientKeyFromRequest(request, options.trustProxyHeaders));
}

function clientKeyFromRequest(request, trustProxyHeaders = false) {
  if (request.clientKey) {
    return String(request.clientKey);
  }

  if (trustProxyHeaders) {
    return String(
      request.headers?.["cf-connecting-ip"] ||
      request.headers?.["x-real-ip"] ||
      request.remoteAddress ||
      "unknown"
    );
  }

  return String(request.remoteAddress || "unknown");
}

function parseJsonBody(body) {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function isSharedAudioRequestPath(url) {
  return url.pathname === "/audio/generate" ||
    url.searchParams.get("action") === "audio";
}

async function readRequestBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("body-too-large");
      error.code = "body-too-large";
      throw error;
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readStore(storePath) {
  try {
    return normalizeStore(JSON.parse(await readFile(storePath, "utf8")));
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(storePath, store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
}

function createStoreOperationQueue() {
  let queue = Promise.resolve();
  return function run(task) {
    const operation = queue.then(task, task);
    queue = operation.catch(() => {});
    return operation;
  };
}

function sendCommunityResponse(response, result, options = {}) {
  const contentType = result.contentType || "application/json; charset=utf-8";
  const allowOrigin = corsAllowOrigin(options.requestOrigin, options.allowedOrigins);
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": result.cacheControl || "no-store",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin !== "*") {
      headers.Vary = "Origin";
    }
  }

  response.writeHead(result.status, headers);

  if (contentType.startsWith("text/html")) {
    response.end(String(result.body || ""));
    return;
  }

  if (Buffer.isBuffer(result.body)) {
    response.end(result.body);
    return;
  }

  response.end(JSON.stringify(result.body));
}

function sendJsonResponse(response, status, body) {
  sendCommunityResponse(response, jsonResponse(status, createEmptyStore(), body));
}

function bodyByteLength(body) {
  return Buffer.byteLength(String(body || ""), "utf8");
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
