import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyStore
} from "../server/community-store.js";
import {
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
