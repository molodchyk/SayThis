import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyStore
} from "../server/community-store.js";
import {
  adminTokenMatches,
  corsAllowOrigin,
  createMemoryRateLimiter,
  handleCommunityRequest,
  normalizeAllowedOrigins
} from "../server/community-service.js";

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
  assert.equal(response.body.entries[0].sourceUrl, "https://example.com/gnocchi");
});

test("approves confirmed resolver metadata into shared entries", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_confirm_metadata",
      term: "Saoirse",
      lookupKey: "saoirse",
      kind: "confirm",
      result: {
        id: "wikidata:saoirse",
        display: "Saoirse",
        sourceForm: "Saoirse",
        aliases: ["Sersha"],
        language: "ga",
        languageName: "Irish",
        origin: "given name",
        ipa: "ˈsˠiːɾʲʃə",
        simple: "SEER-sha",
        audioUrl: "https://example.com/saoirse.ogg",
        sourceUrl: "https://example.com/saoirse",
        sourceStatus: "verified-audio",
        confidence: "high"
      }
    })
  }, createEmptyStore());

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({ id: "sub_confirm_metadata" })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 200);
  assert.equal(response.body.entry.lookupKey, "saoirse");
  assert.deepEqual(response.body.entry.aliases, ["Sersha"]);
  assert.equal(response.body.entry.language, "ga");
  assert.equal(response.body.entry.origin, "given name");
  assert.equal(response.body.entry.ipa, "ˈsˠiːɾʲʃə");
  assert.equal(response.body.entry.simple, "SEER-sha");
  assert.equal(response.body.entry.audioUrl, "https://example.com/saoirse.ogg");
  assert.equal(response.body.entry.sourceUrl, "https://example.com/saoirse");
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "source-backed",
    "audio-backed",
    "contributor-confirmed",
    "verified-audio"
  ]);
});

test("rejects pending submissions with admin token", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_reject",
      term: "bad",
      lookupKey: "bad",
      kind: "missing"
    })
  }, createEmptyStore());

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/reject",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({ id: "sub_reject", reason: "not pronunciation data" })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 200);
  assert.equal(response.body.rejected, true);
  assert.equal(response.store.pending.length, 0);
  assert.equal(response.store.rejected.length, 1);
});
