import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyStore } from "../../server/community-store.js";
import { handleCommunityRequest } from "../../server/community-service.js";

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
        root: "Saoirse",
        domainHint: "given names",
        variants: ["studio variant", "studio variant", "regional variant"],
        ipa: "ˈsˠiːɾʲʃə",
        simple: "SEER-sha",
        audioUrl: "https://example.com/saoirse.ogg",
        sourceUrl: "https://example.com/saoirse",
        variantNote: "regional speaker variant",
        trustSignals: ["source-backed", "curator-reviewed"],
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
  assert.equal(response.body.entry.root, "Saoirse");
  assert.equal(response.body.entry.domainHint, "given names");
  assert.deepEqual(response.body.entry.variants, ["studio variant", "regional variant"]);
  assert.equal(response.body.entry.ipa, "ˈsˠiːɾʲʃə");
  assert.equal(response.body.entry.simple, "SEER-sha");
  assert.equal(response.body.entry.audioUrl, "https://example.com/saoirse.ogg");
  assert.equal(response.body.entry.sourceUrl, "https://example.com/saoirse");
  assert.equal(response.body.entry.variantNote, "regional speaker variant");
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "source-backed",
    "curator-reviewed",
    "audio-backed",
    "contributor-confirmed",
    "verified-audio"
  ]);
});

test("stores generated audio artifacts as shared approved pronunciation audio", async () => {
  const audioBytes = Buffer.from("fake audio sample");
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/audio-artifacts",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL",
      provider: "Example voice",
      mimeType: "audio/ogg",
      dataBase64: audioBytes.toString("base64")
    })
  }, createEmptyStore(), {
    adminToken: "secret",
    publicBaseUrl: "https://community.example"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.artifact.mimeType, "audio/ogg");
  assert.equal(response.body.artifact.byteLength, audioBytes.length);
  assert.match(response.body.artifact.audioUrl, /^https:\/\/community\.example\/audio\/aud_[a-f0-9]{32}$/);
  assert.equal(response.body.entry.lookupKey, "exampletown");
  assert.equal(response.body.entry.audioUrl, response.body.artifact.audioUrl);
  assert.equal(response.body.entry.ttsLang, "pl-PL");
  assert.equal(response.body.entry.sourceStatus, "generated-audio");
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "generated-audio",
    "audio-backed"
  ]);

  response = await handleCommunityRequest({
    method: "GET",
    url: "/community?action=approved",
    headers: {},
    body: ""
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.body.entries.length, 1);
  assert.equal(response.body.entries[0].audioUrl, response.store.approved.exampletown.audioUrl);

  const artifactId = response.store.approved.exampletown.audioUrl.split("/").at(-1);
  response = await handleCommunityRequest({
    method: "GET",
    url: `/audio/${artifactId}`,
    headers: {},
    body: ""
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.contentType, "audio/ogg");
  assert.equal(response.cacheControl, "public, max-age=31536000, immutable");
  assert.deepEqual(response.body, audioBytes);
});

test("generates provider audio and stores it as a shared artifact", async () => {
  let synthesizeRequest;
  const ttsProvider = {
    async synthesize(request) {
      synthesizeRequest = request;
      return {
        ok: true,
        provider: "test-tts",
        audio: {
          mimeType: "audio/ogg",
          dataBase64: Buffer.from("paid provider sample").toString("base64")
        },
        voice: {
          languageCode: "pl-PL",
          name: "pl-PL-TestVoice"
        }
      };
    }
  };

  const response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/generate-audio-artifact",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, createEmptyStore(), {
    adminToken: "secret",
    publicBaseUrl: "https://community.example",
    ttsProvider
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted, true);
  assert.deepEqual(synthesizeRequest, {
    text: "Przykladowo",
    term: "Exampletown",
    sourceForm: "Przykladowo",
    language: "pl",
    ttsLang: "pl-PL",
    voiceName: undefined,
    rate: undefined
  });
  assert.equal(response.body.artifact.provider, "pl-PL-TestVoice");
  assert.equal(response.body.entry.ttsLang, "pl-PL");
  assert.equal(response.body.entry.sourceStatus, "generated-audio");
  assert.equal(response.body.entry.audioUrl, response.body.artifact.audioUrl);
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "generated-audio",
    "audio-backed"
  ]);
});

test("reuses approved audio through the public shared audio action", async () => {
  const audioBytes = Buffer.from("shared sample");
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/audio-artifacts",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL",
      provider: "Example voice",
      mimeType: "audio/ogg",
      dataBase64: audioBytes.toString("base64")
    })
  }, createEmptyStore(), {
    adminToken: "secret",
    publicBaseUrl: "https://community.example"
  });

  response = await handleCommunityRequest({
    method: "POST",
    url: "/community?action=audio",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, response.store);

  assert.equal(response.status, 200);
  assert.equal(response.body.reused, true);
  assert.equal(response.body.generated, false);
  assert.equal(response.body.entry.audioUrl, response.store.approved.exampletown.audioUrl);
});

test("public shared audio action generates only when enabled and authorized", async () => {
  const disabled = await handleCommunityRequest({
    method: "POST",
    url: "/community?action=audio",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, createEmptyStore(), {
    publicBaseUrl: "https://community.example"
  });

  assert.equal(disabled.status, 404);
  assert.equal(disabled.body.error, "shared-audio-not-found");

  const missingToken = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: {},
    body: JSON.stringify({
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, createEmptyStore(), {
    publicAudioGenerationEnabled: true,
    publicBaseUrl: "https://community.example"
  });

  assert.equal(missingToken.status, 503);
  assert.equal(missingToken.body.error, "generation-token-not-configured");

  const unauthorized = await handleCommunityRequest({
    method: "POST",
    url: "/audio/generate",
    headers: {},
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
    publicBaseUrl: "https://community.example"
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, "unauthorized");

  const ttsProvider = {
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
  };
  const generated = await handleCommunityRequest({
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
    ttsProvider
  });

  assert.equal(generated.status, 200);
  assert.equal(generated.body.generated, true);
  assert.equal(generated.body.entry.sourceStatus, "generated-audio");
  assert.equal(generated.body.entry.audioUrl, generated.body.artifact.audioUrl);
});

test("generates provider audio from a pending submission and clears it", async () => {
  let store = createEmptyStore();
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_generate_audio",
      term: "Exampletown",
      lookupKey: "exampletown",
      kind: "missing",
      correction: {
        sourceForm: "Przykladowo",
        language: "pl",
        simple: "eg-ZAM-pluh-term"
      }
    })
  }, store);
  store = response.store;

  const ttsProvider = {
    async synthesize() {
      return {
        ok: true,
        audio: {
          mimeType: "audio/ogg",
          dataBase64: Buffer.from("reviewed provider sample").toString("base64")
        },
        voice: {
          languageCode: "pl-PL",
          name: "pl-PL-TestVoice"
        }
      };
    }
  };

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/generate-audio-artifact",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      id: "sub_generate_audio",
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    })
  }, store, {
    adminToken: "secret",
    publicBaseUrl: "https://community.example",
    ttsProvider
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.removedPending, true);
  assert.equal(response.store.pending.length, 0);
  assert.equal(response.store.approved.exampletown.audioUrl, response.body.artifact.audioUrl);
});

test("rejects shared generated audio artifacts without public storage settings", async () => {
  const response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/audio-artifacts",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      term: "Exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      mimeType: "audio/ogg",
      dataBase64: Buffer.from("sample").toString("base64")
    })
  }, createEmptyStore(), {
    adminToken: "secret"
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "public-base-url-required");
  assert.equal(Object.keys(response.store.approved).length, 0);
});

test("does not publish approved entries without pronunciation data", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_missing_only",
      term: "gnocchi",
      lookupKey: "gnocchi",
      kind: "missing"
    })
  }, createEmptyStore());

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({ id: "sub_missing_only" })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 400);
  assert.equal(response.body.approved, false);
  assert.equal(response.body.reason, "insufficient-entry-data");
  assert.equal(response.store.pending.length, 1);
  assert.equal(Object.keys(response.store.approved).length, 0);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      id: "sub_missing_only",
      entry: {
        domainHint: "research"
      }
    })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 400);
  assert.equal(response.body.reason, "insufficient-entry-data");
  assert.equal(response.store.pending.length, 1);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({
      id: "sub_missing_only",
      entry: {
        language: "it",
        simple: "NYOH-kee"
      }
    })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 200);
  assert.equal(response.body.approved, true);
  assert.equal(response.body.entry.simple, "NYOH-kee");
  assert.equal(response.body.entry.language, "it");
  assert.equal(response.store.pending.length, 0);
});

test("approves structured missing requests after review", async () => {
  let response = await handleCommunityRequest({
    method: "POST",
    url: "/community",
    headers: {},
    body: JSON.stringify({
      id: "sub_missing_structured",
      term: "Exampleterm",
      lookupKey: "exampleterm",
      kind: "missing",
      correction: {
        sourceForm: "Exampleterm",
        aliases: ["Example term"],
        language: "la",
        root: "example root",
        domainHint: "research",
        variants: ["field variant", "field variant"],
        simple: "eg-ZAM-pluh-term",
        sourceUrl: "https://example.com/exampleterm"
      }
    })
  }, createEmptyStore());

  assert.equal(response.status, 202);
  assert.equal(response.store.pending[0].correction.root, "example root");
  assert.equal(response.store.pending[0].correction.domainHint, "research");
  assert.deepEqual(response.store.pending[0].correction.variants, ["field variant"]);

  response = await handleCommunityRequest({
    method: "POST",
    url: "/admin/approve",
    headers: { authorization: "Bearer secret" },
    body: JSON.stringify({ id: "sub_missing_structured" })
  }, response.store, { adminToken: "secret" });

  assert.equal(response.status, 200);
  assert.equal(response.body.entry.requests, 1);
  assert.equal(response.body.entry.simple, "eg-ZAM-pluh-term");
  assert.equal(response.body.entry.root, "example root");
  assert.equal(response.body.entry.domainHint, "research");
  assert.deepEqual(response.body.entry.variants, ["field variant"]);
  assert.deepEqual(response.body.entry.aliases, ["Example term"]);
  assert.deepEqual(response.body.entry.trustSignals, [
    "moderator-reviewed",
    "source-backed",
    "requested"
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

test("caps rejected submission history", async () => {
  let store = createEmptyStore();
  for (const id of ["sub_reject_1", "sub_reject_2", "sub_reject_3"]) {
    let response = await handleCommunityRequest({
      method: "POST",
      url: "/community",
      headers: {},
      body: JSON.stringify({
        id,
        term: id,
        lookupKey: id,
        kind: "missing"
      })
    }, store);
    store = response.store;

    response = await handleCommunityRequest({
      method: "POST",
      url: "/admin/reject",
      headers: { authorization: "Bearer secret" },
      body: JSON.stringify({ id, reason: "not pronunciation data" })
    }, store, {
      adminToken: "secret",
      maxRejectedSubmissions: 2
    });
    store = response.store;
  }

  assert.equal(store.rejected.length, 2);
  assert.deepEqual(store.rejected.map((item) => item.id), ["sub_reject_2", "sub_reject_3"]);
});
