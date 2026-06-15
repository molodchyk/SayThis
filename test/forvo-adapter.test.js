import assert from "node:assert/strict";
import test from "node:test";
import {
  buildForvoResult,
  buildForvoWordPronunciationsUrl,
  FORVO_API_ORIGIN,
  selectBestForvoItem
} from "../src/forvo-adapter.js";

test("builds a Forvo word-pronunciations API URL", () => {
  const url = buildForvoWordPronunciationsUrl("chiaroscuro", " api-key ", {
    language: "IT",
    limit: 9
  });

  assert.equal(url, `${FORVO_API_ORIGIN}key/api-key/format/json/action/word-pronunciations/word/chiaroscuro/order/rate-desc/limit/9/language/it`);
});

test("requires a selected word and API key", () => {
  assert.equal(buildForvoWordPronunciationsUrl("", "key"), "");
  assert.equal(buildForvoWordPronunciationsUrl("word", ""), "");
});

test("selects the best rated Forvo item with audio", () => {
  const best = selectBestForvoItem({
    items: [{
      id: 1,
      word: "test",
      pathmp3: "",
      rate: 100
    }, {
      id: 2,
      word: "test",
      pathmp3: "https://audio.example/test.mp3",
      rate: 1,
      code: "en"
    }, {
      id: 3,
      word: "test",
      pathogg: "https://audio.example/test.ogg",
      rate: 5,
      code: "en"
    }]
  });

  assert.equal(best.id, 3);
});

test("builds a verified-audio result from Forvo payload", () => {
  const result = buildForvoResult("chiaroscuro", {
    items: [{
      id: 42,
      word: "chiaroscuro",
      code: "it",
      langname: "Italian",
      country: "Italy",
      username: "speaker",
      pathogg: "https://audio.example/chiaroscuro.ogg",
      pathmp3: "https://audio.example/chiaroscuro.mp3",
      rate: 4
    }]
  });

  assert.equal(result.id, "forvo:42");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(result.language, "it");
  assert.equal(result.languageName, "Italian");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/chiaroscuro.ogg");
  assert.equal(result.pronunciation.audio[0].source, "Forvo");
  assert.ok(result.evidence.includes("Pronunciation audio from Forvo"));
  assert.ok(result.sources.some((source) => source.label === "Pronunciations by Forvo"));
});
