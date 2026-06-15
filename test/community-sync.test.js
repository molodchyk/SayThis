import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommunitySubmission,
  endpointOriginPattern,
  enqueueSubmission,
  enqueueSubmissionWhenEnabled,
  flushSubmissionQueue,
  mergeApprovedEntries,
  normalizeSyncSettings,
  normalizeApprovedEntries,
  pullApprovedEntries,
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

test("creates optional permission pattern for sync endpoint origin", () => {
  assert.equal(
    endpointOriginPattern("https://example.com/saythis/submit?token=abc"),
    "https://example.com/*"
  );
  assert.equal(endpointOriginPattern("http://example.com/submit"), "");
  assert.equal(endpointOriginPattern("not a url"), "");
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

test("drops empty correction submissions before sync queueing", () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "correction" });
  const queued = enqueueSubmission([], submission);

  assert.equal(submission, null);
  assert.deepEqual(queued, []);
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

test("does not queue submissions until sync is enabled", () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "confirm" });

  assert.deepEqual(enqueueSubmissionWhenEnabled([], submission, {
    communitySyncEnabled: false,
    communityEndpoint: "https://example.com/submit"
  }), []);
  assert.deepEqual(enqueueSubmissionWhenEnabled([], submission, {
    communitySyncEnabled: true,
    communityEndpoint: "http://example.com/submit"
  }), []);

  const queue = enqueueSubmissionWhenEnabled([], submission, {
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/submit"
  });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].lookupKey, "gnocchi");
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

test("normalizes approved community entries", () => {
  const entries = normalizeApprovedEntries({
    entries: [{
      term: "Chiaroscuro",
      sourceForm: "chiaroscuro",
      language: "it",
      confirmations: 8,
      corrections: 2,
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audioUrl: "https://example.com/chiaroscuro.ogg"
    }]
  });

  assert.equal(entries.chiaroscuro.term, "Chiaroscuro");
  assert.equal(entries.chiaroscuro.confirmations, 8);
  assert.equal(entries.chiaroscuro.language, "it");
  assert.equal(entries.chiaroscuro.simple, "kee-ah-roh-SKOO-roh");
});

test("merges approved entries by lookup key", () => {
  const merged = mergeApprovedEntries({
    gnocchi: {
      term: "gnocchi",
      lookupKey: "gnocchi",
      confirmations: 3,
      sourceForm: "gnocchi"
    }
  }, {
    gnocchi: {
      term: "gnocchi",
      lookupKey: "gnocchi",
      confirmations: 9,
      sourceForm: "gnocchi",
      language: "it"
    }
  });

  assert.equal(merged.gnocchi.confirmations, 9);
  assert.equal(merged.gnocchi.language, "it");
});

test("pulls approved entries only when sync is enabled", async () => {
  const skipped = await pullApprovedEntries({
    communitySyncEnabled: false,
    communityEndpoint: "https://example.com/community"
  }, async () => ({ entries: [] }));

  assert.equal(skipped.skipped, true);

  const pulled = await pullApprovedEntries({
    communitySyncEnabled: true,
    communityEndpoint: "https://example.com/community"
  }, async (endpoint) => {
    assert.equal(endpoint, "https://example.com/community");
    return {
      entries: [{
        term: "Saoirse",
        sourceForm: "Saoirse",
        language: "ga",
        confirmations: 12
      }]
    };
  });

  assert.equal(pulled.skipped, false);
  assert.equal(pulled.received, 1);
  assert.equal(pulled.entries.saoirse.language, "ga");
});
