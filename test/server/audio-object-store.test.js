import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createS3CompatibleAudioObjectStore,
  createLocalAudioObjectStore,
  normalizeAudioStorageKey,
  persistAudioArtifactBytes,
  readAudioArtifactBytes
} from "../../server/audio/audio-object-store.js";

test("normalizes only deterministic audio object storage keys", () => {
  const hash = "a".repeat(64);
  assert.equal(
    normalizeAudioStorageKey(`audio\\sha256\\${hash}.mp3`),
    `audio/sha256/${hash}.mp3`
  );
  assert.equal(normalizeAudioStorageKey(`audio/sha256/${hash}.exe`), "");
  assert.equal(normalizeAudioStorageKey(`audio/sha256/../${hash}.mp3`), "");
});

test("stores and reads audio objects from a local file root", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "saythis-audio-object-"));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const store = createLocalAudioObjectStore({ rootDir });
  const bytes = Buffer.from("pronunciation bytes");
  const artifact = {
    storageKey: `audio/sha256/${"b".repeat(64)}.ogg`,
    dataBase64: bytes.toString("base64")
  };

  const persisted = await persistAudioArtifactBytes(artifact, store);

  assert.equal(persisted.ok, true);
  assert.equal(persisted.artifact.storageKey, artifact.storageKey);
  assert.equal(persisted.artifact.dataBase64, "");
  assert.deepEqual(await readAudioArtifactBytes(persisted.artifact, store), bytes);
});

test("stores and reads audio objects through an S3-compatible bucket", async () => {
  const calls = [];
  const store = createS3CompatibleAudioObjectStore({
    endpoint: "https://r2.example.com",
    bucket: "saythis-audio",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    now: new Date("2026-06-19T00:00:00.000Z"),
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (init.method === "GET") {
        const bytes = Buffer.from("remote pronunciation bytes");
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        };
      }

      return { ok: true, status: 200 };
    }
  });
  const bytes = Buffer.from("uploaded pronunciation bytes");
  const storageKey = `audio/sha256/${"c".repeat(64)}.mp3`;

  const persisted = await persistAudioArtifactBytes({
    storageKey,
    mimeType: "audio/mpeg",
    dataBase64: bytes.toString("base64")
  }, store);

  assert.equal(persisted.ok, true);
  assert.equal(persisted.artifact.storageKey, storageKey);
  assert.equal(persisted.artifact.dataBase64, "");
  assert.equal(calls[0].url, `https://r2.example.com/saythis-audio/${storageKey}`);
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(calls[0].init.headers["content-type"], "audio/mpeg");
  assert.equal(calls[0].init.headers["x-amz-date"], "20260619T000000Z");
  assert.match(calls[0].init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access-key\/20260619\/auto\/s3\/aws4_request,/);

  assert.deepEqual(await readAudioArtifactBytes(persisted.artifact, store), Buffer.from("remote pronunciation bytes"));
  assert.equal(calls[1].url, `https://r2.example.com/saythis-audio/${storageKey}`);
  assert.equal(calls[1].init.method, "GET");
});
