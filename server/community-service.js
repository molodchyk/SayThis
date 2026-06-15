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
  rejectSubmission
} from "./community-store.js";

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60 * 1000;

export async function handleCommunityRequest(request, store, options = {}) {
  const url = new URL(request.url, "http://localhost");
  const method = String(request.method || "GET").toUpperCase();
  const state = normalizeStore(store);

  if (method === "OPTIONS") {
    return jsonResponse(200, state, { ok: true });
  }

  if (method === "GET" && url.pathname === "/health") {
    return jsonResponse(200, state, { ok: true });
  }

  if (method === "GET" && url.searchParams.get("action") === "approved") {
    return jsonResponse(200, state, approvedEntriesPayload(state));
  }

  if (method === "POST" && url.pathname === "/community") {
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

    const result = acceptSubmission(state, parseJsonBody(request.body));
    return jsonResponse(result.accepted ? 202 : 400, result.store, {
      accepted: result.accepted,
      duplicate: Boolean(result.duplicate),
      reason: result.reason || ""
    });
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
    return jsonResponse(result.approved ? 200 : 404, result.store, {
      approved: result.approved,
      reason: result.reason || "",
      entry: result.entry || null
    });
  }

  if (method === "POST" && url.pathname === "/admin/reject") {
    const auth = authorize(request, options);
    if (!auth.ok) {
      return jsonResponse(auth.status, state, { error: auth.error });
    }

    const body = parseJsonBody(request.body);
    const result = rejectSubmission(state, body.id, body.reason);
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
  let store = await readStore(storePath);

  const server = createServer(async (request, response) => {
    let body = "";
    try {
      body = await readRequestBody(request, maxBodyBytes);
    } catch (error) {
      if (error?.code === "body-too-large") {
        sendJsonResponse(response, 413, { error: "body-too-large" });
        return;
      }

      sendJsonResponse(response, 400, { error: "invalid-request" });
      return;
    }

    const result = await handleCommunityRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      remoteAddress: request.socket?.remoteAddress,
      body
    }, store, {
      adminToken,
      maxBodyBytes,
      rateLimiter
    });

    store = result.store;
    await writeStore(storePath, store);
    sendJsonResponse(response, result.status, result.body);
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

export function createMemoryRateLimiter(options = {}) {
  const limit = normalizePositiveInteger(options.limit, DEFAULT_RATE_LIMIT);
  const windowMs = normalizePositiveInteger(options.windowMs, DEFAULT_RATE_WINDOW_MS);
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

function jsonResponse(status, store, body) {
  return {
    status,
    store,
    body
  };
}

function authorize(request, options) {
  const token = options.adminToken || "";
  if (!token) {
    return { ok: false, status: 503, error: "admin-token-not-configured" };
  }

  const header = request.headers?.authorization || request.headers?.Authorization || "";
  if (header !== `Bearer ${token}`) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  return { ok: true };
}

function checkSubmissionRate(request, options) {
  if (!options.rateLimiter || typeof options.rateLimiter.check !== "function") {
    return { ok: true, retryAfterMs: 0 };
  }

  return options.rateLimiter.check(clientKeyFromRequest(request));
}

function clientKeyFromRequest(request) {
  return String(
    request.clientKey ||
    request.headers?.["cf-connecting-ip"] ||
    request.headers?.["x-real-ip"] ||
    request.remoteAddress ||
    "unknown"
  );
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

function sendJsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  response.end(JSON.stringify(body));
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
