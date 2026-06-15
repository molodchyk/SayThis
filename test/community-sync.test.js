import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommunitySubmission,
  enqueueSubmission,
  flushSubmissionQueue,
  normalizeSyncSettings,
  syncSummary
} from "../src/community-sync.js";

test("normalizes sync settings conservatively", () => {
  assert.deepEqual(normalizeSyncSettings({
    communitySyncEnabled: true,
    communityEndpoint: "http://example.com/submit"
  }), {
    communitySyncEnabled: false,
    communityEndpoint: ""
  });

  assert.deepEqual(normalizeSyncSettings({
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/submit"
  }), {
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/submit"
  });
});

test("creates privacy-scoped community submissions", () => {
  const submission = createCommunitySubmission("Chiaroscuro", {
    kind: "correction",
    sourceForm: "chiaroscuro",
    language: "it",
    simple: "kee-ah-roh-SKOO-roh",
    audioUrl: "https://example.com/audio.ogg"
  }, {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    sourceStatus: "verified-audio",
    confidence: "high"
  });

  assert.equal(submission.term, "Chiaroscuro");
  assert.equal(submission.lookupKey, "chiaroscuro");
  assert.equal(submission.kind, "correction");
  assert.equal(submission.correction.language, "it");
  assert.equal(submission.result.id, "wiktionary:chiaroscuro");
  assert.equal(Object.hasOwn(submission, "url"), false);
  assert.equal(Object.hasOwn(submission, "pageUrl"), false);
});

test("queues submissions and flushes them through a poster", async () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "confirm" });
  const queue = enqueueSubmission([], submission);
  const posted = [];
  const result = await flushSubmissionQueue(queue, {
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/submit"
  }, async (endpoint, item) => {
    posted.push({ endpoint, item });
  });

  assert.equal(posted.length, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.queue.length, 0);
});

test("keeps failed submissions in the queue", async () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "confirm" });
  const queue = enqueueSubmission([], submission);
  const result = await flushSubmissionQueue(queue, {
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/submit"
  }, async () => {
    throw new Error("offline");
  });

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].attempts, 1);
  assert.equal(syncSummary(result.queue).failed, 1);
});

