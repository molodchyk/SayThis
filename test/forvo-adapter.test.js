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

test("keeps long Forvo audio URLs intact", () => {
  const longAudioUrl = `https://audio.example/${"a".repeat(180)}/term.ogg`;
  const best = selectBestForvoItem({
    items: [{
      id: 4,
      word: "term",
      pathogg: longAudioUrl,
      rate: 5,
      code: "en"
    }]
  });
  const result = buildForvoResult("term", { items: [best] });

  assert.equal(best.pathogg, longAudioUrl);
  assert.equal(result.pronunciation.audio[0].url, longAudioUrl);
});

test("filters Forvo payloads by requested lookup word and language", () => {
  const payload = {
    items: [{
      id: 1,
      word: "different",
      code: "it",
      pathogg: "https://audio.example/different.ogg",
      rate: 5
    }, {
      id: 2,
      word: "chiaroscuro",
      code: "en",
      pathogg: "https://audio.example/chiaroscuro-en.ogg",
      rate: 5
    }, {
      id: 3,
      word: "chiaroscuro",
      code: "it",
      pathogg: "https://audio.example/chiaroscuro-it.ogg",
      rate: 4
    }]
  };

  const best = selectBestForvoItem(payload, {
    lookupWord: "chiaroscuro",
    language: "it"
  });
  const result = buildForvoResult("selected term", payload, {
    lookupWord: "chiaroscuro",
    language: "it"
  });

  assert.equal(best.id, 3);
  assert.equal(result.sourceForm, "chiaroscuro");
  assert.equal(result.language, "it");
  assert.equal(result.pronunciation.audio[0].url, "https://audio.example/chiaroscuro-it.ogg");
});

test("rejects Forvo payloads that do not match requested lookup constraints", () => {
  const payload = {
    items: [{
      id: 1,
      word: "chiaroscuro",
      code: "en",
      pathogg: "https://audio.example/chiaroscuro-en.ogg",
      rate: 5
    }]
  };

  assert.equal(buildForvoResult("selected term", payload, {
    lookupWord: "chiaroscuro",
    language: "it"
  }), null);
  assert.equal(selectBestForvoItem(payload, {
    lookupWord: "different",
    language: "en"
  }), null);
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

test("preserves additional same-language Forvo recordings", () => {
  const result = buildForvoResult("chiaroscuro", {
    items: [{
      id: 1,
      word: "chiaroscuro",
      code: "it",
      langname: "Italian",
      country: "Italy",
      username: "primary",
      pathogg: "https://audio.example/chiaroscuro-1.ogg",
      rate: 5
    }, {
      id: 2,
      word: "chiaroscuro",
      code: "it",
      langname: "Italian",
      country: "Switzerland",
      username: "alternate",
      pathogg: "https://audio.example/chiaroscuro-2.ogg",
      rate: 4
    }, {
      id: 3,
      word: "chiaroscuro",
      code: "en",
      langname: "English",
      pathogg: "https://audio.example/chiaroscuro-en.ogg",
      rate: 4
    }, {
      id: 4,
      word: "sfumato",
      code: "it",
      langname: "Italian",
      pathogg: "https://audio.example/sfumato.ogg",
      rate: 4
    }]
  });

  assert.deepEqual(result.pronunciation.audio.map((item) => item.url), [
    "https://audio.example/chiaroscuro-1.ogg",
    "https://audio.example/chiaroscuro-2.ogg"
  ]);
  assert.match(result.pronunciation.audio[1].label, /alternate/);
  assert.ok(result.evidence.includes("Additional Forvo recordings: 1"));
});

test("keeps selected query when Forvo returns a resolved source word", () => {
  const result = buildForvoResult("Quixote", {
    items: [{
      id: 43,
      word: "Quijote",
      code: "es",
      langname: "Spanish",
      pathogg: "https://audio.example/quijote.ogg",
      rate: 5
    }]
  });

  assert.equal(result.query, "Quixote");
  assert.equal(result.display, "Quijote");
  assert.equal(result.sourceForm, "Quijote");
  assert.equal(result.language, "es");
});
