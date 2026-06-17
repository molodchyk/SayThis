import assert from "node:assert/strict";
import test from "node:test";
import {
  isCacheableResult,
  normalizeResultCache,
  readCachedResult,
  resultCacheSummary,
  upsertCachedResult
} from "../src/result-cache.js";
import {
  createRemoteStructuredResult,
  resolveTerm
} from "../src/resolver-core.js";

test("stores and reads cacheable online results by lookup key", () => {
  const remote = createRemoteStructuredResult("chiaroscuro", {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    pronunciation: {
      ipa: "kjaroˈskuːro",
      simple: "kee-ah-roh-SKOO-roh"
    },
    evidence: ["Wiktionary pronunciation section"]
  });
  const cache = upsertCachedResult({}, "Chiaroscuro", remote, { now: 1000 });
  const cached = readCachedResult(cache, " chiaroscuro ", { now: 2000 });

  assert.equal(cached.hit, true);
  assert.equal(cached.result.id, "wiktionary:chiaroscuro");
  assert.equal(cached.result.lookupKey, "chiaroscuro");
  assert.equal(cached.result.evidence[0], "Local lookup cache");
  assert.equal(resultCacheSummary(cache, { now: 2000 }).count, 1);
});

test("does not store best-effort fallback results", () => {
  const fallback = resolveTerm("Unknownterm", { entries: [] });
  const cache = upsertCachedResult({}, "Unknownterm", fallback, { now: 1000 });

  assert.equal(isCacheableResult(fallback), false);
  assert.equal(resultCacheSummary(cache).count, 0);
});

test("normalizes cache with ttl and entry limit", () => {
  const first = createRemoteStructuredResult("Alpha", {
    id: "remote:alpha",
    display: "Alpha",
    sourceForm: "Alpha",
    language: "en",
    pronunciation: { simple: "AL-fuh" }
  });
  const second = createRemoteStructuredResult("Beta", {
    id: "remote:beta",
    display: "Beta",
    sourceForm: "Beta",
    language: "en",
    pronunciation: { simple: "BAY-tuh" }
  });
  const third = createRemoteStructuredResult("Gamma", {
    id: "remote:gamma",
    display: "Gamma",
    sourceForm: "Gamma",
    language: "en",
    pronunciation: { simple: "GAM-uh" }
  });

  let cache = upsertCachedResult({}, "Alpha", first, { now: 1000 });
  cache = upsertCachedResult(cache, "Beta", second, { now: 2000 });
  cache = upsertCachedResult(cache, "Gamma", third, { now: 3000 });

  const limited = normalizeResultCache(cache, {
    now: 4000,
    ttlMs: 5000,
    limit: 2
  });
  assert.deepEqual(Object.keys(limited.entries), ["gamma", "beta"]);

  const expired = normalizeResultCache(cache, {
    now: 10000,
    ttlMs: 500,
    limit: 10
  });
  assert.equal(Object.keys(expired.entries).length, 0);
});

test("separates cached results by source scope", () => {
  const first = createRemoteStructuredResult("Athens", {
    id: "remote:athens",
    display: "Athens",
    sourceForm: "Athens",
    language: "en",
    pronunciation: { simple: "ATH-inz" }
  });
  const second = createRemoteStructuredResult("Athens", {
    id: "gazetteer:athens",
    display: "Athens",
    sourceForm: "Αθήνα",
    language: "el",
    pronunciation: { simple: "ah-THEE-nah" }
  });

  let cache = upsertCachedResult({}, "Athens", first, { now: 1000 });
  cache = upsertCachedResult(cache, "Athens", second, {
    now: 2000,
    cacheScope: "gazetteer https://example.com/search"
  });

  const defaultHit = readCachedResult(cache, "Athens", { now: 3000 });
  const scopedHit = readCachedResult(cache, "Athens", {
    now: 3000,
    cacheScope: "gazetteer https://example.com/search"
  });

  assert.equal(defaultHit.result.id, "remote:athens");
  assert.equal(scopedHit.result.id, "gazetteer:athens");
  assert.equal(scopedHit.result.lookupKey, "athens");
  assert.equal(Object.keys(normalizeResultCache(cache, { now: 3000 }).entries).length, 2);
});

test("sanitizes imported cached result payloads", () => {
  const cache = normalizeResultCache({
    entries: {
      dirty: {
        cacheKey: "dirty",
        lookupKey: "dirty",
        term: "Dirty",
        updatedAt: 1000,
        result: {
          id: "remote:dirty",
          query: "Dirty",
          display: "Dirty",
          sourceForm: "Dirty",
          root: "source root",
          domainHint: "research",
          variants: "studio variant; regional variant; studio variant",
          trustSignals: "source-backed; source-backed; moderator-reviewed",
          sourceStatus: "verified-audio",
          confidence: "high",
          variantNote: "Regional pronunciation variant",
          pageUrl: "https://private.example/page",
          headers: { cookie: "secret" },
          pronunciation: {
            simple: "DIR-tee",
            audio: [{
              label: "Audio",
              url: "https://audio.example/dirty.ogg",
              extra: "discard"
            }, {
              label: "Unsafe",
              url: "javascript:alert(1)"
            }]
          },
          sources: [{
            label: "Source",
            url: "https://example.com/dirty"
          }, {
            label: "Unsafe",
            url: "http://example.com/dirty"
          }],
          alternateResults: [{
            display: "Alternate",
            sourceForm: "Alternate",
            root: "alternate root",
            domainHint: "alternate research",
            variants: ["alternate variant"],
            ttsLang: "it-IT",
            pronunciation: { simple: "ALL-ter-nate" },
            pageUrl: "https://private.example/alternate"
          }]
        }
      }
    }
  }, { now: 2000 });
  const result = cache.entries.dirty.result;

  assert.equal(result.pronunciation.audio.length, 1);
  assert.equal(result.sources.length, 1);
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].ttsLang, "it-IT");
  assert.equal(result.root, "source root");
  assert.equal(result.domainHint, "research");
  assert.deepEqual(result.variants, ["studio variant", "regional variant"]);
  assert.equal(result.alternateResults[0].root, "alternate root");
  assert.equal(result.alternateResults[0].domainHint, "alternate research");
  assert.deepEqual(result.alternateResults[0].variants, ["alternate variant"]);
  assert.deepEqual(result.trustSignals, ["source-backed", "moderator-reviewed"]);
  assert.equal(result.notes, "Regional pronunciation variant");
  assert.equal(Object.hasOwn(result, "pageUrl"), false);
  assert.equal(Object.hasOwn(result, "headers"), false);
  assert.equal(Object.hasOwn(result.pronunciation.audio[0], "extra"), false);
  assert.equal(Object.hasOwn(result.alternateResults[0], "pageUrl"), false);
});
