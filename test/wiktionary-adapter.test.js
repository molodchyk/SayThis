import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWiktionaryResult,
  parseWiktionaryPronunciation
} from "../src/wiktionary-adapter.js";

const CHIAROSCURO_WIKITEXT = `
==English==

===Etymology===
Borrowed from {{bor|en|it|chiaroscuro}}, from {{m|it|chiaro}} + {{m|it|oscuro}}.

===Pronunciation===
* {{IPA|en|/kiˌɑːɹəˈskʊəɹoʊ/}}
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

test("parses IPA, audio, language, and etymology from Wiktionary wikitext", () => {
  const parsed = parseWiktionaryPronunciation(CHIAROSCURO_WIKITEXT);

  assert.equal(parsed.language, "en");
  assert.equal(parsed.languageName, "English");
  assert.equal(parsed.ipa, "/kiˌɑːɹəˈskʊəɹoʊ/");
  assert.equal(parsed.audioFile, "En-us-chiaroscuro.ogg");
  assert.equal(parsed.origin, "Borrowed from chiaroscuro, from chiaro + oscuro.");
});

test("builds a verified-audio pronunciation result from Wiktionary", () => {
  const result = buildWiktionaryResult("chiaroscuro", "chiaroscuro", CHIAROSCURO_WIKITEXT);

  assert.equal(result.id, "wiktionary:chiaroscuro");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "/kiˌɑːɹəˈskʊəɹoʊ/");
  assert.equal(result.pronunciation.audio[0].source, "Wiktionary");
  assert.ok(result.origin.includes("chiaro"));
});

test("uses the language section that carries pronunciation data", () => {
  const parsed = parseWiktionaryPronunciation(SECTIONED_WIKITEXT);

  assert.equal(parsed.language, "it");
  assert.equal(parsed.languageName, "Italian");
  assert.equal(parsed.ipa, "/ˈlu.me/");
  assert.equal(parsed.audioFile, "It-lume.ogg");
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
