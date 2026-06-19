import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryCommunityStore,
  handleWorkerRequest
} from "../../worker/community-worker.js";

test("stores moderator audio in R2 and reuses it through shared audio lookup", async () => {
  const audioBucket = createMemoryR2Bucket();
  const env = createWorkerEnv({ audioBucket });
  const audioBytes = new TextEncoder().encode("reviewed shared source form sample");

  const uploadResponse = await handleWorkerRequest(jsonRequest("https://community.example/admin/audio-artifacts", {
    method: "POST",
    token: "secret",
    body: {
      term: "Existing spelling",
      lookupKey: "existingspelling",
      sourceForm: "Przykladowo",
      aliases: ["Exampletown"],
      language: "Polish",
      ttsLang: "Polish",
      provider: "pl-PL-TestVoice",
      mimeType: "audio/ogg",
      dataBase64: base64(audioBytes)
    }
  }), env);

  assert.equal(uploadResponse.status, 200);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.accepted, true);
  assert.match(uploaded.artifact.audioUrl, /^https:\/\/audio\.example\/audio\/sha256\/[a-f0-9]{64}\.ogg$/);
  assert.equal(audioBucket.objects.size, 1);

  const sharedResponse = await handleWorkerRequest(jsonRequest("https://community.example/community?action=audio", {
    method: "POST",
    body: {
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    }
  }), env);

  assert.equal(sharedResponse.status, 200);
  const shared = await sharedResponse.json();
  assert.equal(shared.reused, true);
  assert.equal(shared.generated, false);
  assert.equal(shared.entry.audioUrl, uploaded.entry.audioUrl);
  assert.equal(shared.entry.provider, "pl-PL-TestVoice");

  const artifactResponse = await handleWorkerRequest(new Request(`https://community.example/audio/${uploaded.artifact.id}`), env);
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.headers.get("content-type"), "audio/ogg");
  assert.equal(artifactResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.deepEqual(new Uint8Array(await artifactResponse.arrayBuffer()), audioBytes);
});

test("public shared audio requests only reuse approved audio", async () => {
  const audioBucket = createMemoryR2Bucket();
  const env = createWorkerEnv({ audioBucket });

  const response = await handleWorkerRequest(jsonRequest("https://community.example/community?action=audio", {
    method: "POST",
    body: {
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    }
  }), env);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "shared-audio-not-found" });
  assert.equal(audioBucket.objects.size, 0);
});

test("accepts pending submissions and approves them into exported entries", async () => {
  const env = createWorkerEnv();

  const submitResponse = await handleWorkerRequest(jsonRequest("https://community.example/community", {
    method: "POST",
    body: {
      id: "sub_example",
      kind: "confirm",
      term: "Exampletown",
      lookupKey: "exampletown",
      result: {
        display: "Exampletown",
        sourceForm: "Przykladowo",
        language: "pl",
        ttsLang: "pl-PL",
        simple: "pshih-KWAH-doh-vo"
      }
    }
  }), env);

  assert.equal(submitResponse.status, 202);
  assert.equal((await submitResponse.json()).accepted, true);

  const pendingResponse = await handleWorkerRequest(new Request("https://community.example/admin/pending", {
    headers: { authorization: "Bearer secret" }
  }), env);
  assert.equal(pendingResponse.status, 200);
  assert.equal((await pendingResponse.json()).pending.length, 1);

  const approveResponse = await handleWorkerRequest(jsonRequest("https://community.example/admin/approve", {
    method: "POST",
    token: "secret",
    body: { id: "sub_example" }
  }), env);
  assert.equal(approveResponse.status, 200);
  assert.equal((await approveResponse.json()).approved, true);

  const approvedResponse = await handleWorkerRequest(new Request("https://community.example/community?action=approved"), env);
  assert.equal(approvedResponse.status, 200);
  const approved = await approvedResponse.json();
  assert.equal(approved.entries.length, 1);
  assert.equal(approved.entries[0].sourceForm, "Przykladowo");
});

test("imports approved local store metadata through an admin-only endpoint", async () => {
  const env = createWorkerEnv();
  const response = await handleWorkerRequest(jsonRequest("https://community.example/admin/import-approved", {
    method: "POST",
    token: "secret",
    body: {
      approved: {
        existingspelling: {
          term: "Existing spelling",
          lookupKey: "existingspelling",
          sourceForm: "Przykladowo",
          aliases: ["Exampletown"],
          language: "pl",
          ttsLang: "pl-PL",
          audioUrl: "https://audio.example/audio/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ogg",
          provider: "pl-PL-TestVoice",
          sourceStatus: "generated-audio",
          trustSignals: ["moderator-reviewed", "generated-audio", "audio-backed"]
        }
      },
      audioArtifacts: {
        aud_aaaaaaaaaaaaaaaa: {
          id: "aud_aaaaaaaaaaaaaaaa",
          term: "Existing spelling",
          lookupKey: "existingspelling",
          sourceForm: "Przykladowo",
          language: "pl",
          ttsLang: "pl-PL",
          provider: "pl-PL-TestVoice",
          mimeType: "audio/ogg",
          byteLength: 10,
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          storageKey: "audio/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ogg",
          audioUrl: "https://audio.example/audio/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ogg"
        }
      }
    }
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    imported: true,
    approved: 1,
    audioArtifacts: 1
  });

  const sharedResponse = await handleWorkerRequest(jsonRequest("https://community.example/community?action=audio", {
    method: "POST",
    body: {
      term: "Exampletown",
      lookupKey: "exampletown",
      sourceForm: "Przykladowo",
      language: "pl",
      ttsLang: "pl-PL"
    }
  }), env);

  assert.equal(sharedResponse.status, 200);
  assert.equal((await sharedResponse.json()).entry.provider, "pl-PL-TestVoice");
});

function createWorkerEnv(options = {}) {
  return {
    SAYTHIS_STORE: createMemoryCommunityStore(),
    SAYTHIS_AUDIO_BUCKET: options.audioBucket || createMemoryR2Bucket(),
    SAYTHIS_ADMIN_TOKEN: "secret",
    SAYTHIS_ALLOWED_ORIGINS: "*",
    SAYTHIS_AUDIO_PUBLIC_BASE_URL: "https://audio.example/",
    SAYTHIS_MAX_AUDIO_BYTES: "524288"
  };
}

function jsonRequest(url, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };
  return new Request(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
}

function createMemoryR2Bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, {
        bytes,
        httpMetadata: options.httpMetadata || {}
      });
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }

      return {
        body: new Blob([object.bytes]).stream(),
        writeHttpMetadata(headers) {
          if (object.httpMetadata.contentType) {
            headers.set("Content-Type", object.httpMetadata.contentType);
          }
          if (object.httpMetadata.cacheControl) {
            headers.set("Cache-Control", object.httpMetadata.cacheControl);
          }
        }
      };
    }
  };
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}
