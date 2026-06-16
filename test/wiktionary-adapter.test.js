import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWiktionaryApiUrl,
  buildWiktionaryResult,
  parseWiktionaryPronunciation,
  wiktionaryPageUrl,
  wiktionarySourceLanguages
} from "../src/wiktionary-adapter.js";

const CHIAROSCURO_WIKITEXT = `
==English==

===Etymology===
Borrowed from {{bor|en|it|chiaroscuro}}, from {{m|it|chiaro}} + {{m|it|oscuro}}.

===Pronunciation===
* {{enPR|kē-är'ə-skûrō}}
* {{IPA|en|/kiˌɑːɹəˈskʊəɹoʊ/}}
* {{audio|en|En-us-chiaroscuro.ogg|Audio (US)}}
* {{audio|en|En-uk-chiaroscuro.ogg|Audio (UK)}}
* {{audio|en|En-us-chiaroscuro.ogg|Audio (US)}}

===Noun===
# The use of light and dark.
`;

const SECTIONED_WIKITEXT = `
==English==

===Noun===
# A rare studio term.

==Italian==

===Etymology===
From {{m|it|lume}}.

===Pronunciation===
* {{IPA|it|/ˈlu.me/}}
* {{audio|it|It-lume.ogg|Audio}}

==Portuguese==

===Pronunciation===
* {{IPA|pt|/ˈlu.mi/}}
`;

const TURKISH_WIKITEXT = `
==Turkish==

===Pronunciation===
* {{IPA|tr|/kaˈlem/}}

===Noun===
# Pen.
`;

const RESPELL_WIKITEXT = `
==English==

===Pronunciation===
* {{respell|en|kee|AH|roh|SKOOR|oh}}

===Noun===
# A term with a simple guide.
`;

const LOCAL_EDITION_WIKITEXT = `
==Wymowa==
* {{IPA|pl|/ˈpʂɨ.kwat/}}
* {{audio|pl|Pl-przyklad.ogg|audio}}
`;

test("parses IPA, audio, language, and etymology from Wiktionary wikitext", () => {
  const parsed = parseWiktionaryPronunciation(CHIAROSCURO_WIKITEXT);

  assert.equal(parsed.language, "en");
  assert.equal(parsed.languageName, "English");
  assert.equal(parsed.ipa, "/kiˌɑːɹəˈskʊəɹoʊ/");
  assert.equal(parsed.simple, "kē-är'ə-skûrō");
  assert.equal(parsed.audioFile, "En-us-chiaroscuro.ogg");
  assert.deepEqual(parsed.audioFiles, ["En-us-chiaroscuro.ogg", "En-uk-chiaroscuro.ogg"]);
  assert.equal(parsed.origin, "Borrowed from chiaroscuro, from chiaro + oscuro.");
});

test("builds a verified-audio pronunciation result from Wiktionary", () => {
  const result = buildWiktionaryResult("chiaroscuro", "chiaroscuro", CHIAROSCURO_WIKITEXT);

  assert.equal(result.id, "wiktionary:chiaroscuro");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "/kiˌɑːɹəˈskʊəɹoʊ/");
  assert.equal(result.pronunciation.simple, "kē-är'ə-skûrō");
  assert.equal(result.pronunciation.audio.length, 2);
  assert.equal(result.pronunciation.audio[0].source, "Wiktionary");
  assert.equal(result.pronunciation.audio[1].label, "Pronunciation audio 2");
  assert.ok(result.evidence.includes("Additional Wiktionary pronunciation audio: 1"));
  assert.ok(result.origin.includes("chiaro"));
  assert.equal(result.sources[0].url, "https://en.wiktionary.org/wiki/chiaroscuro");
});

test("uses the language section that carries pronunciation data", () => {
  const parsed = parseWiktionaryPronunciation(SECTIONED_WIKITEXT);

  assert.equal(parsed.language, "it");
  assert.equal(parsed.languageName, "Italian");
  assert.equal(parsed.ipa, "/ˈlu.me/");
  assert.equal(parsed.audioFile, "It-lume.ogg");
  assert.deepEqual(parsed.audioFiles, ["It-lume.ogg"]);
  assert.equal(parsed.origin, "From lume.");
});

test("builds alternate results for other pronunciation sections", () => {
  const result = buildWiktionaryResult("lume", "lume", SECTIONED_WIKITEXT);

  assert.equal(result.language, "it");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].language, "pt");
  assert.equal(result.alternateResults[0].pronunciation.ipa, "/ˈlu.mi/");
});

test("prefers a matching Wiktionary language section when hinted", () => {
  const parsed = parseWiktionaryPronunciation(SECTIONED_WIKITEXT, {
    preferredLanguage: "pt-BR"
  });
  const result = buildWiktionaryResult("lume", "lume", SECTIONED_WIKITEXT, {
    preferredLanguage: "pt"
  });

  assert.equal(parsed.language, "pt");
  assert.equal(parsed.languageName, "Portuguese");
  assert.equal(parsed.ipa, "/ˈlu.mi/");
  assert.equal(parsed.audioFile, "");
  assert.equal(result.language, "pt");
  assert.equal(result.sourceStatus, "structured-source");
  assert.equal(result.alternateResults.length, 1);
  assert.equal(result.alternateResults[0].language, "it");
  assert.equal(result.alternateResults[0].sourceStatus, "verified-audio");
});

test("maps additional Wiktionary language sections to source codes", () => {
  const parsed = parseWiktionaryPronunciation(TURKISH_WIKITEXT);
  const result = buildWiktionaryResult("kalem", "kalem", TURKISH_WIKITEXT);

  assert.equal(parsed.language, "tr");
  assert.equal(parsed.languageName, "Turkish");
  assert.equal(result.language, "tr");
  assert.equal(result.languageName, "Turkish");
  assert.equal(result.ttsLang, "tr-TR");
  assert.equal(result.pronunciation.ipa, "/kaˈlem/");
});

test("builds bounded Wiktionary edition URLs from language hints", () => {
  const url = new URL(buildWiktionaryApiUrl("kalem", "tr"));

  assert.equal(url.origin, "https://tr.wiktionary.org");
  assert.equal(url.searchParams.get("titles"), "kalem");
  assert.deepEqual(wiktionarySourceLanguages({
    languageHints: "pl, tr, pt-BR, invalid!, ru"
  }), ["en", "pl", "tr", "pt"]);
  assert.equal(wiktionaryPageUrl("przyklad", "pl"), "https://pl.wiktionary.org/wiki/przyklad");
  assert.equal(buildWiktionaryApiUrl("", "pl"), "");
});

test("uses source language fallback for local Wiktionary editions", () => {
  const parsed = parseWiktionaryPronunciation(LOCAL_EDITION_WIKITEXT, {
    sourceLanguage: "pl"
  });
  const result = buildWiktionaryResult("przyklad", "przyklad", LOCAL_EDITION_WIKITEXT, {
    sourceLanguage: "pl"
  });

  assert.equal(parsed.language, "pl");
  assert.equal(parsed.languageName, "");
  assert.equal(result.id, "wiktionary:przyklad:pl");
  assert.equal(result.language, "pl");
  assert.equal(result.languageName, "Polish");
  assert.equal(result.pronunciation.audio[0].url.includes("Pl-przyklad.ogg"), true);
  assert.ok(result.evidence.includes("Wiktionary edition: pl"));
  assert.equal(result.sources[0].url, "https://pl.wiktionary.org/wiki/przyklad");
});

test("captures Wiktionary respelling guides", () => {
  const parsed = parseWiktionaryPronunciation(RESPELL_WIKITEXT);
  const result = buildWiktionaryResult("example", "example", RESPELL_WIKITEXT);

  assert.equal(parsed.simple, "kee-AH-roh-SKOOR-oh");
  assert.equal(result.pronunciation.simple, "kee-AH-roh-SKOOR-oh");
  assert.equal(result.confidence, "low");
});
