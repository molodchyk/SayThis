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
  sourceLabelForStatus,
  updateCommunityEntries
} from "../src/resolver-core.js";
import {
  createLookupKey as createTextLookupKey,
  detectScript as detectTextScript,
  normalizeSelection as normalizeTextSelection
} from "../src/resolver/text.js";
import {
  languageNameFromCode,
  scriptHintForScript,
  ttsLangFromLanguage
} from "../src/resolver/language.js";
import {
  confidenceRank,
  normalizeConfidence,
  normalizeSourceStatus,
  sourceLabelForStatus as sourceLabelForStatusDirect,
  strongerConfidence
} from "../src/resolver/status.js";
import {
  normalizeAliases as normalizeValueAliases,
  normalizeCount as normalizeValueCount,
  normalizeLongValue,
  normalizeTrustSignals as normalizeValueTrustSignals,
  normalizeUrl as normalizeValueUrl
} from "../src/resolver/values.js";
import {
  getBestAudio as getBestAudioDirect,
  mapResultAudioUrls as mapResultAudioUrlsDirect,
  mergeAudioItems,
  normalizePronunciation as normalizePronunciationDirect
} from "../src/resolver/audio.js";
import {
  applyCommunitySummary as applyCommunitySummaryDirect,
  communitySummary,
  emptyCommunity as emptyCommunityDirect,
  findCommunityEntry,
  normalizeCommunityEntries as normalizeCommunityEntriesDirect,
  updateCommunityEntries as updateCommunityEntriesDirect
} from "../src/resolver/community.js";

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
  assert.ok(manifest.host_permissions.includes("https://*.wiktionary.org/*"));
  assert.equal(manifest.host_permissions.includes("https://*/*"), false);
  assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
  assert.ok(manifest.host_permissions.includes("https://commons.wikimedia.org/*"));
  assert.ok(manifest.content_security_policy.extension_pages.includes("media-src 'self' https:"));
  assert.ok(manifest.web_accessible_resources[0].resources.includes("assets/audio/public/*"));
});

test("normalizes aliases with diacritics", () => {
  assert.equal(createLookupKey(" Nguyễn "), "nguyen");
});

test("keeps resolver text helpers behind direct and compatibility exports", () => {
  assert.equal(normalizeTextSelection("  alpha\n beta  "), "alpha beta");
  assert.equal(createTextLookupKey(" Nguyễn "), createLookupKey(" Nguyễn "));
  assert.deepEqual(detectTextScript("Αθήνα"), detectScript("Αθήνα"));
});

test("maps resolver language helpers from a narrow module", () => {
  assert.equal(ttsLangFromLanguage("hy"), "hy-AM");
  assert.equal(ttsLangFromLanguage("pt-BR"), "pt-BR");
  assert.equal(languageNameFromCode("tr"), "Turkish");
  assert.equal(scriptHintForScript("Greek").ttsLang, "el-GR");
  assert.deepEqual(scriptHintForScript("Unknown"), {});
});

test("maps resolver status helpers from a narrow module", () => {
  assert.equal(confidenceRank("high"), 5);
  assert.equal(normalizeConfidence("unclear"), "unknown");
  assert.equal(normalizeSourceStatus("verified-audio"), "verified-audio");
  assert.equal(normalizeSourceStatus("generated"), "unknown");
  assert.equal(strongerConfidence("low", "medium"), "medium");
  assert.equal(sourceLabelForStatusDirect("structured-source"), "Structured source");
  assert.equal(sourceLabelForStatus("structured-source"), sourceLabelForStatusDirect("structured-source"));
});

test("normalizes resolver values from a narrow module", () => {
  assert.deepEqual(normalizeValueAliases("Alpha; Beta; Alpha"), ["Alpha", "Beta"]);
  assert.deepEqual(normalizeValueTrustSignals(["source-backed", "source-backed", "audio-backed"]), ["source-backed", "audio-backed"]);
  assert.equal(normalizeValueUrl(" https://example.com/audio.ogg "), "https://example.com/audio.ogg");
  assert.equal(normalizeValueUrl("http://example.com/audio.ogg"), "");
  assert.equal(normalizeLongValue(` ${"a".repeat(2050)} `).length, 2048);
  assert.equal(normalizeValueCount(12.8), 12);
  assert.equal(normalizeValueCount(-1), 0);
});

test("maps resolver audio helpers from a narrow module", () => {
  const pronunciation = normalizePronunciationDirect({
    ipa: "/a/",
    audio: [
      { url: " assets/audio/public/a.ogg ", label: " One ", source: " Local ", quality: "verified" },
      { url: "", label: "empty" }
    ]
  });

  assert.equal(pronunciation.ipa, "/a/");
  assert.equal(pronunciation.audio.length, 1);
  assert.equal(pronunciation.audio[0].url, "assets/audio/public/a.ogg");
  assert.equal(getBestAudioDirect({ pronunciation }).url, "assets/audio/public/a.ogg");
  assert.equal(getBestAudio({ pronunciation }).url, "assets/audio/public/a.ogg");

  const mapped = mapResultAudioUrlsDirect({ pronunciation }, (url) => `chrome-extension://id/${url}`);

  assert.equal(mapped.pronunciation.audio[0].url, "chrome-extension://id/assets/audio/public/a.ogg");
  assert.equal(mergeAudioItems(pronunciation.audio, pronunciation.audio).length, 1);
});

test("maps resolver community helpers from a narrow module", () => {
  const corrected = updateCommunityEntriesDirect({}, " Exampleterm ", {
    kind: "correction",
    sourceForm: " Exampleterm ",
    aliases: "Alias; Alias",
    root: "example root",
    simple: "eg-ZAM-pluh-term",
    audioUrl: "https://example.com/audio.ogg",
    sourceUrl: "https://example.com/source",
    variantNote: "Regional studio variant"
  });
  const confirmed = updateCommunityEntriesDirect(corrected, "Exampleterm", { kind: "confirm" });
  const normalized = normalizeCommunityEntriesDirect(confirmed);
  const found = findCommunityEntry("alias", normalized);
  const summarized = applyCommunitySummaryDirect({ id: "result" }, found);

  assert.equal(found.sourceForm, "Exampleterm");
  assert.equal(found.root, "example root");
  assert.deepEqual(found.aliases, ["Alias"]);
  assert.deepEqual(found.trustSignals, ["local-correction", "source-backed", "audio-backed", "variant-noted", "root-noted", "local-confirmed"]);
  assert.equal(summarized.community.confirmations, 1);
  assert.deepEqual(communitySummary(found), summarized.community);
  assert.deepEqual(emptyCommunityDirect(), {
    confirmations: 0,
    flags: 0,
    requests: 0,
    corrections: 0,
    updatedAt: ""
  });
  assert.deepEqual(normalizeCommunityEntries(confirmed), normalized);
  assert.deepEqual(applyCommunitySummary({ id: "result" }, found), summarized);
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
    root: "example root",
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
  assert.equal(result.root, "example root");
  assert.equal(result.pronunciation.simple, "eg-ZAM-pluh-term");
  assert.ok(result.sources.some((source) => source.url === "https://example.com/exampleterm"));
  assert.deepEqual(result.trustSignals, ["local-correction", "source-backed", "root-noted", "local-confirmed"]);
  assert.equal(result.community.confirmations, 1);
  assert.equal(resultToSpeechOptions(result).text, "eg-ZAM-pluh-term");

  const aliasResult = resolveTerm("Sampleterm", {
    entries: [],
    communityEntries: entries
  });
  assert.equal(aliasResult.id, "community:sampleterm");
  assert.equal(aliasResult.sourceForm, "Exampleterm");
});

test("keeps community audio corrections on source-form fallback speech", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    sourceForm: "Exampleterm",
    simple: "eg-ZAM-pluh-term",
    audioUrl: "https://example.com/exampleterm.ogg"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(result.pronunciation.simple, "eg-ZAM-pluh-term");
  assert.equal(result.pronunciation.audio[0].url, "https://example.com/exampleterm.ogg");
  assert.equal(resultToSpeechOptions(result).text, "Exampleterm");
});

test("uses variant-only local community corrections", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    variantNote: "Regional pronunciation variant"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(result.id, "community:exampleterm");
  assert.equal(result.notes, "Regional pronunciation variant");
  assert.equal(result.community.corrections, 1);
});

test("captures structured missing requests without promoting them to answers", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "missing",
    sourceForm: "Exampleterm",
    aliases: "Example term",
    language: "la",
    root: "example root",
    simple: "eg-ZAM-pluh-term",
    sourceUrl: "https://example.com/exampleterm"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(entries.exampleterm.requests, 1);
  assert.equal(entries.exampleterm.request.root, "example root");
  assert.deepEqual(entries.exampleterm.request.aliases, ["Example term"]);
  assert.deepEqual(entries.exampleterm.trustSignals, ["source-backed", "requested"]);
  assert.equal(result.id, "fallback:exampleterm");
  assert.equal(result.community.requests, 1);
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
      trustSignals: "source-backed; moderator-reviewed; source-backed",
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
  assert.deepEqual(entries.exampleterm.trustSignals, ["source-backed", "moderator-reviewed"]);
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

test("uses browser language display names for valid source codes", () => {
  const result = createRemoteStructuredResult("Exampleterm", {
    id: "remote:language",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "tr"
  });

  assert.equal(result.languageName, "Turkish");
  assert.equal(result.ttsLang, "tr-TR");

  const regional = createRemoteStructuredResult("Exampleterm", {
    id: "remote:regional-language",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "pt-BR"
  });

  assert.match(regional.languageName, /Portuguese/);
  assert.equal(regional.ttsLang, "pt-BR");
});

test("maps structured source language codes to speech locales", () => {
  const cases = [
    ["hy", "hy-AM"],
    ["hi", "hi-IN"],
    ["th", "th-TH"],
    ["bg", "bg-BG"],
    ["sr", "sr-RS"]
  ];

  for (const [language, ttsLang] of cases) {
    const result = createRemoteStructuredResult("Exampleterm", {
      id: `remote:${language}`,
      display: "Exampleterm",
      sourceForm: "Exampleterm",
      language
    });

    assert.equal(result.ttsLang, ttsLang);
  }
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
  assert.deepEqual(merged.trustSignals, ["source-backed"]);
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
  assert.equal(resultToSpeechOptions(result).text, "AudioTerm");
  assert.deepEqual(result.trustSignals, ["source-backed", "audio-backed"]);
});

test("uses remote simple guides for no-audio speech", () => {
  const result = createRemoteStructuredResult("Exampleterm", {
    id: "remote:simple",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    variants: ["Regional form", "Regional form"],
    pronunciation: { simple: "eg-ZAM-pluh-term" }
  });

  assert.equal(resultToSpeechOptions(result).text, "eg-ZAM-pluh-term");
  assert.deepEqual(result.variants, ["Regional form"]);
});

test("merges verified audio into a matching structured result", () => {
  const structured = createRemoteStructuredResult("Chiaroscuro", {
    id: "wiktionary:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    category: "dictionary term",
    origin: "Italian root",
    pronunciation: { ipa: "/kja.roˈsku.ro/" },
    evidence: ["IPA from Wiktionary"],
    sources: [{ label: "Wiktionary", url: "https://en.wiktionary.org/wiki/chiaroscuro" }]
  });
  const audio = createRemoteStructuredResult("Chiaroscuro", {
    id: "forvo:chiaroscuro",
    display: "chiaroscuro",
    sourceForm: "chiaroscuro",
    language: "it",
    pronunciation: {
      audio: [{
        url: "https://example.com/chiaroscuro.ogg",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    },
    evidence: ["Pronunciation audio from Forvo"],
    sources: [{ label: "Forvo word page", url: "https://forvo.com/word/chiaroscuro/#it" }]
  });
  const merged = mergeRemoteResult(structured, audio);

  assert.equal(merged.id, "wiktionary:chiaroscuro");
  assert.equal(merged.sourceStatus, "verified-audio");
  assert.equal(merged.confidence, "high");
  assert.equal(merged.origin, "Italian root");
  assert.equal(merged.pronunciation.ipa, "/kja.roˈsku.ro/");
  assert.equal(merged.pronunciation.audio[0].url, "https://example.com/chiaroscuro.ogg");
  assert.ok(merged.evidence.includes("IPA from Wiktionary"));
  assert.ok(merged.evidence.includes("Pronunciation audio from Forvo"));
  assert.ok(merged.sources.some((source) => source.label === "Forvo word page"));
  assert.deepEqual(merged.alternateResults, []);
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
  assert.equal(merged.alternateResults[0].ttsLang, "it-IT");
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
