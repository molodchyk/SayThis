import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyStore
} from "../server/community-store.js";
import {
  createMemoryRateLimiter,
  handleCommunityRequest
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
      language: "it",
      simple: "kee-ah-roh-SKOO-roh"
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
        language: "it",
        simple: "NYOH-kee"
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

  response = await handleCommunityRequest({
    method: "GET",
    url: "/community?action=approved",
    headers: {},
    body: ""
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.body.entries.length, 1);
  assert.equal(response.body.entries[0].lookupKey, "gnocchi");
  assert.equal(response.body.entries[0].simple, "NYOH-kee");
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
