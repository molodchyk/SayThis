import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyStore } from "../../server/community-store.js";
import { handleCommunityRequest } from "../../server/community-service.js";
import { createLocalAudioObjectStore } from "../../server/audio/audio-object-store.js";

test("stores generated audio bytes outside metadata when an object store is configured", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "saythis-audio-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const audioObjectStore = createLocalAudioObjectStore({ rootDir });
  const audioBytes = Buffer.from("file backed shared source form sample");

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
    publicBaseUrl: "https://community.example",
    audioPublicBaseUrl: "https://cdn.example/saythis-audio",
    audioObjectStore
  });

  assert.equal(response.status, 200);
  const artifact = response.store.audioArtifacts[response.body.artifact.id];
  assert.equal("dataBase64" in artifact, false);
  assert.match(artifact.storageKey, /^audio\/sha256\/[a-f0-9]{64}\.ogg$/);
  assert.equal(artifact.audioUrl, `https://cdn.example/saythis-audio/${artifact.storageKey}`);
  assert.deepEqual(await readFile(join(rootDir, ...artifact.storageKey.split("/"))), audioBytes);

  response = await handleCommunityRequest({
    method: "GET",
    url: `/audio/${artifact.id}`,
    headers: {},
    body: ""
  }, response.store, { audioObjectStore });

  assert.equal(response.status, 200);
  assert.equal(response.contentType, "audio/ogg");
  assert.deepEqual(response.body, audioBytes);
});

test("rejects direct public audio URLs without configured object storage", async () => {
  const response = await handleCommunityRequest({
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
      dataBase64: Buffer.from("shared source form sample").toString("base64")
    })
  }, createEmptyStore(), {
    adminToken: "secret",
    publicBaseUrl: "https://community.example",
    audioPublicBaseUrl: "https://cdn.example/saythis-audio"
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.error, "audio-object-store-not-configured");
  assert.deepEqual(response.store.audioArtifacts, {});
});
