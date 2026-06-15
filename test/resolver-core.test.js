import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyCommunitySummary,
  createRemoteStructuredResult,
  createLookupKey,
  detectScript,
  getBestAudio,
  mapResultAudioUrls,
  mergeRemoteResult,
  normalizeCommunityEntries,
  resolveTerm,
  resultToSpeechOptions,
  updateCommunityEntries
} from "../src/resolver-core.js";

const seedData = JSON.parse(await readFile(new URL("../data/pronunciation-seed.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("manifest exposes extension resolver capabilities", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.options_ui.page, "src/options.html");
  assert.ok(manifest.permissions.includes("contextMenus"));
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("tts"));
  assert.equal(manifest.commands["pronounce-selection"].suggested_key.default, "Alt+Shift+S");
  assert.equal(manifest.commands["pronounce-selection-online"].suggested_key.default, "Alt+Shift+O");
  assert.ok(manifest.host_permissions.includes("https://www.wikidata.org/*"));
  assert.ok(manifest.host_permissions.includes("https://en.wiktionary.org/*"));
  assert.equal(manifest.host_permissions.includes("https://*/*"), false);
  assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
  assert.ok(manifest.host_permissions.includes("https://commons.wikimedia.org/*"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("media-src 'self' https:"));
  assert.ok(manifest.web_accessible_resources[0].resources.includes("assets/audio/public/*"));
});

test("normalizes aliases with diacritics", () => {
  assert.equal(createLookupKey(" Nguyễn "), "nguyen");
});

test("resolves bundled entries by alias", () => {
  const result = resolveTerm("Quixote", { entries: seedData.entries });

  assert.equal(result.id, "quixote");
  assert.equal(result.sourceForm, "Quijote");
  assert.equal(result.language, "es");
  assert.equal(result.sourceStatus, "structured-source");
  assert.equal(result.confidence, "medium");
});

test("detects non-Latin scripts and creates source-form fallback", () => {
  const script = detectScript("قطر");
  const result = resolveTerm("قطر", { entries: [] });

  assert.equal(script.script, "Arabic");
  assert.equal(result.sourceStatus, "generated-from-source");
  assert.equal(result.ttsLang, "ar");
});

test("uses local community correction before fallback", () => {
  const firstPass = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    sourceForm: "Exampleterm",
    aliases: "Sampleterm; Example term",
    language: "it",
    simple: "eg-ZAM-pluh-term",
    sourceUrl: "https://example.com/exampleterm"
  });
  const entries = updateCommunityEntries(firstPass, "Exampleterm", { kind: "confirm" });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(result.id, "community:exampleterm");
  assert.deepEqual(result.aliases, ["Sampleterm", "Example term"]);
  assert.equal(result.language, "it");
  assert.equal(result.pronunciation.simple, "eg-ZAM-pluh-term");
  assert.ok(result.sources.some((source) => source.url === "https://example.com/exampleterm"));
  assert.equal(result.community.confirmations, 1);

  const aliasResult = resolveTerm("Sampleterm", {
    entries: [],
    communityEntries: entries
  });
  assert.equal(aliasResult.id, "community:sampleterm");
  assert.equal(aliasResult.sourceForm, "Exampleterm");
});

test("normalizes imported local community entries", () => {
  const entries = normalizeCommunityEntries({
    raw: {
      term: " Exampleterm ",
      lookupKey: "exampleterm",
      confirmations: "2",
      flags: -4,
      requests: 3.8,
      corrections: "not a number",
      sourceForm: " Exampleterm ",
      aliases: "Sampleterm; Example term; Sampleterm",
      language: " it ",
      simple: " eg-ZAM-pluh-term ",
      sourceUrl: " https://example.com/exampleterm ",
      extra: "discarded"
    },
    empty: {
      term: ""
    }
  });

  assert.deepEqual(Object.keys(entries), ["exampleterm"]);
  assert.equal(entries.exampleterm.confirmations, 2);
  assert.equal(entries.exampleterm.flags, 0);
  assert.equal(entries.exampleterm.requests, 3);
  assert.equal(entries.exampleterm.corrections, 0);
  assert.deepEqual(entries.exampleterm.aliases, ["Sampleterm", "Example term"]);
  assert.equal(entries.exampleterm.sourceUrl, "https://example.com/exampleterm");
  assert.equal(Object.hasOwn(entries.exampleterm, "extra"), false);
});

test("keeps object-map keys for sparse imported local community entries", () => {
  const entries = normalizeCommunityEntries({
    sparsekey: {
      confirmations: 4,
      sourceForm: "Sparse Source"
    }
  });

  assert.deepEqual(Object.keys(entries), ["sparsekey"]);
  assert.equal(entries.sparsekey.term, "Sparse Source");
  assert.equal(entries.sparsekey.lookupKey, "sparsekey");
  assert.equal(entries.sparsekey.confirmations, 4);
});

test("drops unsafe correction links from local community memory", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    sourceForm: "Exampleterm",
    audioUrl: "javascript:alert(1)",
    sourceUrl: "http://example.com/source"
  });

  assert.equal(entries.exampleterm.audioUrl, "");
  assert.equal(entries.exampleterm.sourceUrl, "");
  assert.equal(entries.exampleterm.sourceForm, "Exampleterm");
});

test("applies community summary without replacing a structured result", () => {
  const result = createRemoteStructuredResult("Exampleterm", {
    id: "remote:exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "la",
    pronunciation: {
      audio: [{
        url: "https://example.com/exampleterm.ogg",
        quality: "verified"
      }]
    }
  });
  const entries = updateCommunityEntries({}, "Exampleterm", { kind: "confirm" });
  const updated = applyCommunitySummary(result, entries.exampleterm);

  assert.equal(updated.id, "remote:exampleterm");
  assert.equal(updated.sourceStatus, "verified-audio");
  assert.equal(updated.pronunciation.audio[0].url, "https://example.com/exampleterm.ogg");
  assert.equal(updated.community.confirmations, 1);
});

test("keeps trust signals on approved community entries", () => {
  const result = resolveTerm("Chiaroscuro", {
    entries: [],
    communityEntries: {
      chiaroscuro: {
        term: "Chiaroscuro",
        sourceForm: "chiaroscuro",
        simple: "kee-ah-roh-SKOO-roh",
        trustSignals: ["moderator-reviewed", "source-backed"]
      }
    }
  });

  assert.deepEqual(result.trustSignals, ["moderator-reviewed", "source-backed"]);
  assert.equal(result.pronunciation.simple, "kee-ah-roh-SKOO-roh");
});

test("creates speech options from resolved source form", () => {
  const result = resolveTerm("gnocchi", { entries: seedData.entries });
  const speech = resultToSpeechOptions(result, { rate: 0.62 });

  assert.equal(speech.text, "gnocchi");
  assert.equal(speech.options.lang, "it-IT");
  assert.equal(speech.options.rate, 0.62);
});

test("prefers remote structured result over best-effort fallback", () => {
  const local = resolveTerm("Unlistedterm", { entries: [] });
  const remote = createRemoteStructuredResult("Unlistedterm", {
    id: "remote:example",
    display: "Unlistedterm",
    sourceForm: "Unlistedterm",
    language: "la",
    category: "structured source match",
    evidence: ["Remote source"]
  });
  const merged = mergeRemoteResult(local, remote);

  assert.equal(merged.id, "remote:example");
  assert.equal(merged.language, "la");
});

test("promotes remote results with verified audio", () => {
  const result = createRemoteStructuredResult("AudioTerm", {
    id: "remote:audio",
    display: "AudioTerm",
    sourceForm: "AudioTerm",
    language: "en",
    pronunciation: {
      audio: [{
        url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    }
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(getBestAudio(result).quality, "verified");
});

test("preserves useful displaced remote candidates", () => {
  const structured = createRemoteStructuredResult("Exampleterm", {
    id: "wikidata:exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "la",
    pronunciation: { simple: "eg-ZAM-pluh-term" },
    evidence: ["Structured source candidate"]
  });
  const audio = createRemoteStructuredResult("Exampleterm", {
    id: "forvo:exampleterm",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    pronunciation: {
      audio: [{
        url: "https://example.com/exampleterm.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    evidence: ["Verified audio candidate"]
  });
  const merged = mergeRemoteResult(structured, audio);

  assert.equal(merged.id, "forvo:exampleterm");
  assert.equal(merged.alternateResults.length, 1);
  assert.equal(merged.alternateResults[0].id, "wikidata:exampleterm");
  assert.equal(merged.alternateResults[0].pronunciation.simple, "eg-ZAM-pluh-term");
});

test("does not expose best-effort fallback as an alternate candidate", () => {
  const fallback = resolveTerm("Unlistedterm", { entries: [] });
  const remote = createRemoteStructuredResult("Unlistedterm", {
    id: "remote:unlistedterm",
    display: "Unlistedterm",
    sourceForm: "Unlistedterm",
    language: "en",
    pronunciation: { simple: "un-LIS-ted-term" }
  });
  const merged = mergeRemoteResult(fallback, remote);

  assert.equal(merged.id, "remote:unlistedterm");
  assert.deepEqual(merged.alternateResults, []);
});

test("maps packaged audio paths to extension URLs", () => {
  const result = createRemoteStructuredResult("Packaged", {
    id: "packaged",
    display: "Packaged",
    sourceForm: "Packaged",
    language: "en",
    pronunciation: {
      audio: [{
        url: "assets/audio/public/packaged.ogg",
        label: "Curated pronunciation",
        quality: "verified"
      }, {
        url: "https://example.com/audio.ogg",
        label: "Remote pronunciation"
      }]
    }
  });
  const mapped = mapResultAudioUrls(result, (url) => `chrome-extension://id/${url}`);

  assert.equal(mapped.pronunciation.audio[0].url, "chrome-extension://id/assets/audio/public/packaged.ogg");
  assert.equal(mapped.pronunciation.audio[1].url, "https://example.com/audio.ogg");
});
