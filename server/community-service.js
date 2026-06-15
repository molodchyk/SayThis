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
  let store = await readStore(storePath);

  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    const result = await handleCommunityRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body
    }, store, { adminToken });

    store = result.store;
    await writeStore(storePath, store);
    response.writeHead(result.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    response.end(JSON.stringify(result.body));
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

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
