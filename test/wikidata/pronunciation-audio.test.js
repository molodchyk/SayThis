import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult,
  commonsRedirectUrl
} from "../../src/sources/wikidata-adapter.js";

test("extracts pronunciation audio and IPA claims", () => {
  const result = buildWikidataResult("Example", {
    id: "Q1",
    label: "Example",
    language: "en"
  }, {
    id: "Q1",
    labels: {
      en: { language: "en", value: "Example" }
    },
    claims: {
      P443: [{
        mainsnak: {
          datavalue: {
            value: "Example pronunciation.ogg"
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: "Example pronunciation alternate.ogg"
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: "Example pronunciation.ogg"
          }
        }
      }],
      P898: [{
        mainsnak: {
          datavalue: {
            value: "ig-ZAHM-pul"
          }
        }
      }]
    },
    aliases: {
      en: [{ language: "en", value: "Sample entry" }]
    }
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.deepEqual(result.aliases, ["Sample entry"]);
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "ig-ZAHM-pul");
  assert.equal(result.pronunciation.audio.length, 2);
  assert.equal(result.pronunciation.audio[0].url, commonsRedirectUrl("Example pronunciation.ogg"));
  assert.equal(result.pronunciation.audio[1].url, commonsRedirectUrl("Example pronunciation alternate.ogg"));
  assert.equal(result.pronunciation.audio[1].label, "Pronunciation audio 2");
  assert.ok(result.evidence.includes("Additional Wikidata pronunciation audio: 1"));
});

test("prefers Wikidata pronunciation audio with a matching language qualifier", () => {
  const result = buildWikidataResult("Exampletown", {
    id: "QaudioLang",
    label: "Exampletown",
    language: "en",
    description: "settlement"
  }, {
    id: "QaudioLang",
    labels: {
      en: { language: "en", value: "Exampletown" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "pl", text: "Przyklad" }
          }
        }
      }],
      P443: [{
        mainsnak: {
          datavalue: {
            value: "Exampletown English.ogg"
          }
        },
        qualifiers: {
          P407: [{
            datavalue: {
              value: { id: "Q1860", "numeric-id": 1860 }
            }
          }]
        }
      }, {
        mainsnak: {
          datavalue: {
            value: "Exampletown unqualified.ogg"
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: "Exampletown Polish.ogg"
          }
        },
        qualifiers: {
          P407: [{
            datavalue: {
              value: { id: "Q809", "numeric-id": 809 }
            }
          }]
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.language, "pl");
  assert.equal(result.sourceStatus, "verified-audio");
  assert.deepEqual(result.pronunciation.audio.map((item) => item.url), [
    commonsRedirectUrl("Exampletown Polish.ogg"),
    commonsRedirectUrl("Exampletown unqualified.ogg")
  ]);
});

test("ranks Lingua Libre Wikidata pronunciation audio as native-speaker audio", () => {
  const result = buildWikidataResult("Exampletown", {
    id: "QaudioLL",
    label: "Exampletown",
    language: "en",
    description: "term"
  }, {
    id: "QaudioLL",
    labels: {
      en: { language: "en", value: "Exampletown" }
    },
    claims: {
      P443: [{
        mainsnak: {
          datavalue: {
            value: "Exampletown generic.ogg"
          }
        }
      }, {
        mainsnak: {
          datavalue: {
            value: "LL-Q150 (fra)-Speaker-Exampletown.wav"
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.pronunciation.audio[0].url, commonsRedirectUrl("LL-Q150 (fra)-Speaker-Exampletown.wav"));
  assert.equal(result.pronunciation.audio[0].label, "Lingua Libre audio 2");
  assert.equal(result.pronunciation.audio[0].source, "Wikimedia Commons (Lingua Libre)");
  assert.equal(result.pronunciation.audio[0].quality, "native-speaker");
  assert.equal(result.pronunciation.audio[1].quality, "verified");
});
