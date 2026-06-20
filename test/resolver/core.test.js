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
  normalizeCommunityEntries,
  resolveTerm,
  resultToSpeechOptions,
  updateCommunityEntries
} from "../../src/resolver-core.js";
import {
  createLookupKey as createTextLookupKey,
  detectScript as detectTextScript,
  normalizeSelection as normalizeTextSelection
} from "../../src/resolver/text.js";
import {
  normalizeAliases as normalizeValueAliases,
  normalizeCount as normalizeValueCount,
  normalizeLongValue,
  normalizeTrustSignals as normalizeValueTrustSignals,
  normalizeUrl as normalizeValueUrl
} from "../../src/resolver/values.js";
import {
  applyCommunitySummary as applyCommunitySummaryDirect,
  communitySummary,
  emptyCommunity as emptyCommunityDirect,
  findCommunityEntry,
  normalizeCommunityEntries as normalizeCommunityEntriesDirect,
  updateCommunityEntries as updateCommunityEntriesDirect
} from "../../src/resolver/community.js";

const seedData = JSON.parse(await readFile(new URL("../../data/pronunciation-seed.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../../manifest.json", import.meta.url), "utf8"));

test("manifest exposes extension resolver capabilities", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.options_ui.page, "src/options/options.html");
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
  assert.ok(manifest.host_permissions.includes("https://api.molodchyk.com/*"));
  assert.ok(manifest.host_permissions.includes("https://audio.molodchyk.com/*"));
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

test("normalizes resolver values from a narrow module", () => {
  assert.deepEqual(normalizeValueAliases("Alpha; Beta; Alpha"), ["Alpha", "Beta"]);
  assert.deepEqual(normalizeValueTrustSignals(["source-backed", "source-backed", "audio-backed"]), ["source-backed", "audio-backed"]);
  assert.equal(normalizeValueUrl(" https://example.com/audio.ogg "), "https://example.com/audio.ogg");
  assert.equal(normalizeValueUrl("http://example.com/audio.ogg"), "");
  assert.equal(normalizeLongValue(` ${"a".repeat(2050)} `).length, 2048);
  assert.equal(normalizeValueCount(12.8), 12);
  assert.equal(normalizeValueCount(-1), 0);
});

test("maps resolver community helpers from a narrow module", () => {
  const corrected = updateCommunityEntriesDirect({}, " Exampleterm ", {
    kind: "correction",
    sourceForm: " Exampleterm ",
    aliases: "Alias; Alias",
    language: "Polish",
    ttsLang: "Polish",
    root: "example root",
    domainHint: "research",
    variants: "studio variant; studio variant",
    simple: "eg-ZAM-pluh-term",
    audioUrl: "https://example.com/audio.ogg",
    sourceUrl: "https://example.com/source",
    variantNote: "Regional studio variant"
  });
  const confirmed = updateCommunityEntriesDirect(corrected, "Exampleterm", { kind: "confirm" });
  const normalized = normalizeCommunityEntriesDirect(confirmed);
  const found = findCommunityEntry("alias", normalized);
  const foundVariant = findCommunityEntry(createLookupKey("studio variant"), normalized);
  const summarized = applyCommunitySummaryDirect({ id: "result" }, found);

  assert.equal(found.sourceForm, "Exampleterm");
  assert.equal(found.language, "pl");
  assert.equal(found.ttsLang, "pl-PL");
  assert.equal(foundVariant, found);
  assert.equal(found.root, "example root");
  assert.equal(found.domainHint, "research");
  assert.deepEqual(found.aliases, ["Alias"]);
  assert.deepEqual(found.variants, ["studio variant"]);
  assert.deepEqual(found.trustSignals, ["local-correction", "source-backed", "audio-backed", "variant-noted", "root-noted", "local-confirmed"]);
  assert.equal(summarized.community.confirmations, 1);
  assert.deepEqual(communitySummary(found), summarized.community);
  assert.deepEqual(emptyCommunityDirect(), { confirmations: 0, flags: 0, requests: 0, corrections: 0, updatedAt: "" });
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
  assert.equal(result.languageName, "Arabic-script term");
  assert.equal(result.ttsLang, "");
});

test("uses local community correction before fallback", () => {
  const firstPass = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    sourceForm: "Exampleterm",
    aliases: "Sampleterm; Example term",
    language: "it",
    root: "example root",
    domainHint: "research",
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
  assert.equal(result.domainHint, "research");
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

test("does not use explanatory community guide prose as speech text", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    sourceForm: "Exampleterm",
    simple: "English pronunciations vary; source form should use a matching voice"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(result.pronunciation.simple, "English pronunciations vary; source form should use a matching voice");
  assert.equal(resultToSpeechOptions(result).text, "Exampleterm");
});

test("uses variant-only local community corrections", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "correction",
    variants: "studio variant; regional variant"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(result.id, "community:exampleterm");
  assert.deepEqual(result.variants, ["studio variant", "regional variant"]);
  assert.deepEqual(result.trustSignals, ["local-correction", "variant-noted"]);
  assert.equal(result.community.corrections, 1);

  const variantResult = resolveTerm("regional variant", {
    entries: [],
    communityEntries: entries
  });
  assert.equal(variantResult.id, "community:regional variant");
  assert.equal(variantResult.sourceForm, "Exampleterm");
});

test("captures structured missing requests without promoting them to answers", () => {
  const entries = updateCommunityEntries({}, "Exampleterm", {
    kind: "missing",
    sourceForm: "Exampleterm",
    aliases: "Example term",
    language: "la",
    root: "example root",
    domainHint: "research",
    simple: "eg-ZAM-pluh-term",
    sourceUrl: "https://example.com/exampleterm"
  });
  const result = resolveTerm("Exampleterm", {
    entries: [],
    communityEntries: entries
  });

  assert.equal(entries.exampleterm.requests, 1);
  assert.equal(entries.exampleterm.request.root, "example root");
  assert.equal(entries.exampleterm.request.domainHint, "research");
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
        domainHint: "art history",
        variants: ["studio pronunciation"],
        simple: "kee-ah-roh-SKOO-roh",
        trustSignals: ["moderator-reviewed", "source-backed"]
      }
    }
  });

  assert.deepEqual(result.trustSignals, ["moderator-reviewed", "source-backed"]);
  assert.equal(result.domainHint, "art history");
  assert.deepEqual(result.variants, ["studio pronunciation"]);
  assert.equal(result.pronunciation.simple, "kee-ah-roh-SKOO-roh");
});

test("preserves generated shared audio metadata on approved community entries", () => {
  const result = resolveTerm("Exampletown", {
    entries: [],
    communityEntries: {
      exampletown: {
        term: "Exampletown",
        sourceForm: "Przykladowo",
        language: "pl",
        ttsLang: "pl-PL",
        audioUrl: "https://community.example/audio/aud_1234567890abcdef",
        trustSignals: ["moderator-reviewed", "generated-audio", "audio-backed"],
        sourceStatus: "generated-audio"
      }
    }
  });

  assert.equal(result.sourceStatus, "generated-audio");
  assert.equal(result.sourceLabel, "Generated audio");
  assert.equal(result.ttsLang, "pl-PL");
  assert.equal(result.pronunciation.audio[0].quality, "generated");
  assert.equal(result.pronunciation.audio[0].label, "Generated shared audio");
  assert.equal(resultToSpeechOptions(result).options.lang, "pl-PL");
});

test("treats reviewed non-generated community audio as verified audio", () => {
  const result = resolveTerm("Exampletown", {
    entries: [],
    communityEntries: {
      exampletown: {
        term: "Exampletown",
        sourceForm: "Exampletown",
        language: "it",
        audioUrl: "https://community.example/audio/exampletown.ogg",
        trustSignals: ["moderator-reviewed", "source-backed", "audio-backed"]
      }
    }
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].quality, "source-backed");
  assert.equal(getBestAudio(result).quality, "source-backed");
});

test("treats curated approved community audio as curated audio", () => {
  const result = resolveTerm("Exampletown", {
    entries: [],
    communityEntries: {
      exampletown: {
        term: "Exampletown",
        sourceForm: "Exampletown",
        language: "it",
        audioUrl: "https://community.example/audio/exampletown.ogg",
        trustSignals: ["curator-reviewed", "audio-backed"]
      }
    }
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].quality, "curated");
  assert.equal(getBestAudio(result).quality, "curated");
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

test("does not promote unplayable remote audio metadata", () => {
  const result = createRemoteStructuredResult("AudioTerm", {
    id: "remote:audio-metadata",
    display: "AudioTerm",
    sourceForm: "AudioTerm",
    language: "en",
    pronunciation: {
      audio: [{
        label: "Pronunciation audio",
        quality: "verified"
      }]
    }
  });

  assert.equal(result.sourceStatus, "structured-source");
  assert.equal(result.sourceLabel, "Structured source");
  assert.equal(result.confidence, "medium");
  assert.deepEqual(result.pronunciation.audio, []);
  assert.deepEqual(result.trustSignals, ["source-backed"]);
});

test("downgrades explicit audio status when no playable audio remains", () => {
  const verified = createRemoteStructuredResult("AudioTerm", {
    id: "remote:missing-verified",
    display: "AudioTerm",
    sourceForm: "AudioTerm",
    language: "en",
    sourceStatus: "verified-audio",
    pronunciation: {
      audio: [{
        url: " ",
        label: "Pronunciation audio",
        quality: "verified"
      }]
    }
  });
  const generated = createRemoteStructuredResult("AudioTerm", {
    id: "remote:missing-generated",
    display: "AudioTerm",
    sourceForm: "AudioTerm",
    language: "en",
    sourceStatus: "generated-audio"
  });

  assert.equal(verified.sourceStatus, "structured-source");
  assert.equal(generated.sourceStatus, "structured-source");
  assert.deepEqual(verified.trustSignals, ["source-backed"]);
  assert.deepEqual(generated.trustSignals, ["source-backed"]);
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

test("uses selected surface speech when the source form is a different entity label", () => {
  const result = createRemoteStructuredResult("Targetname", {
    id: "remote:mismatched-source",
    display: "Targetname",
    sourceForm: "Староназва",
    aliases: ["Targetname"],
    language: "ru",
    ttsLang: "ru-RU"
  });

  assert.equal(resultToSpeechOptions(result).text, "Targetname");
  assert.equal(resultToSpeechOptions(result).options.lang, "ru-RU");
});

test("keeps matching Cyrillic source form when it romanizes to the selected surface", () => {
  const result = createRemoteStructuredResult("Pochetne", {
    id: "remote:matching-source",
    display: "Pochetne",
    sourceForm: "Почетне",
    language: "uk",
    ttsLang: "uk-UA"
  });

  assert.equal(resultToSpeechOptions(result).text, "Почетне");
  assert.equal(resultToSpeechOptions(result).options.lang, "uk-UA");
});

test("does not use explanatory remote guide prose as speech text", () => {
  const result = createRemoteStructuredResult("Exampleterm", {
    id: "remote:prose-guide",
    display: "Exampleterm",
    sourceForm: "Exampleterm",
    language: "en",
    pronunciation: { simple: "English pronunciations vary; source form should use a matching voice" }
  });

  assert.equal(result.pronunciation.simple, "English pronunciations vary; source form should use a matching voice");
  assert.equal(resultToSpeechOptions(result).text, "Exampleterm");
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
