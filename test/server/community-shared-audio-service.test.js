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

test("normalizes stored audio artifact language names for reuse", async () => {
  let response = await storeAudioArtifact({
    language: "Polish",
    ttsLang: "Polish"
  });

  assert.equal(response.body.entry.language, "pl");
  assert.equal(response.body.entry.ttsLang, "pl-PL");

  response = await requestSharedAudio(response.store, {
    language: "pl",
    ttsLang: "pl-PL"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.reused, true);
  assert.equal(response.body.entry.ttsLang, "pl-PL");
});

test("stores generated audio artifacts with loopback URLs for local development", async () => {
  const response = await storeAudioArtifact({
    language: "pl",
    ttsLang: "pl-PL"
  }, "http://127.0.0.1:8787");

  assert.equal(response.status, 200);
  assert.match(response.body.artifact.audioUrl, /^http:\/\/127\.0\.0\.1:8787\/audio\/aud_[a-f0-9]{32}$/);
  assert.equal(response.body.entry.audioUrl, response.body.artifact.audioUrl);
  assert.equal(response.store.approved.existingspelling.audioUrl, response.body.artifact.audioUrl);
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
    headers: {},
    body: JSON.stringify({
      term: "Exampleterm",
      lookupKey: "exampleterm",
      sourceForm: "Exampleterm",
      language: "en",
      ttsLang: "en-US"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
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
    headers: {},
    body: JSON.stringify({
      term: "Saoirse",
      lookupKey: "saoirse",
      sourceForm: "Saoirse",
      language: "ga",
      ttsLang: "en-IE"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
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

test("rejects public audio generation before budget when provider is unavailable", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "Polish",
      ttsLang: "Polish"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
    publicAudioGenerationLimit: 1,
    publicBaseUrl: "https://community.example",
    ttsProvider: {
      configured: false,
      async synthesize() {
        throw new Error("should not synthesize without provider credentials");
      }
    }
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.error, "tts-provider-not-configured");
  assert.deepEqual(response.store.generationUsage, {});
});

test("labels public generated shared audio without moderator review", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "Polish",
      ttsLang: "Polish"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
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
  assert.equal(response.body.entry.provider, "pl-PL-TestVoice");
  assert.equal(response.body.entry.language, "pl");
  assert.equal(response.body.entry.ttsLang, "pl-PL");
  assert.equal(response.body.entry.sourceStatus, "generated-audio");
  assert.deepEqual(response.body.entry.trustSignals, [
    "service-generated",
    "generated-audio",
    "audio-backed"
  ]);
});

test("limits public provider generation before synthesis", async () => {
  let calls = 0;
  const ttsProvider = {
    async synthesize(request) {
      calls += 1;
      return {
        ok: true,
        audio: {
          mimeType: "audio/ogg",
          dataBase64: Buffer.from(`generated shared sample ${request.text}`).toString("base64")
        },
        voice: {
          languageCode: "pl-PL",
          name: "pl-PL-TestVoice"
        }
      };
    }
  };
  const options = {
    publicAudioGenerationEnabled: true,
    publicBaseUrl: "https://community.example",
    publicAudioGenerationLimit: 1,
    publicAudioGenerationWindowMs: 60_000,
    now: () => Date.parse("2026-01-01T00:00:00.000Z"),
    ttsProvider
  };

  let response = await handleCommunityRequest(sharedGenerationRequest({
    term: "Exampletown",
    lookupKey: "exampletown",
    sourceForm: "Przykladowo"
  }), createEmptyStore(), options);

  assert.equal(response.status, 200);
  assert.equal(response.body.generated, true);
  assert.equal(calls, 1);

  response = await handleCommunityRequest(sharedGenerationRequest({
    term: "Secondtown",
    lookupKey: "secondtown",
    sourceForm: "Drugie"
  }), response.store, options);

  assert.equal(response.status, 429);
  assert.equal(response.body.error, "generation-budget-exhausted");
  assert.equal(response.body.resetAt, "2026-01-01T00:01:00.000Z");
  assert.equal(calls, 1);
  assert.equal(response.store.generationUsage.publicAudioGeneration.count, 1);
});

async function storeAudioArtifact(overrides = {}, publicBaseUrl = "https://community.example") {
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
    publicBaseUrl
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

function sharedGenerationRequest(overrides = {}) {
  return {
    method: "POST",
    url: "/audio/generate",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "Polish",
      ttsLang: "Polish",
      ...overrides
    })
  };
}
