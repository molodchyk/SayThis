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

test("rejects plain same-text English public audio generation", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: { authorization: "Bearer client-token" },
    body: JSON.stringify({
      term: "Exampleterm",
      lookupKey: "exampleterm",
      sourceForm: "Exampleterm",
      language: "en",
      ttsLang: "en-US"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
    publicAudioGenerationToken: "client-token",
    publicBaseUrl: "https://community.example",
    ttsProvider: {
      async synthesize() {
        throw new Error("should not synthesize low-value shared audio target");
      }
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid-shared-audio-target");
  assert.equal(Object.keys(response.store.approved).length, 0);
});

test("rejects non-English public audio generation routed to an English provider locale", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: { authorization: "Bearer client-token" },
    body: JSON.stringify({
      term: "Saoirse",
      lookupKey: "saoirse",
      sourceForm: "Saoirse",
      language: "ga",
      ttsLang: "en-IE"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
    publicAudioGenerationToken: "client-token",
    publicBaseUrl: "https://community.example",
    ttsProvider: {
      async synthesize() {
        throw new Error("should not synthesize non-English text with an English provider voice");
      }
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid-shared-audio-target");
  assert.equal(Object.keys(response.store.approved).length, 0);
});

test("labels public generated shared audio without moderator review", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: { authorization: "Bearer client-token" },
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
    publicAudioGenerationToken: "client-token",
    publicBaseUrl: "https://community.example",
    ttsProvider: {
      async synthesize() {
        return {
          ok: true,
          audio: {
            mimeType: "audio/ogg",
            dataBase64: Buffer.from("generated shared sample").toString("base64")
          },
          voice: {
            languageCode: "pl-PL",
            name: "pl-PL-TestVoice"
          }
        };
      }
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.generated, true);
  assert.equal(response.body.entry.sourceStatus, "generated-audio");
  assert.deepEqual(response.body.entry.trustSignals, [
    "service-generated",
    "generated-audio",
    "audio-backed"
  ]);
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
