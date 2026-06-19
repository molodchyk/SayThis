import {
  acceptSubmission,
  approveSubmission,
  createEmptyStore,
  normalizeStore,
  pendingPayload,
  rejectSubmission
} from "../server/community-store.js";
import {
  approvedAudioEntryForRequest,
  upsertGeneratedAudioArtifact
} from "../server/community-audio-store.js";
import {
  AUDIO_CACHE_CONTROL,
  DEFAULT_MAX_AUDIO_BYTES,
  audioStorageKey,
  normalizeAudioMimeType,
  normalizeAudioStorageKey,
  normalizePublicBaseEndpoint,
  publicAudioArtifact,
  publicAudioUrl
} from "../server/audio-artifact-core.js";
import {
  createLookupKey,
  normalizeSelection
} from "../src/resolver-core.js";
import {
  languageCodeFromLanguage,
  normalizeTtsLanguage
} from "../src/resolver/language.js";

const STORE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_MAX_PENDING_SUBMISSIONS = 1000;
const DEFAULT_MAX_REJECTED_SUBMISSIONS = 1000;
const DEFAULT_APPROVED_EXPORT_LIMIT = 5000;
const DEFAULT_MAX_IMPORT_BYTES = 1024 * 1024;
const TEXT_ENCODER = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    return handleWorkerRequest(request, env, ctx);
  }
};

export async function handleWorkerRequest(request, env = {}, _ctx = {}) {
  const options = workerOptions(env);
  const origin = request.headers.get("origin") || "";
  if (!requestOriginAllowed(origin, options.allowedOrigins)) {
    return jsonResponse({ error: "origin-not-allowed" }, 403, options, origin);
  }

  if (request.method.toUpperCase() === "OPTIONS") {
    return jsonResponse({ ok: true }, 200, options, origin);
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const store = await communityStoreFromEnv(env);
  await store.ensure();

  if (method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, storage: "cloudflare-worker" }, 200, options, origin);
  }

  if (method === "GET" && url.pathname === "/admin") {
    return htmlResponse(renderWorkerAdminPlaceholder(), 200, options, origin);
  }

  if (method === "GET" && url.pathname.startsWith("/audio/")) {
    return serveAudioArtifact(url.pathname.slice("/audio/".length), store, env, options, origin);
  }

  if (method === "GET" && url.pathname === "/community" && url.searchParams.get("action") === "approved") {
    const entries = await store.listApproved(options.approvedExportLimit);
    return jsonResponse({
      schemaVersion: STORE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      entries
    }, 200, options, origin);
  }

  if (method === "POST" && url.pathname === "/community" && !isSharedAudioRequestPath(url)) {
    return acceptCommunitySubmission(request, store, options, origin);
  }

  if (method === "POST" && isSharedAudioRequestPath(url)) {
    return handleSharedAudioRequest(request, store, options, origin);
  }

  if (method === "GET" && url.pathname === "/admin/pending") {
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status, options, origin);
    }

    const pending = await store.listPending();
    return jsonResponse(pendingPayload({ pending }), 200, options, origin);
  }

  if (method === "POST" && url.pathname === "/admin/approve") {
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status, options, origin);
    }

    const body = await readJsonBody(request, options.maxBodyBytes);
    if (!body.ok) {
      return jsonResponse({ error: body.error }, body.status, options, origin);
    }

    const pending = await store.getPending(body.value.id);
    if (!pending) {
      return jsonResponse({ approved: false, reason: "not-found" }, 404, options, origin);
    }

    const result = approveSubmission({ ...createEmptyStore(), pending: [pending] }, body.value.id, body.value);
    if (!result.approved) {
      return jsonResponse({
        approved: false,
        reason: result.reason || ""
      }, result.reason === "not-found" ? 404 : 400, options, origin);
    }

    await store.putApproved(result.entry);
    await store.deletePending(pending.id);
    return jsonResponse({
      approved: true,
      reason: "",
      entry: result.entry
    }, 200, options, origin);
  }

  if (method === "POST" && url.pathname === "/admin/reject") {
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status, options, origin);
    }

    const body = await readJsonBody(request, options.maxBodyBytes);
    if (!body.ok) {
      return jsonResponse({ error: body.error }, body.status, options, origin);
    }

    const pending = await store.getPending(body.value.id);
    if (!pending) {
      return jsonResponse({ rejected: false, reason: "not-found" }, 404, options, origin);
    }

    const result = rejectSubmission({ ...createEmptyStore(), pending: [pending] }, body.value.id, body.value.reason, new Date().toISOString(), {
      maxRejectedSubmissions: options.maxRejectedSubmissions
    });
    if (!result.rejected) {
      return jsonResponse({ rejected: false, reason: result.reason || "" }, 404, options, origin);
    }

    await store.putRejected(result.rejection);
    await store.deletePending(pending.id);
    return jsonResponse({
      rejected: true,
      reason: "",
      rejection: result.rejection
    }, 200, options, origin);
  }

  if (method === "POST" && url.pathname === "/admin/audio-artifacts") {
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status, options, origin);
    }

    if (!env.SAYTHIS_AUDIO_BUCKET || typeof env.SAYTHIS_AUDIO_BUCKET.put !== "function") {
      return jsonResponse({ error: "audio-object-store-not-configured" }, 503, options, origin);
    }

    const body = await readJsonBody(request, Math.max(options.maxBodyBytes, Math.ceil(options.maxAudioBytes * 1.5) + 4096));
    if (!body.ok) {
      return jsonResponse({ error: body.error }, body.status, options, origin);
    }

    const artifact = await generatedAudioArtifactFromBody(body.value, {
      maxAudioBytes: options.maxAudioBytes,
      publicBaseUrl: options.publicBaseUrl,
      audioPublicBaseUrl: options.audioPublicBaseUrl
    });
    if (!artifact.ok) {
      return jsonResponse({ error: artifact.error }, artifact.status, options, origin);
    }

    await env.SAYTHIS_AUDIO_BUCKET.put(artifact.value.storageKey, artifact.bytes, {
      httpMetadata: {
        contentType: artifact.value.mimeType,
        cacheControl: AUDIO_CACHE_CONTROL
      }
    });

    const storedArtifact = {
      ...artifact.value,
      dataBase64: ""
    };
    const result = upsertGeneratedAudioArtifact(createEmptyStore(), storedArtifact, new Date().toISOString(), {
      reviewed: true
    });
    if (!result.accepted) {
      return jsonResponse({
        accepted: false,
        reason: result.reason || ""
      }, 400, options, origin);
    }

    await store.putAudioArtifact(result.artifact);
    await store.putApproved(result.entry);
    return jsonResponse({
      accepted: true,
      reason: "",
      artifact: publicAudioArtifact(result.artifact),
      entry: result.entry || null
    }, 200, options, origin);
  }

  if (method === "POST" && url.pathname === "/admin/import-approved") {
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status, options, origin);
    }

    const body = await readJsonBody(request, options.maxImportBytes);
    if (!body.ok) {
      return jsonResponse({ error: body.error }, body.status, options, origin);
    }

    const imported = normalizeStore(body.value);
    const artifacts = Object.values(imported.audioArtifacts || {});
    const entries = Object.values(imported.approved || {});
    if (!artifacts.length && !entries.length) {
      return jsonResponse({ imported: false, reason: "empty-import" }, 400, options, origin);
    }

    for (const artifact of artifacts) {
      await store.putAudioArtifact(artifact);
    }
    for (const entry of entries) {
      await store.putApproved(entry);
    }

    return jsonResponse({
      imported: true,
      approved: entries.length,
      audioArtifacts: artifacts.length
    }, 200, options, origin);
  }

  return jsonResponse({ error: "not-found" }, 404, options, origin);
}

export function createMemoryCommunityStore(initialStore = createEmptyStore()) {
  const pending = new Map((initialStore.pending || []).map((item) => [item.id, item]));
  const approved = new Map(Object.values(initialStore.approved || {}).map((entry) => [entry.lookupKey, entry]));
  const audioArtifacts = new Map(Object.values(initialStore.audioArtifacts || {}).map((artifact) => [artifact.id, artifact]));
  const rejected = new Map((initialStore.rejected || []).map((item) => [item.id, item]));

  return {
    async ensure() {},
    async countPending() {
      return pending.size;
    },
    async listPending() {
      return [...pending.values()];
    },
    async getPending(id) {
      return pending.get(normalizeSelection(id)) || null;
    },
    async putPending(submission) {
      pending.set(submission.id, submission);
    },
    async deletePending(id) {
      pending.delete(normalizeSelection(id));
    },
    async putRejected(rejection) {
      rejected.set(rejection.id, rejection);
    },
    async listApproved(limit = DEFAULT_APPROVED_EXPORT_LIMIT) {
      return [...approved.values()].slice(0, limit);
    },
    async getApproved(lookupKey) {
      return approved.get(createLookupKey(lookupKey)) || null;
    },
    async findApprovedByKeys(keys, requestedLang) {
      const keySet = new Set(keys.map(createLookupKey).filter(Boolean));
      return [...approved.values()].filter((entry) =>
        compatibleApprovedAudioEntry(entry, requestedLang) &&
        sharedAudioEntryKeys(entry).some((key) => keySet.has(key)));
    },
    async putApproved(entry) {
      approved.set(entry.lookupKey, entry);
    },
    async getAudioArtifact(id) {
      return audioArtifacts.get(normalizeArtifactId(id)) || null;
    },
    async putAudioArtifact(artifact) {
      audioArtifacts.set(artifact.id, artifact);
    }
  };
}

function createD1CommunityStore(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("SAYTHIS_DB binding is required");
  }

  return {
    async ensure() {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS saythis_pending (
          id TEXT PRIMARY KEY,
          lookup_key TEXT NOT NULL,
          term TEXT NOT NULL,
          kind TEXT NOT NULL,
          created_at TEXT NOT NULL,
          received_at TEXT NOT NULL,
          submission_json TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_saythis_pending_lookup_key ON saythis_pending (lookup_key)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS saythis_approved (
          lookup_key TEXT PRIMARY KEY,
          base_language TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          entry_json TEXT NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_saythis_approved_base_language ON saythis_approved (base_language)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS saythis_approved_keys (
          request_key TEXT NOT NULL,
          base_language TEXT NOT NULL DEFAULT '',
          lookup_key TEXT NOT NULL,
          PRIMARY KEY (request_key, base_language, lookup_key)
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_saythis_approved_keys_lookup_key ON saythis_approved_keys (lookup_key)"),
        db.prepare(`CREATE TABLE IF NOT EXISTS saythis_audio_artifacts (
          id TEXT PRIMARY KEY,
          storage_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          artifact_json TEXT NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS saythis_rejected (
          id TEXT PRIMARY KEY,
          lookup_key TEXT,
          term TEXT,
          rejected_at TEXT NOT NULL,
          rejection_json TEXT NOT NULL
        )`)
      ]);
    },
    async countPending() {
      const result = await db.prepare("SELECT COUNT(*) AS count FROM saythis_pending").first();
      return Number(result?.count || 0);
    },
    async listPending() {
      const result = await db.prepare("SELECT submission_json FROM saythis_pending ORDER BY received_at DESC LIMIT 500").all();
      return parseJsonRows(result, "submission_json");
    },
    async getPending(id) {
      const result = await db.prepare("SELECT submission_json FROM saythis_pending WHERE id = ?").bind(normalizeSelection(id)).first();
      return parseJsonValue(result?.submission_json);
    },
    async putPending(submission) {
      await db.prepare(`INSERT INTO saythis_pending
        (id, lookup_key, term, kind, created_at, received_at, submission_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          lookup_key = excluded.lookup_key,
          term = excluded.term,
          kind = excluded.kind,
          created_at = excluded.created_at,
          received_at = excluded.received_at,
          submission_json = excluded.submission_json`)
        .bind(
          submission.id,
          submission.lookupKey,
          submission.term,
          submission.kind,
          submission.createdAt,
          submission.receivedAt,
          JSON.stringify(submission)
        )
        .run();
    },
    async deletePending(id) {
      await db.prepare("DELETE FROM saythis_pending WHERE id = ?").bind(normalizeSelection(id)).run();
    },
    async putRejected(rejection) {
      await db.prepare(`INSERT INTO saythis_rejected
        (id, lookup_key, term, rejected_at, rejection_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          lookup_key = excluded.lookup_key,
          term = excluded.term,
          rejected_at = excluded.rejected_at,
          rejection_json = excluded.rejection_json`)
        .bind(
          rejection.id,
          rejection.lookupKey,
          rejection.term,
          rejection.rejectedAt || new Date().toISOString(),
          JSON.stringify(rejection)
        )
        .run();
    },
    async listApproved(limit = DEFAULT_APPROVED_EXPORT_LIMIT) {
      const result = await db.prepare("SELECT entry_json FROM saythis_approved ORDER BY updated_at DESC LIMIT ?").bind(limit).all();
      return parseJsonRows(result, "entry_json");
    },
    async getApproved(lookupKey) {
      const result = await db.prepare("SELECT entry_json FROM saythis_approved WHERE lookup_key = ?").bind(createLookupKey(lookupKey)).first();
      return parseJsonValue(result?.entry_json);
    },
    async findApprovedByKeys(keys, requestedLang) {
      const safeKeys = uniqueLookupKeys(keys).slice(0, 25);
      const base = baseLanguage(requestedLang);
      if (!safeKeys.length || !base) {
        return [];
      }

      const placeholders = safeKeys.map(() => "?").join(", ");
      const result = await db.prepare(`SELECT DISTINCT a.entry_json
        FROM saythis_approved_keys k
        JOIN saythis_approved a ON a.lookup_key = k.lookup_key
        WHERE k.base_language = ? AND k.request_key IN (${placeholders})
        LIMIT 12`)
        .bind(base, ...safeKeys)
        .all();
      return parseJsonRows(result, "entry_json");
    },
    async getAudioArtifact(id) {
      const result = await db.prepare("SELECT artifact_json FROM saythis_audio_artifacts WHERE id = ?").bind(normalizeArtifactId(id)).first();
      return parseJsonValue(result?.artifact_json);
    },
    async putAudioArtifact(artifact) {
      await db.prepare(`INSERT INTO saythis_audio_artifacts
        (id, storage_key, created_at, artifact_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          storage_key = excluded.storage_key,
          created_at = excluded.created_at,
          artifact_json = excluded.artifact_json`)
        .bind(
          artifact.id,
          artifact.storageKey || "",
          artifact.createdAt || new Date().toISOString(),
          JSON.stringify(artifact)
        )
        .run();
    },
    async putApproved(entry) {
      const requestKeys = sharedAudioEntryKeys(entry);
      const base = baseLanguage(entry.ttsLang || entry.language);
      const statements = [
        db.prepare(`INSERT INTO saythis_approved
          (lookup_key, base_language, updated_at, entry_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(lookup_key) DO UPDATE SET
            base_language = excluded.base_language,
            updated_at = excluded.updated_at,
            entry_json = excluded.entry_json`)
          .bind(entry.lookupKey, base, entry.updatedAt || new Date().toISOString(), JSON.stringify(entry)),
        db.prepare("DELETE FROM saythis_approved_keys WHERE lookup_key = ?").bind(entry.lookupKey)
      ];

      for (const key of requestKeys) {
        statements.push(db.prepare(`INSERT OR IGNORE INTO saythis_approved_keys
          (request_key, base_language, lookup_key)
          VALUES (?, ?, ?)`)
          .bind(key, base, entry.lookupKey));
      }

      await db.batch(statements);
    }
  };
}

async function communityStoreFromEnv(env) {
  if (env.SAYTHIS_STORE) {
    return env.SAYTHIS_STORE;
  }

  return createD1CommunityStore(env.SAYTHIS_DB);
}

async function acceptCommunitySubmission(request, store, options, origin) {
  const body = await readJsonBody(request, options.maxBodyBytes);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, body.status, options, origin);
  }

  const result = acceptSubmission(createEmptyStore(), body.value, new Date().toISOString(), {
    maxPendingSubmissions: options.maxPendingSubmissions
  });
  if (!result.accepted) {
    const status = result.reason === "pending-limit-reached" ? 429 : 400;
    return jsonResponse({
      accepted: false,
      duplicate: false,
      reason: result.reason || ""
    }, status, options, origin);
  }

  const existing = await store.getPending(result.submission.id);
  if (existing) {
    return jsonResponse({
      accepted: true,
      duplicate: true,
      reason: ""
    }, 202, options, origin);
  }

  if (await store.countPending() >= options.maxPendingSubmissions) {
    return jsonResponse({
      accepted: false,
      duplicate: false,
      reason: "pending-limit-reached"
    }, 429, options, origin);
  }

  await store.putPending(result.submission);
  return jsonResponse({
    accepted: true,
    duplicate: false,
    reason: ""
  }, 202, options, origin);
}

async function handleSharedAudioRequest(request, store, options, origin) {
  const body = await readJsonBody(request, options.maxBodyBytes);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, body.status, options, origin);
  }

  const entry = await approvedAudioEntryForRequestStore(store, body.value);
  if (entry) {
    return jsonResponse({
      accepted: true,
      reused: true,
      generated: false,
      entry
    }, 200, options, origin);
  }

  return jsonResponse({ error: "shared-audio-not-found" }, 404, options, origin);
}

async function approvedAudioEntryForRequestStore(store, request = {}) {
  const lookupKey = createLookupKey(request.lookupKey || request.term || request.display || request.sourceForm);
  const requestedLang = baseLanguage(request.ttsLang || request.language);
  if (lookupKey) {
    const direct = compatibleApprovedAudioEntry(await store.getApproved(lookupKey), requestedLang);
    if (direct) {
      return direct;
    }
  }

  const requestKeys = sharedAudioRequestKeys(request);
  if (!requestKeys.length || !requestedLang) {
    return null;
  }

  const candidates = await store.findApprovedByKeys(requestKeys, requestedLang);
  return approvedAudioEntryForRequest({ approved: Object.fromEntries(candidates.map((entry) => [entry.lookupKey, entry])) }, request);
}

async function serveAudioArtifact(encodedArtifactId, store, env, options, origin) {
  const artifact = await store.getAudioArtifact(decodeURIComponent(encodedArtifactId));
  if (!artifact) {
    return jsonResponse({ error: "audio-not-found" }, 404, options, origin);
  }

  const storageKey = normalizeAudioStorageKey(artifact.storageKey);
  if (env.SAYTHIS_AUDIO_BUCKET && storageKey) {
    const object = await env.SAYTHIS_AUDIO_BUCKET.get(storageKey);
    if (object) {
      const headers = new Headers({
        "Cache-Control": AUDIO_CACHE_CONTROL
      });
      if (typeof object.writeHttpMetadata === "function") {
        object.writeHttpMetadata(headers);
      }
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", artifact.mimeType || "application/octet-stream");
      }
      applyCorsHeaders(headers, options, origin);
      return new Response(object.body, {
        status: 200,
        headers
      });
    }
  }

  if (artifact.audioUrl) {
    return Response.redirect(artifact.audioUrl, 302);
  }

  return jsonResponse({ error: "audio-not-found" }, 404, options, origin);
}

async function generatedAudioArtifactFromBody(body = {}, options = {}) {
  const maxAudioBytes = normalizePositiveInteger(options.maxAudioBytes, DEFAULT_MAX_AUDIO_BYTES);
  const mimeType = normalizeAudioMimeType(body.mimeType);
  const bytes = decodeBase64Audio(body.dataBase64);
  if (!mimeType || !bytes.length) {
    return {
      ok: false,
      status: 400,
      error: "invalid-audio-artifact"
    };
  }

  if (bytes.length > maxAudioBytes) {
    return {
      ok: false,
      status: 413,
      error: "audio-too-large"
    };
  }

  const hash = await sha256Hex(bytes);
  const id = `aud_${hash.slice(0, 32)}`;
  const storageKey = audioStorageKey(hash, mimeType);
  const audioUrl = publicAudioUrl({
    publicBaseUrl: options.publicBaseUrl,
    audioPublicBaseUrl: options.audioPublicBaseUrl,
    id,
    storageKey
  });
  if (!audioUrl) {
    return {
      ok: false,
      status: 400,
      error: "public-base-url-required"
    };
  }

  return {
    ok: true,
    bytes,
    value: {
      id,
      term: body.term,
      lookupKey: body.lookupKey,
      sourceForm: body.sourceForm,
      aliases: body.aliases,
      language: languageCodeFromLanguage(body.language) || body.language,
      ttsLang: normalizeTtsLanguage(body.ttsLang, body.language),
      languageName: body.languageName,
      origin: body.origin,
      root: body.root,
      domainHint: body.domainHint,
      variants: body.variants,
      ipa: body.ipa,
      simple: body.simple,
      provider: body.provider,
      mimeType,
      byteLength: bytes.length,
      sha256: hash,
      storageKey,
      dataBase64: uint8ArrayToBase64(bytes),
      audioUrl,
      sourceUrl: body.sourceUrl,
      variantNote: body.variantNote,
      trustSignals: body.trustSignals
    }
  };
}

async function readJsonBody(request, maxBodyBytes) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) {
    return { ok: false, status: 413, error: "body-too-large" };
  }

  const text = await request.text();
  if (TEXT_ENCODER.encode(text).length > maxBodyBytes) {
    return { ok: false, status: 413, error: "body-too-large" };
  }

  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, status: 400, error: "invalid-json" };
  }
}

function jsonResponse(body, status, options, origin) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  applyCorsHeaders(headers, options, origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function htmlResponse(body, status, options, origin) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  applyCorsHeaders(headers, options, origin);
  return new Response(body, { status, headers });
}

function applyCorsHeaders(headers, options, origin) {
  const allowOrigin = corsAllowOrigin(origin, options.allowedOrigins);
  if (!allowOrigin) {
    return;
  }

  headers.set("Access-Control-Allow-Origin", allowOrigin);
  if (allowOrigin !== "*") {
    headers.append("Vary", "Origin");
  }
}

async function authorizeAdmin(request, env) {
  const adminToken = String(env.SAYTHIS_ADMIN_TOKEN || "");
  if (!adminToken) {
    return { ok: false, status: 503, error: "admin-token-not-configured" };
  }

  const providedToken = bearerTokenFromAuthorization(request.headers.get("authorization"));
  if (!providedToken) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  return await sha256Hex(TEXT_ENCODER.encode(providedToken)) === await sha256Hex(TEXT_ENCODER.encode(adminToken))
    ? { ok: true }
    : { ok: false, status: 401, error: "unauthorized" };
}

function workerOptions(env = {}) {
  return {
    allowedOrigins: normalizeAllowedOrigins(env.SAYTHIS_ALLOWED_ORIGINS),
    publicBaseUrl: normalizePublicBaseEndpoint(env.SAYTHIS_PUBLIC_BASE_URL),
    audioPublicBaseUrl: normalizePublicBaseEndpoint(env.SAYTHIS_AUDIO_PUBLIC_BASE_URL),
    maxBodyBytes: normalizePositiveInteger(env.SAYTHIS_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    maxAudioBytes: normalizePositiveInteger(env.SAYTHIS_MAX_AUDIO_BYTES, DEFAULT_MAX_AUDIO_BYTES),
    maxPendingSubmissions: normalizePositiveInteger(env.SAYTHIS_MAX_PENDING_SUBMISSIONS, DEFAULT_MAX_PENDING_SUBMISSIONS),
    maxRejectedSubmissions: normalizePositiveInteger(env.SAYTHIS_MAX_REJECTED_SUBMISSIONS, DEFAULT_MAX_REJECTED_SUBMISSIONS),
    approvedExportLimit: normalizePositiveInteger(env.SAYTHIS_APPROVED_EXPORT_LIMIT, DEFAULT_APPROVED_EXPORT_LIMIT),
    maxImportBytes: normalizePositiveInteger(env.SAYTHIS_MAX_IMPORT_BYTES, DEFAULT_MAX_IMPORT_BYTES)
  };
}

function isSharedAudioRequestPath(url) {
  return url.pathname === "/audio/generate" ||
    url.searchParams.get("action") === "audio";
}

function parseJsonValue(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonRows(result, column) {
  return Array.isArray(result?.results)
    ? result.results.map((row) => parseJsonValue(row?.[column])).filter(Boolean)
    : [];
}

function sharedAudioRequestKeys(request = {}) {
  return uniqueLookupKeys([
    request.lookupKey,
    request.term,
    request.display,
    request.sourceForm,
    ...normalizeList(request.aliases),
    ...normalizeList(request.variants)
  ]);
}

function sharedAudioEntryKeys(entry = {}) {
  return uniqueLookupKeys([
    entry.lookupKey,
    entry.term,
    entry.display,
    entry.sourceForm,
    ...normalizeList(entry.aliases),
    ...normalizeList(entry.variants)
  ]);
}

function compatibleApprovedAudioEntry(entry, requestedLang) {
  if (!entry?.audioUrl) {
    return null;
  }

  const entryLang = baseLanguage(entry.ttsLang || entry.language);
  if (requestedLang && entryLang && requestedLang !== entryLang) {
    return null;
  }

  return entry;
}

function uniqueLookupKeys(values = []) {
  return [...new Set(values.map(createLookupKey).filter(Boolean))];
}

function normalizeList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]/);

  return [...new Set(raw.map(normalizeSelection).filter(Boolean))].slice(0, 12);
}

function baseLanguage(value) {
  return (languageCodeFromLanguage(value) || normalizeSelection(value)).toLowerCase().split(/[-_]/)[0];
}

function normalizeAllowedOrigins(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const origins = raw
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);

  return origins.length ? [...new Set(origins)] : ["*"];
}

function corsAllowOrigin(requestOrigin, allowedOrigins = ["*"]) {
  const origins = normalizeAllowedOrigins(allowedOrigins);
  if (origins.includes("*")) {
    return "*";
  }

  const origin = normalizeOrigin(requestOrigin);
  return origin && origins.includes(origin) ? origin : "";
}

function requestOriginAllowed(requestOrigin, allowedOrigins = ["*"]) {
  const origin = normalizeOrigin(requestOrigin);
  return !origin || Boolean(corsAllowOrigin(origin, allowedOrigins));
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

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normalizeArtifactId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .match(/^aud_[a-f0-9]{16,64}$/)?.[0] || "";
}

function decodeBase64Audio(value) {
  const raw = String(value || "").replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, "").replace(/\s+/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return new Uint8Array();
  }

  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function renderWorkerAdminPlaceholder() {
  return `<!doctype html>
<meta charset="utf-8">
<title>SayThis Community Worker</title>
<h1>SayThis Community Worker</h1>
<p>The Cloudflare Worker API is running. Use the extension options page or admin API endpoints for moderation.</p>`;
}
