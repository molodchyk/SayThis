import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikidataResult,
  commonsRedirectUrl
} from "../src/wikidata-adapter.js";

test("prefers native label claims over English labels", () => {
  const result = buildWikidataResult("Athens", {
    id: "Q1524",
    label: "Athens",
    language: "en",
    description: "capital city"
  }, {
    id: "Q1524",
    labels: {
      en: { language: "en", value: "Athens" },
      el: { language: "el", value: "Αθήνα" }
    },
    descriptions: {
      en: { language: "en", value: "capital city of Greece" }
    },
    claims: {
      P1705: [{
        mainsnak: {
          datavalue: {
            value: { language: "el", text: "Αθήνα" }
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceForm, "Αθήνα");
  assert.equal(result.language, "el");
  assert.equal(result.confidence, "medium");
  assert.ok(result.evidence.some((item) => item.includes("native label")));
});

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
      }],
      P898: [{
        mainsnak: {
          datavalue: {
            value: "ɪɡˈzɑːmpəl"
          }
        }
      }]
    },
    aliases: {}
  });

  assert.equal(result.sourceStatus, "verified-audio");
  assert.equal(result.confidence, "high");
  assert.equal(result.pronunciation.ipa, "ɪɡˈzɑːmpəl");
  assert.equal(result.pronunciation.audio[0].url, commonsRedirectUrl("Example pronunciation.ogg"));
});

