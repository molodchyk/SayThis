import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyStore } from "../../server/community-store.js";
import { handleCommunityRequest } from "../../server/community-service.js";

test("reuses approved audio through source form and language match", async () => {
  let response = await storeAudioArtifact({
    language: "pl",
    ttsLang: "pl-PL"
  });

  response = await requestSharedAudio(response.store, {
    language: "pl",
    ttsLang: "pl-PL"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.reused, true);
  assert.equal(response.body.generated, false);
  assert.equal(response.body.entry.lookupKey, "existingspelling");
  assert.equal(response.body.entry.audioUrl, response.store.approved.existingspelling.audioUrl);
});

test("does not reuse approved source-form audio across languages", async () => {
  let response = await storeAudioArtifact({
    language: "it",
    ttsLang: "it-IT"
  });

  response = await requestSharedAudio(response.store, {
    language: "pl",
    ttsLang: "pl-PL"
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "shared-audio-not-found");
});

async function storeAudioArtifact(overrides = {}) {
  return handleCommunityRequest({
    method: "POST",
    url: "/admin/audio-artifacts",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      term: "Existing spelling",
      lookupKey: "existingspelling",
      sourceForm: "Przykladowo",
      provider: "Example voice",
      mimeType: "audio/ogg",
      dataBase64: Buffer.from("shared source form sample").toString("base64"),
      ...overrides
    })
  }, createEmptyStore(), {
    adminToken: "secret",
    publicBaseUrl: "https://community.example"
  });
}

async function requestSharedAudio(store, overrides = {}) {
  return handleCommunityRequest({
    method: "POST",
    url: "/community?action=audio",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      ...overrides
    })
  }, store);
}
