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
    ttsLang: "it-IT",
    root: "chiaro + oscuro",
    domainHint: "art history",
    simple: "kee-ah-roh-SKOO-roh",
    audioUrl: "https://example.com/audio.ogg",
    sourceUrl: "https://example.com/source"
  }, {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    aliases: ["chiaro scuro"],
    variants: ["studio variant", "studio variant", "regional variant"],
    language: "it",
    ttsLang: "it-IT",
    languageName: "Italian",
    origin: "Italian art term",
    root: "chiaro + oscuro",
    domainHint: "visual arts",
    pronunciation: {
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audio: [{ url: "https://example.com/audio.ogg" }]
    },
    sources: [{ label: "Source", url: "https://example.com/source" }],
    notes: "Regional studio variant",
    trustSignals: ["source-backed", "moderator-reviewed"],
    sourceStatus: "verified-audio",
    confidence: "high"
  });

  assert.equal(submission.term, "Chiaroscuro");
  assert.equal(submission.lookupKey, "chiaroscuro");
  assert.equal(submission.kind, "correction");
  assert.equal(submission.correction.language, "it");
  assert.equal(submission.correction.ttsLang, "it-IT");
  assert.deepEqual(submission.correction.aliases, ["light-dark", "chiaro scuro"]);
  assert.equal(submission.correction.root, "chiaro + oscuro");
  assert.equal(submission.correction.domainHint, "art history");
  assert.equal(submission.correction.sourceUrl, "https://example.com/source");
  assert.equal(submission.result.id, "wiktionary:chiaroscuro");
  assert.deepEqual(submission.result.aliases, ["chiaro scuro"]);
  assert.deepEqual(submission.result.variants, ["studio variant", "regional variant"]);
  assert.equal(submission.result.origin, "Italian art term");
  assert.equal(submission.result.root, "chiaro + oscuro");
  assert.equal(submission.result.ttsLang, "it-IT");
  assert.equal(submission.result.domainHint, "visual arts");
  assert.equal(submission.result.ipa, "kjaroˈskuːro");
  assert.equal(submission.result.simple, "kee-ah-roh-SKOO-roh");
  assert.equal(submission.result.audioUrl, "https://example.com/audio.ogg");
  assert.equal(submission.result.sourceUrl, "https://example.com/source");
  assert.equal(submission.result.variantNote, "Regional studio variant");
  assert.deepEqual(submission.result.trustSignals, ["source-backed", "moderator-reviewed"]);
  assert.equal(Object.hasOwn(submission, "url"), false);
  assert.equal(Object.hasOwn(submission, "pageUrl"), false);
});

test("stores the best shareable result audio in community submissions", () => {
  const submission = createCommunitySubmission("Chiaroscuro", { kind: "confirm" }, {
    pronunciation: {
      audio: [{
        url: "https://example.com/generated.ogg",
        quality: "generated",
        source: "Cloud TTS"
      }, {
        url: "chrome-extension://extension-id/curated.ogg",
        quality: "curated",
        source: "Packaged audio"
      }, {
        url: "https://example.com/source-backed.ogg",
        quality: "source-backed",
        source: "Wiktionary"
      }]
    }
  });

  assert.equal(submission.result.audioUrl, "https://example.com/source-backed.ogg");
});

test("drops empty correction submissions before sync queueing", () => {
  const submission = createCommunitySubmission("gnocchi", { kind: "correction" });
  const queued = enqueueSubmission([], submission);

  assert.equal(submission, null);
  assert.deepEqual(queued, []);
});

test("keeps structured missing request metadata for moderation", () => {
  const submission = createCommunitySubmission("Unknownterm", {
    kind: "missing",
    sourceForm: "Unknownterm",
    aliases: "Unknown term; Unknownterm",
    language: "la",
    root: "unknown root",
    domainHint: "research",
    variants: "research variant; field variant",
    simple: "un-NOHN-term",
    sourceUrl: "https://example.com/unknownterm"
  });
  const queue = normalizeSubmissionQueue([submission]);

  assert.equal(submission.kind, "missing");
  assert.equal(submission.correction.sourceForm, "Unknownterm");
  assert.deepEqual(submission.correction.aliases, ["Unknown term", "Unknownterm"]);
  assert.equal(submission.correction.root, "unknown root");
  assert.equal(submission.correction.domainHint, "research");
  assert.deepEqual(submission.correction.variants, ["research variant", "field variant"]);
  assert.equal(queue[0].correction.simple, "un-NOHN-term");
  assert.equal(queue[0].correction.sourceUrl, "https://example.com/unknownterm");
});

test("keeps plain missing requests lightweight", () => {
  const submission = createCommunitySubmission("Unknownterm", { kind: "missing" });
  const queue = normalizeSubmissionQueue([submission]);

  assert.equal(submission.kind, "missing");
  assert.deepEqual(submission.correction, {});
  assert.deepEqual(queue[0].correction, {});
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
      ttsLang: " it-IT ",
      aliases: "light-dark; light-dark",
      root: " chiaro + oscuro ",
      domainHint: " art history ",
      variants: "studio variant; studio variant",
      simple: "kee-ah-roh-SKOO-roh",
      sourceUrl: " https://example.com/source "
    },
    result: {
      id: "wiktionary:chiaroscuro",
      display: "chiaroscuro",
      sourceForm: "chiaroscuro",
      language: "it",
      ttsLang: "it-IT",
      root: "chiaro + oscuro",
      domainHint: "visual arts",
      variants: ["regional variant", "regional variant"],
      variantNote: "Regional studio variant",
      trustSignals: ["source-backed", "source-backed"],
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
  assert.equal(queue[0].correction.root, "chiaro + oscuro");
  assert.equal(queue[0].correction.ttsLang, "it-IT");
  assert.equal(queue[0].correction.domainHint, "art history");
  assert.deepEqual(queue[0].correction.variants, ["studio variant"]);
  assert.equal(queue[0].correction.sourceUrl, "https://example.com/source");
  assert.equal(queue[0].result.id, "wiktionary:chiaroscuro");
  assert.equal(queue[0].result.root, "chiaro + oscuro");
  assert.equal(queue[0].result.ttsLang, "it-IT");
  assert.equal(queue[0].result.domainHint, "visual arts");
  assert.deepEqual(queue[0].result.variants, ["regional variant"]);
  assert.equal(queue[0].result.variantNote, "Regional studio variant");
  assert.deepEqual(queue[0].result.trustSignals, ["source-backed"]);
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
      ttsLang: "it-IT",
      root: "chiaro + oscuro",
      domainHint: "art history",
      variants: "studio variant; regional variant; studio variant",
      confirmations: 8,
      corrections: 2,
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh",
      audioUrl: "https://example.com/chiaroscuro.ogg",
      sourceUrl: "https://example.com/chiaroscuro",
      sourceStatus: "verified-audio"
    }]
  });

  assert.equal(entries.chiaroscuro.term, "Chiaroscuro");
  assert.equal(entries.chiaroscuro.confirmations, 8);
  assert.deepEqual(entries.chiaroscuro.aliases, ["light-dark"]);
  assert.deepEqual(entries.chiaroscuro.trustSignals, ["source-backed", "moderator-reviewed"]);
  assert.equal(entries.chiaroscuro.language, "it");
  assert.equal(entries.chiaroscuro.ttsLang, "it-IT");
  assert.equal(entries.chiaroscuro.sourceStatus, "verified-audio");
  assert.equal(entries.chiaroscuro.root, "chiaro + oscuro");
  assert.equal(entries.chiaroscuro.domainHint, "art history");
  assert.deepEqual(entries.chiaroscuro.variants, ["studio variant", "regional variant"]);
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
