import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createEmptyStore,
  normalizeStore
} from "../../server/community-store.js";
import {
  adminTokenMatches,
  corsAllowOrigin,
  createCommunityServer,
  createMemoryRateLimiter,
  handleCommunityRequest,
  normalizeAllowedOrigins,
  requestOriginAllowed
} from "../../server/community-service.js";

test("accepts browser preflight requests", async () => {
  const result = await handleCommunityRequest({
    method: "OPTIONS",
    url: "/community",
    headers: {},
    body: ""
  }, createEmptyStore());

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test("normalizes allowed CORS origins", () => {
  assert.deepEqual(normalizeAllowedOrigins(""), ["*"]);
  assert.deepEqual(normalizeAllowedOrigins("https://example.com/path, chrome-extension://abcdefghijklmnop/options.html"), [
    "https://example.com",
    "chrome-extension://abcdefghijklmnop"
  ]);
  assert.equal(corsAllowOrigin("https://example.com/page", ["https://example.com"]), "https://example.com");
  assert.equal(corsAllowOrigin("https://other.example/page", ["https://example.com"]), "");
  assert.equal(corsAllowOrigin("chrome-extension://abcdefghijklmnop/popup.html", ["chrome-extension://abcdefghijklmnop"]), "chrome-extension://abcdefghijklmnop");
  assert.equal(requestOriginAllowed("", ["https://example.com"]), true);
  assert.equal(requestOriginAllowed("https://example.com/page", ["https://example.com"]), true);
  assert.equal(requestOriginAllowed("https://other.example/page", ["https://example.com"]), false);
});

test("rejects browser-originated requests from disallowed origins", async () => {
  const blocked = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: { origin: "https://other.example" },
    body: JSON.stringify({
      id: "sub_blocked_origin",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, createEmptyStore(), {
    allowedOrigins: ["https://example.com"]
  });

  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, "origin-not-allowed");
  assert.equal(blocked.store.pending.length, 0);

  const accepted = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: { origin: "https://example.com/page" },
    body: JSON.stringify({
      id: "sub_allowed_origin",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, createEmptyStore(), {
    allowedOrigins: ["https://example.com"]
  });

  assert.equal(accepted.status, 202);
  assert.equal(accepted.store.pending.length, 1);
});

test("normalizes keyed approved store entries without embedded lookup fields", () => {
  const store = normalizeStore({
    approved: {
      sparseapproved: {
        confirmations: 3,
        sourceForm: "Sparse Approved"
      }
    }
  }, "2026-01-01T00:00:00.000Z");

  assert.deepEqual(Object.keys(store.approved), ["sparseapproved"]);
  assert.equal(store.approved.sparseapproved.term, "Sparse Approved");
  assert.equal(store.approved.sparseapproved.lookupKey, "sparseapproved");
  assert.equal(store.approved.sparseapproved.confirmations, 3);
});

test("accepts only matching moderator bearer tokens", () => {
  assert.equal(adminTokenMatches("Bearer secret", "secret"), true);
  assert.equal(adminTokenMatches("Bearer wrong", "secret"), false);
  assert.equal(adminTokenMatches("Token secret", "secret"), false);
  assert.equal(adminTokenMatches("", "secret"), false);
  assert.equal(adminTokenMatches("Bearer secret", ""), false);
});

test("serves a static moderator page without pending data", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_static_page",
      term: "Chiaroscuro",
      lookupKey: "chiaroscuro",
      kind: "missing"
    })
  }, createEmptyStore());

  response = await handleCommunityRequest({
    method: "GET",
    url: "/admin",
    headers: {},
    body: ""
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.contentType, "text/html; charset=utf-8");
  assert.match(response.body, /SayThis Moderator/);
  assert.match(response.body, /Load Pending/);
  assert.match(response.body, /Generate Audio &amp; Approve/);
  assert.match(response.body, /data-input="ttsLang"/);
  assert.match(response.body, /\/admin\/generate-audio-artifact/);
  assert.equal(response.body.includes("Chiaroscuro"), false);
  assert.equal(response.store.pending.length, 1);
});

test("accepts submissions without storing request metadata", async () => {
  const submission = {
    id: "sub_1",
    term: "Chiaroscuro",
    lookupKey: "chiaroscuro",
    kind: "correction",
    correction: {
      sourceForm: "chiaroscuro",
      aliases: ["light-dark"],
      language: "it",
      root: "chiaro + oscuro",
      domainHint: "art history",
      simple: "kee-ah-roh-SKOO-roh",
      sourceUrl: "https://example.com/chiaroscuro"
    }
  };
  const result = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {
      "x-client-address": "127.0.0.1"
    },
    body: JSON.stringify(submission)
  }, createEmptyStore());

  assert.equal(result.status, 202);
  assert.equal(result.body.accepted, true);
  assert.equal(result.store.pending.length, 1);
  assert.equal(Object.hasOwn(result.store.pending[0], "ip"), false);
  assert.equal(Object.hasOwn(result.store.pending[0], "headers"), false);
  assert.deepEqual(result.store.pending[0].correction.aliases, ["light-dark"]);
  assert.equal(result.store.pending[0].correction.root, "chiaro + oscuro");
  assert.equal(result.store.pending[0].correction.domainHint, "art history");
  assert.equal(result.store.pending[0].correction.sourceUrl, "https://example.com/chiaroscuro");
});

test("rejects oversized public submissions without mutating store", async () => {
  const store = createEmptyStore();
  const result = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_large",
      term: "Chiaroscuro",
      lookupKey: "chiaroscuro",
      kind: "missing"
    })
  }, store, { maxBodyBytes: 16 });

  assert.equal(result.status, 413);
  assert.equal(result.body.error, "body-too-large");
  assert.equal(result.store.pending.length, 0);
});

test("rejects empty correction submissions", async () => {
  const result = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_empty_correction",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "correction",
      correction: {}
    })
  }, createEmptyStore());

  assert.equal(result.status, 400);
  assert.equal(result.body.reason, "invalid-submission");
  assert.equal(result.store.pending.length, 0);
});

test("rejects correction submissions with only unsafe links", async () => {
  const result = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_unsafe_link_correction",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "correction",
      correction: {
        sourceUrl: "http://example.com/source"
      }
    })
  }, createEmptyStore());

  assert.equal(result.status, 400);
  assert.equal(result.body.reason, "invalid-submission");
  assert.equal(result.store.pending.length, 0);
});

test("limits repeated public submissions by client", async () => {
  let timestamp = 1000;
  const rateLimiter = createMemoryRateLimiter({
    limit: 1,
    windowMs: 1000,
    now: () => timestamp
  });
  let store = createEmptyStore();

  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    clientKey: "client-a",
    headers: {},
    body: JSON.stringify({
      id: "sub_rate_1",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, store, { rateLimiter });
  assert.equal(response.status, 202);
  store = response.store;

  response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    clientKey: "client-a",
    headers: {},
    body: JSON.stringify({
      id: "sub_rate_2",
      term: "bruschetta",
      lookupKey: "bruschetta",
      kind: "missing"
    })
  }, store, { rateLimiter });

  assert.equal(response.status, 429);
  assert.equal(response.body.error, "rate-limited");
  assert.equal(response.store.pending.length, 1);
  assert.equal(Object.hasOwn(response.store.pending[0], "clientKey"), false);

  timestamp += 1000;
  response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    clientKey: "client-a",
    headers: {},
    body: JSON.stringify({
      id: "sub_rate_3",
      term: "scherzo",
      lookupKey: "scherzo",
      kind: "missing"
    })
  }, response.store, { rateLimiter });

  assert.equal(response.status, 202);
  assert.equal(response.store.pending.length, 2);
});

test("trusts proxy rate-limit headers only when enabled", async () => {
  const keys = [];
  const rateLimiter = {
    check(key) {
      keys.push(key);
      return { ok: true, retryAfterMs: 0 };
    }
  };
  const request = {
    method: "POST",
    url: "/community",
    remoteAddress: "203.0.113.10",
    headers: {
      "cf-connecting-ip": "198.51.100.20",
      "x-real-ip": "198.51.100.21"
    },
    body: JSON.stringify({
      id: "sub_proxy_rate",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  };

  await handleCommunityRequest(request, createEmptyStore(), { rateLimiter });
  await handleCommunityRequest({
    ...request,
    body: JSON.stringify({
      id: "sub_proxy_rate_trusted",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, createEmptyStore(), {
    rateLimiter,
    trustProxyHeaders: true
  });

  assert.deepEqual(keys, ["203.0.113.10", "198.51.100.20"]);
});

test("caps pending submissions without rejecting duplicate retries", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_pending_1",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, createEmptyStore(), { maxPendingSubmissions: 1 });

  assert.equal(response.status, 202);
  assert.equal(response.store.pending.length, 1);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_pending_1",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, response.store, { maxPendingSubmissions: 1 });

  assert.equal(response.status, 202);
  assert.equal(response.body.duplicate, true);
  assert.equal(response.store.pending.length, 1);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_pending_2",
      term: "bruschetta",
      lookupKey: "bruschetta",
      kind: "missing"
    })
  }, response.store, { maxPendingSubmissions: 1 });

  assert.equal(response.status, 429);
  assert.equal(response.body.accepted, false);
  assert.equal(response.body.reason, "pending-limit-reached");
  assert.equal(response.store.pending.length, 1);
});

test("serves approved entries and requires auth for moderation", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_approve",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "correction",
      correction: {
        sourceForm: "gnocchi",
        aliases: ["gnocco"],
        language: "it",
        root: "gnocco",
        simple: "NYOH-kee",
        sourceUrl: "https://example.com/gnocchi"
      }
    })
  }, createEmptyStore());

  response = await handleCommunityRequest({
    method: "GET",
    url: "/admin/pending",
    headers: {},
    body: ""
  }, response.store, { adminToken: "secret" });
  assert.equal(response.status, 401);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({ id: "sub_approve" })
  }, response.store, { adminToken: "secret" });
  assert.equal(response.status, 200);
  assert.equal(response.body.approved, true);
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "source-backed",
    "correction-reviewed"
  ]);

  response = await handleCommunityRequest({
    method: "GET",
    url: "/community?action=approved",
    headers: {},
    body: ""
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.body.entries.length, 1);
  assert.equal(response.body.entries[0].lookupKey, "gnocchi");
  assert.deepEqual(response.body.entries[0].aliases, ["gnocco"]);
  assert.deepEqual(response.body.entries[0].trustSignals, [
    "moderator-reviewed",
    "source-backed",
    "correction-reviewed"
  ]);
  assert.equal(response.body.entries[0].simple, "NYOH-kee");
  assert.equal(response.body.entries[0].root, "gnocco");
  assert.equal(response.body.entries[0].sourceUrl, "https://example.com/gnocchi");
});

test("serializes community store writes for concurrent submissions", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "saythis-community-"));
  const storePath = join(dir, "store.json");
  let server;

  t.after(async () => {
    if (server?.listening) {
      await closeServer(server);
    }
    await rm(dir, { recursive: true, force: true });
  });

  server = await createCommunityServer({
    storePath,
    maxPendingSubmissions: 50,
    rateLimiter: {
      check() {
        return { ok: true, retryAfterMs: 0 };
      }
    }
  });
  await listen(server);

  const { port } = server.address();
  const responses = await Promise.all(Array.from({ length: 12 }, (_item, index) => {
    const id = `sub_parallel_${index}`;
    return fetch(`http://127.0.0.1:${port}/community`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        term: id,
        lookupKey: id,
        kind: "missing"
      })
    });
  }));
  const store = JSON.parse(await readFile(storePath, "utf8"));

  assert.deepEqual(responses.map((response) => response.status), Array(12).fill(202));
  assert.equal(store.pending.length, 12);
  assert.deepEqual(store.pending.map((item) => item.id), Array.from({ length: 12 }, (_item, index) => `sub_parallel_${index}`));
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
