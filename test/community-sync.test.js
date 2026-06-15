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
  normalizeSubmissionQueue,
  pullApprovedEntries,
  syncSummary
} from "../src/community-sync.js";

test("normalizes sync settings conservatively", () => {
  assert.deepEqual(normalizeSyncSettings({
    communitySyncEnabled: true,
    communityPullEnabled: true,
    communityEndpoint: "http://example.com/submit"
  }), {
    communitySyncEnabled: false,
    communityPullEnabled: false,
    communityEndpoint: ""
  });

  assert.deepEqual(normalizeSyncSettings({
    communitySyncEnabled: true,
    communityPullEnabled: true,
    communityEndpoint: "https://example.com/submit"
  }), {
    communitySyncEnabled: true,
    communityPullEnabled: true,
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
    aliases: ["light-dark", "chiaro scuro"],
    language: "it",
    simple: "kee-ah-roh-SKOO-roh",
    audioUrl: "https://example.com/audio.ogg",
    sourceUrl: "https://example.com/source"
  }, {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    aliases: ["chiaro scuro"],
    language: "it",
    languageName: "Italian",
    origin: "Italian art term",
    pronunciation: {
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audio: [{ url: "https://example.com/audio.ogg" }]
    },
    sources: [{ label: "Source", url: "https://example.com/source" }],
    sourceStatus: "verified-audio",
    confidence: "high"
  });

  assert.equal(submission.term, "Chiaroscuro");
  assert.equal(submission.lookupKey, "chiaroscuro");
  assert.equal(submission.kind, "correction");
  assert.equal(submission.correction.language, "it");
  assert.deepEqual(submission.correction.aliases, ["light-dark", "chiaro scuro"]);
  assert.equal(submission.correction.sourceUrl, "https://example.com/source");
  assert.equal(submission.result.id, "wiktionary:chiaroscuro");
  assert.deepEqual(submission.result.aliases, ["chiaro scuro"]);
  assert.equal(submission.result.origin, "Italian art term");
  assert.equal(submission.result.ipa, "kjaroˈskuːro");
  assert.equal(submission.result.simple, "kee-ah-roh-SKOO-roh");
  assert.equal(submission.result.audioUrl, "https://example.com/audio.ogg");
  assert.equal(submission.result.sourceUrl, "https://example.com/source");
  assert.equal(Object.hasOwn(submission, "url"), false);
  assert.equal(Object.hasOwn(submission, "pageUrl"), false);
});

test("drops empty correction submissions before sync queueing", () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "correction" });
  const queued = enqueueSubmission([], submission);

  assert.equal(submission, null);
  assert.deepEqual(queued, []);
});

test("drops unsafe links from shared correction submissions", () => {
  const submission = createCommunitySubmission("gnocchi", {
    kind: "correction",
    simple: "NYOH-kee",
    audioUrl: "chrome-extension://extension-id/audio.ogg",
    sourceUrl: "http://example.com/source"
  }, {
    pronunciation: {
      audio: [{ url: "chrome-extension://extension-id/result.ogg" }]
    },
    sources: [{ url: "http://example.com/result" }]
  });

  assert.equal(submission.correction.audioUrl, "");
  assert.equal(submission.correction.sourceUrl, "");
  assert.equal(submission.result.audioUrl, "");
  assert.equal(submission.result.sourceUrl, "");
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

test("normalizes queued submissions without request metadata", () => {
  const queue = normalizeSubmissionQueue([{
    schemaVersion: 9,
    id: " sub_dirty ",
    createdAt: " 2026-01-01T00:00:00.000Z ",
    term: " Chiaroscuro ",
    lookupKey: "chiaroscuro",
    kind: "correction",
    correction: {
      sourceForm: " chiaroscuro ",
      aliases: "light-dark; light-dark",
      simple: "kee-ah-roh-SKOO-roh",
      sourceUrl: " https://example.com/source "
    },
    result: {
      id: "wiktionary:chiaroscuro",
      display: "chiaroscuro",
      sourceForm: "chiaroscuro",
      language: "it",
      sourceStatus: "verified-audio",
      confidence: "high",
      pageUrl: "https://private.example/page"
    },
    attempts: "2.8",
    lastAttemptAt: " 2026-01-02T00:00:00.000Z ",
    lastError: " offline ",
    pageUrl: "https://private.example/page",
    headers: { cookie: "secret" }
  }, {
    id: "bad",
    lookupKey: "bad",
    kind: "chat",
    pageUrl: "https://private.example/bad"
  }]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].schemaVersion, 1);
  assert.equal(queue[0].id, "sub_dirty");
  assert.equal(queue[0].term, "Chiaroscuro");
  assert.equal(queue[0].attempts, 2);
  assert.deepEqual(queue[0].correction.aliases, ["light-dark"]);
  assert.equal(queue[0].correction.sourceUrl, "https://example.com/source");
  assert.equal(queue[0].result.id, "wiktionary:chiaroscuro");
  assert.equal(Object.hasOwn(queue[0], "pageUrl"), false);
  assert.equal(Object.hasOwn(queue[0], "headers"), false);
  assert.equal(Object.hasOwn(queue[0].result, "pageUrl"), false);
});

test("normalizes approved community entries", () => {
  const entries = normalizeApprovedEntries({
    entries: [{
      term: "Chiaroscuro",
      aliases: ["light-dark"],
      trustSignals: ["source-backed", "source-backed", "moderator-reviewed"],
      sourceForm: "chiaroscuro",
      language: "it",
      confirmations: 8,
      corrections: 2,
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audioUrl: "https://example.com/chiaroscuro.ogg",
      sourceUrl: "https://example.com/chiaroscuro"
    }]
  });

  assert.equal(entries.chiaroscuro.term, "Chiaroscuro");
  assert.equal(entries.chiaroscuro.confirmations, 8);
  assert.deepEqual(entries.chiaroscuro.aliases, ["light-dark"]);
  assert.deepEqual(entries.chiaroscuro.trustSignals, ["source-backed", "moderator-reviewed"]);
  assert.equal(entries.chiaroscuro.language, "it");
  assert.equal(entries.chiaroscuro.simple, "kee-ah-roh-SKOO-roh");
  assert.equal(entries.chiaroscuro.sourceUrl, "https://example.com/chiaroscuro");
});

test("keeps object-map keys for sparse approved entries", () => {
  const entries = normalizeApprovedEntries({
    entries: {
      sparseapproved: {
        confirmations: 5,
        sourceForm: "Sparse Approved"
      }
    }
  });

  assert.deepEqual(Object.keys(entries), ["sparseapproved"]);
  assert.equal(entries.sparseapproved.term, "Sparse Approved");
  assert.equal(entries.sparseapproved.lookupKey, "sparseapproved");
  assert.equal(entries.sparseapproved.confirmations, 5);
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

test("pulls approved entries when refresh is enabled", async () => {
  const skipped = await pullApprovedEntries({
    communitySyncEnabled: true,
    communityPullEnabled: false,
    communityEndpoint: "https://example.com/community"
  }, async () => ({ entries: [] }));

  assert.equal(skipped.skipped, true);

  const pulled = await pullApprovedEntries({
    communitySyncEnabled: false,
    communityPullEnabled: true,
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
